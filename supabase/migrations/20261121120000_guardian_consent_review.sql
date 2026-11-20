-- Termo do responsável enviado pelo próprio aluno menor, na conta dele, com conferência do professor.
--
-- * Status: 'pendente' (sem arquivo) → 'em_analise' (aluno enviou, professor confere) → 'enviado' (aprovado).
--   O professor pode recusar (volta a 'pendente' com o motivo, que o aluno vê) ou enviar ele mesmo (já aprovado).
-- * Ao aprovar, o professor informa se o responsável autorizou uso de imagem e reconhecimento facial; só com "sim"
--   o aluno menor consegue concluir o aceite na conta (accept_image_consent não libera mais a imagem do menor sozinho).
-- * Storage: o aluno envia só para a pasta dele e só apaga arquivos que ainda não foram aprovados.

alter table public.student_guardian_consents
  drop constraint student_guardian_consents_status_check,
  drop constraint student_guardian_consents_file,
  add column reviewed_at timestamptz,
  add column reviewed_by uuid references public.profiles (id) on delete set null,
  add column rejected_reason text,
  add column rejected_at timestamptz,
  add constraint student_guardian_consents_status_check check (status in ('pendente', 'em_analise', 'enviado')),
  add constraint student_guardian_consents_file check (
    (status = 'pendente' and file_path is null and uploaded_at is null)
    or (status in ('em_analise', 'enviado') and file_path is not null and uploaded_at is not null)
  );

-- Conta logada é deste aluno (sem exigir aceite: é o caminho para conseguir o aceite).
create or replace function public.is_student_account(p_student_id uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.students s where s.id = p_student_id and s.profile_id = (select auth.uid()))
$$;

create policy guardian_consents_obj_insert_student on storage.objects for insert to authenticated
  with check (bucket_id = 'guardian-consents' and public.is_student_account(public.storage_path_owner(name)));
create policy guardian_consents_obj_delete_student on storage.objects for delete to authenticated
  using (
    bucket_id = 'guardian-consents'
    and public.is_student_account(public.storage_path_owner(name))
    and not exists (
      select 1 from public.student_guardian_consents c
      where c.file_path = storage.objects.name and c.status = 'enviado'
    )
  );

-- Professor que envia o termo: já vale como aprovado.
create or replace function public.set_guardian_consent_file(p_student_id uuid, p_path text)
returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  v_birth date;
  v_previous text;
begin
  if not public.can_manage_student(p_student_id) then
    raise exception 'Aluno não encontrado.';
  end if;
  select s.birth_date into v_birth from public.students s where s.id = p_student_id;
  if not public.is_minor(v_birth, public.today_sp()) then
    raise exception 'O termo do responsável é só para aluno menor de 18 anos.';
  end if;
  if p_path is null or public.storage_path_owner(p_path) is distinct from p_student_id
     or not exists (select 1 from storage.objects o where o.bucket_id = 'guardian-consents' and o.name = p_path) then
    raise exception 'Arquivo do termo não encontrado.';
  end if;

  select c.file_path into v_previous from public.student_guardian_consents c where c.student_id = p_student_id for update;
  insert into public.student_guardian_consents (student_id, file_path, status, uploaded_at, uploaded_by, reviewed_at, reviewed_by, updated_at)
  values (p_student_id, p_path, 'enviado', now(), (select auth.uid()), now(), (select auth.uid()), now())
  on conflict (student_id) do update
    set file_path = excluded.file_path,
        status = 'enviado',
        uploaded_at = excluded.uploaded_at,
        uploaded_by = excluded.uploaded_by,
        reviewed_at = excluded.reviewed_at,
        reviewed_by = excluded.reviewed_by,
        rejected_reason = null,
        rejected_at = null,
        updated_at = excluded.updated_at;
  return v_previous;
end $$;

-- Aluno (conta logada) envia o termo assinado: fica 'em_analise'. Devolve o arquivo anterior não aprovado (o app apaga).
create or replace function public.submit_guardian_consent_file(p_path text)
returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  v_student uuid;
  v_birth date;
  v_status text;
  v_previous text;
begin
  select s.id, s.birth_date into v_student, v_birth from public.students s where s.profile_id = (select auth.uid());
  if v_student is null then
    raise exception 'Conta sem aluno ligado.';
  end if;
  if not public.is_minor(v_birth, public.today_sp()) then
    raise exception 'O termo do responsável é só para aluno menor de 18 anos.';
  end if;
  if p_path is null or public.storage_path_owner(p_path) is distinct from v_student
     or not exists (select 1 from storage.objects o where o.bucket_id = 'guardian-consents' and o.name = p_path) then
    raise exception 'Arquivo do termo não encontrado.';
  end if;

  select c.status, c.file_path into v_status, v_previous
    from public.student_guardian_consents c where c.student_id = v_student for update;
  if v_status = 'enviado' then
    raise exception 'Seu termo já foi aprovado pelo professor.';
  end if;

  insert into public.student_guardian_consents (student_id, file_path, status, uploaded_at, uploaded_by, updated_at)
  values (v_student, p_path, 'em_analise', now(), (select auth.uid()), now())
  on conflict (student_id) do update
    set file_path = excluded.file_path,
        status = 'em_analise',
        uploaded_at = excluded.uploaded_at,
        uploaded_by = excluded.uploaded_by,
        reviewed_at = null,
        reviewed_by = null,
        rejected_reason = null,
        rejected_at = null,
        updated_at = excluded.updated_at;
  return v_previous;
end $$;

-- Professor confere o termo enviado pelo aluno. Aprovar: p_image_consent diz se o responsável autorizou uso de imagem
-- e reconhecimento facial. Recusar: volta a 'pendente' com o motivo; devolve o arquivo recusado (o app apaga).
create or replace function public.review_guardian_consent(
  p_student_id uuid, p_approve boolean, p_image_consent boolean default false, p_reason text default null
)
returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  v_status text;
  v_path text;
begin
  if not public.can_manage_student(p_student_id) then
    raise exception 'Aluno não encontrado.';
  end if;
  select c.status, c.file_path into v_status, v_path
    from public.student_guardian_consents c where c.student_id = p_student_id for update;
  if v_status is distinct from 'em_analise' then
    raise exception 'Não há termo aguardando conferência.';
  end if;

  if p_approve then
    update public.student_guardian_consents
       set status = 'enviado', reviewed_at = now(), reviewed_by = (select auth.uid()),
           rejected_reason = null, rejected_at = null, updated_at = now()
     where student_id = p_student_id;
    update public.students
       set image_consent_at = case when p_image_consent then coalesce(image_consent_at, now()) else null end
     where id = p_student_id;
    return null;
  end if;

  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'Diga ao aluno o que corrigir no termo.';
  end if;
  update public.student_guardian_consents
     set status = 'pendente', file_path = null, uploaded_at = null, uploaded_by = null,
         reviewed_at = now(), reviewed_by = (select auth.uid()),
         rejected_reason = left(trim(p_reason), 500), rejected_at = now(), updated_at = now()
   where student_id = p_student_id;
  return v_path;
end $$;

-- Conta do aluno: agora com nascimento, se é menor e a situação do termo.
create or replace function public.my_student_account()
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'student_id', s.id,
    'name', s.name,
    'gym_name', g.name,
    'account_consent_at', s.account_consent_at,
    'image_consent_at', s.image_consent_at,
    'birth_date', s.birth_date,
    'minor', public.is_minor(s.birth_date, public.today_sp()),
    'guardian_consent', (
      select jsonb_build_object('status', c.status, 'uploaded_at', c.uploaded_at, 'rejected_reason', c.rejected_reason)
      from public.student_guardian_consents c where c.student_id = s.id
    )
  )
  from public.students s
  join public.gyms g on g.id = s.gym_id
  where s.profile_id = (select auth.uid())
$$;

-- Aceite do aluno na conta. Menor: a imagem só vale se o professor aprovou o termo com a autorização do responsável;
-- o aluno só confirma a conta (não libera a imagem sozinho).
create or replace function public.accept_image_consent()
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_student uuid;
  v_birth date;
  v_image timestamptz;
begin
  select s.id, s.birth_date, s.image_consent_at into v_student, v_birth, v_image
    from public.students s where s.profile_id = (select auth.uid());
  if v_student is null then
    raise exception 'Conta sem aluno ligado.';
  end if;

  if public.is_minor(v_birth, public.today_sp()) then
    if not public.has_guardian_consent(v_student) then
      raise exception 'Envie o termo assinado pelo seu responsável e aguarde o professor aprovar.';
    end if;
    if v_image is null then
      raise exception 'Seu responsável não autorizou o uso de imagem no termo. Para ver suas presenças, peça um link ao professor.';
    end if;
    update public.students set account_consent_at = now() where id = v_student;
  else
    update public.students set account_consent_at = now(), image_consent_at = now() where id = v_student;
  end if;
end $$;

revoke execute on function public.is_student_account(uuid) from public, anon;
grant execute on function public.is_student_account(uuid) to authenticated;
revoke execute on function public.submit_guardian_consent_file(text) from public, anon;
grant execute on function public.submit_guardian_consent_file(text) to authenticated;
revoke execute on function public.review_guardian_consent(uuid, boolean, boolean, text) from public, anon;
grant execute on function public.review_guardian_consent(uuid, boolean, boolean, text) to authenticated;
