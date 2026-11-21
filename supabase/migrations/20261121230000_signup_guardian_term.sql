-- Termo do responsável anexado já no cadastro do aluno menor (cadastro sem link), mesmo sem confirmar o e-mail.
--
-- * O arquivo vai para o bucket privado `guardian-consents`, em `{profile_id}/termo-{código}.{pdf|jpg|png}` (o aluno
--   ainda não existe). Sem sessão, vale o mesmo código secreto do cadastro usado na foto (`student_photo_token`), uma
--   vez e por 24 horas; com a conta logada, o próprio dono envia.
-- * O pedido guarda o caminho (`guardian_file_path`). Quando o professor aprova, o termo vai para o aluno como
--   'em_analise' ("Termo para conferir"), e o professor confere como qualquer termo enviado pelo aluno.
-- * Policies do Storage passam a valer também pelo registro do termo (arquivo cujo caminho não começa pelo aluno).

alter table public.student_signup_requests
  add column guardian_upload_token text,
  add column guardian_file_path text;

-- O mesmo código do signUp serve para a foto e para o termo (cada um uma vez).
create or replace function public.signup_request_photo_token() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_token text;
begin
  select u.raw_user_meta_data ->> 'student_photo_token' into v_token from auth.users u where u.id = new.profile_id;
  if v_token ~ '^[a-f0-9]{32,64}$' then
    if new.photo_path is null then
      new.photo_upload_token := v_token;
    end if;
    if new.guardian_file_path is null then
      new.guardian_upload_token := v_token;
    end if;
  end if;
  return new;
end $$;

-- Pode enviar o termo sem login: `{profile_id}/termo-{código}.{ext}` de pedido pendente, sem termo, criado há < 24 h.
create or replace function public.can_upload_pending_signup_term(p_name text) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.student_signup_requests r
    where r.profile_id = public.storage_path_owner(p_name)
      and r.status = 'pending'
      and r.guardian_file_path is null
      and r.guardian_upload_token is not null
      and r.created_at > now() - interval '24 hours'
      and p_name in (
        r.profile_id::text || '/termo-' || r.guardian_upload_token || '.pdf',
        r.profile_id::text || '/termo-' || r.guardian_upload_token || '.jpg',
        r.profile_id::text || '/termo-' || r.guardian_upload_token || '.png'
      )
  )
$$;

-- Conta logada com pedido pendente envia o termo na pasta dela.
create or replace function public.can_upload_own_signup_term(p_name text) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select public.storage_path_owner(p_name) = (select auth.uid())
     and split_part(p_name, '/', 2) like 'termo-%'
     and exists (
       select 1 from public.student_signup_requests r
       where r.profile_id = (select auth.uid()) and r.status = 'pending'
     )
$$;

-- Professor vê/apaga o arquivo do termo pelo registro (termo do aluno dele) ou pelo pedido (academia dele).
create or replace function public.can_manage_guardian_file(p_name text) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
           select 1 from public.student_guardian_consents c
           where c.file_path = p_name and public.can_manage_student(c.student_id)
         )
      or exists (
           select 1 from public.student_signup_requests r
           where r.guardian_file_path = p_name and public.is_gym_member(r.gym_id)
         )
$$;

-- Aluno apaga um termo dele que ainda não foi aprovado (ao enviar outro).
create or replace function public.can_delete_own_guardian_file(p_name text) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.student_guardian_consents c
    join public.students s on s.id = c.student_id
    where c.file_path = p_name and c.status <> 'enviado' and s.profile_id = (select auth.uid())
  )
$$;

create policy guardian_consents_obj_insert_signup on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'guardian-consents'
              and (public.can_upload_pending_signup_term(name) or public.can_upload_own_signup_term(name)));
create policy guardian_consents_obj_select_record on storage.objects for select to authenticated
  using (bucket_id = 'guardian-consents' and public.can_manage_guardian_file(name));
create policy guardian_consents_obj_delete_record on storage.objects for delete to authenticated
  using (bucket_id = 'guardian-consents'
         and (public.can_manage_guardian_file(name) or public.can_delete_own_guardian_file(name)));

-- Liga o termo enviado sem login ao pedido. O código só vale uma vez para o termo.
create or replace function public.set_pending_signup_term(p_profile_id uuid, p_token text, p_ext text)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_path text := p_profile_id::text || '/termo-' || coalesce(p_token, '') || '.' || coalesce(p_ext, '');
begin
  if p_token is null or p_ext not in ('pdf', 'jpg', 'png') or not public.can_upload_pending_signup_term(v_path)
     or not exists (select 1 from storage.objects o where o.bucket_id = 'guardian-consents' and o.name = v_path) then
    raise exception 'Termo não encontrado. Envie de novo.';
  end if;
  update public.student_signup_requests
     set guardian_file_path = v_path, guardian_upload_token = null
   where profile_id = p_profile_id;
end $$;

-- Conta logada: liga o termo já enviado ao pedido pendente dela.
create or replace function public.set_my_signup_term(p_path text)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not public.can_upload_own_signup_term(p_path)
     or not exists (select 1 from storage.objects o where o.bucket_id = 'guardian-consents' and o.name = p_path) then
    raise exception 'Termo não encontrado. Envie de novo.';
  end if;
  update public.student_signup_requests
     set guardian_file_path = p_path, guardian_upload_token = null
   where profile_id = (select auth.uid()) and status = 'pending';
end $$;

-- Aprovado: o termo do cadastro vai para o aluno menor como "para conferir" (sem passar por cima de um aprovado).
create or replace function public.signup_request_apply_term() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.students s
    where s.id = new.student_id and public.is_minor(s.birth_date, public.today_sp())
  ) then
    insert into public.student_guardian_consents (student_id, file_path, status, uploaded_at, uploaded_by, updated_at)
    values (new.student_id, new.guardian_file_path, 'em_analise', new.created_at, new.profile_id, now())
    on conflict (student_id) do update
      set file_path = excluded.file_path,
          status = 'em_analise',
          uploaded_at = excluded.uploaded_at,
          uploaded_by = excluded.uploaded_by,
          reviewed_at = null,
          reviewed_by = null,
          rejected_reason = null,
          rejected_at = null,
          updated_at = excluded.updated_at
      where public.student_guardian_consents.status <> 'enviado';
  end if;
  return new;
end $$;
create trigger student_signup_requests_apply_term
  after update of status on public.student_signup_requests
  for each row when (new.status = 'approved' and old.status is distinct from 'approved'
                     and new.student_id is not null and new.guardian_file_path is not null)
  execute function public.signup_request_apply_term();

revoke execute on function public.signup_request_apply_term() from public, anon, authenticated;
revoke execute on function public.can_upload_pending_signup_term(text) from public;
grant execute on function public.can_upload_pending_signup_term(text) to anon, authenticated;
revoke execute on function public.can_upload_own_signup_term(text) from public, anon;
grant execute on function public.can_upload_own_signup_term(text) to authenticated;
revoke execute on function public.can_manage_guardian_file(text) from public, anon;
grant execute on function public.can_manage_guardian_file(text) to authenticated;
revoke execute on function public.can_delete_own_guardian_file(text) from public, anon;
grant execute on function public.can_delete_own_guardian_file(text) to authenticated;
revoke execute on function public.set_pending_signup_term(uuid, text, text) from public;
grant execute on function public.set_pending_signup_term(uuid, text, text) to anon, authenticated;
revoke execute on function public.set_my_signup_term(text) from public, anon;
grant execute on function public.set_my_signup_term(text) to authenticated;
