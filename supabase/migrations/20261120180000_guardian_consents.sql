-- Termo de autorização do responsável para aluno menor de 18 anos (LGPD art. 14: dado de criança e adolescente).
--
-- * Data de nascimento: obrigatória no app para aluno novo. Alunos antigos sem data continuam válidos ("data
--   pendente" na ficha); o banco só impede data inválida e apagar uma data já informada.
-- * student_guardian_consents: um termo por aluno menor ('pendente' até o professor enviar o arquivo assinado).
-- * Arquivo no bucket privado `guardian-consents` (`{student_id}/{id}.{pdf|jpg|png}`, até 10 MB). Leitura só
--   por URL assinada gerada pelo professor do aluno (policy do Storage = can_manage_student).
-- * Uso de imagem e reconhecimento facial de menor só valem com o termo enviado: o banco recusa marcar
--   students.image_consent_at sem ele, e quem vira menor pela data informada perde o consentimento (o trigger
--   students_forget_face apaga os dados do rosto). Assim todas as checagens que já usam image_consent_at
--   (face_embeddings, face_detections, face_references, face_signup_photos, conta do aluno) passam a valer.

-- ── Idade ────────────────────────────────────────────────────────────────────
-- Menor de 18 anos no dia p_today. Faz 18 no dia do aniversário; nascido em 29/02 faz 18 em 01/03 quando o ano
-- não é bissexto (CC art. 132, § 3º). Truque: (nascimento - 1 dia + 18 anos) + 1 dia; o Postgres só ajusta o
-- 29/02, que vira 28/02 + 1 = 01/03. Mesma regra de isMinor() em packages/core/src/domain/age.ts.
create or replace function public.is_minor(p_birth date, p_today date) returns boolean
language sql immutable
set search_path = ''
as $$
  select p_birth is not null and p_today < ((p_birth - 1) + interval '18 years')::date + 1
$$;

-- ── Data de nascimento ───────────────────────────────────────────────────────
create or replace function public.students_birth_date_check() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.birth_date is not null and (new.birth_date < '1900-01-01' or new.birth_date > public.today_sp()) then
    raise exception 'Data de nascimento inválida.' using errcode = 'check_violation';
  end if;
  if tg_op = 'UPDATE' and old.birth_date is not null and new.birth_date is null then
    raise exception 'A data de nascimento não pode ser apagada.' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger students_birth_date_check before insert or update of birth_date on public.students
  for each row execute function public.students_birth_date_check();

-- ── Termos ───────────────────────────────────────────────────────────────────
create table public.student_guardian_consents (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null unique references public.students (id) on delete restrict,
  file_path text,
  status text not null default 'pendente' check (status in ('pendente', 'enviado')),
  uploaded_at timestamptz,
  uploaded_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint student_guardian_consents_file check (
    (status = 'pendente' and file_path is null and uploaded_at is null)
    or (status = 'enviado' and file_path is not null and uploaded_at is not null)
  )
);

alter table public.student_guardian_consents enable row level security;
-- Só leitura pelo professor do aluno; escrita apenas pelas funções abaixo (security definer).
create policy student_guardian_consents_select on public.student_guardian_consents for select to authenticated
  using (public.can_manage_student(student_id));

create or replace function public.has_guardian_consent(p_student_id uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.student_guardian_consents c where c.student_id = p_student_id and c.status = 'enviado'
  )
$$;

-- Menor de idade: cria o termo pendente; uso de imagem só com o termo enviado.
create or replace function public.students_guardian_consent() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_minor boolean := public.is_minor(new.birth_date, public.today_sp());
begin
  if v_minor and new.image_consent_at is not null and not public.has_guardian_consent(new.id) then
    if tg_op = 'UPDATE' and old.image_consent_at is not null and old.birth_date is not distinct from new.birth_date then
      null; -- consentimento antigo sem mudança de data: nada a fazer aqui
    elsif tg_op = 'UPDATE' and old.image_consent_at is not null then
      -- A data informada agora mostra que é menor: o aceite anterior não vale (apaga os dados do rosto).
      new.image_consent_at := null;
    else
      raise exception 'Aluno menor de idade: o uso de imagem e o reconhecimento facial só valem com o termo do responsável enviado.'
        using errcode = 'check_violation';
    end if;
  end if;
  return new;
end $$;
create trigger students_guardian_consent before insert or update of birth_date, image_consent_at on public.students
  for each row execute function public.students_guardian_consent();

create or replace function public.students_guardian_consent_row() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if public.is_minor(new.birth_date, public.today_sp()) then
    insert into public.student_guardian_consents (student_id) values (new.id) on conflict (student_id) do nothing;
  end if;
  return new;
end $$;
create trigger students_guardian_consent_row after insert or update of birth_date on public.students
  for each row execute function public.students_guardian_consent_row();

-- Alunos já cadastrados: termo pendente para os menores; aceite de imagem de menor sem termo deixa de valer.
insert into public.student_guardian_consents (student_id)
select s.id from public.students s where public.is_minor(s.birth_date, public.today_sp())
on conflict (student_id) do nothing;

update public.students s
   set image_consent_at = null
 where s.image_consent_at is not null
   and public.is_minor(s.birth_date, public.today_sp());

-- ── Arquivo ──────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('guardian-consents', 'guardian-consents', false, 10485760, array['application/pdf', 'image/jpeg', 'image/png'])
on conflict (id) do nothing;

-- Primeira parte do caminho = aluno. storage_path_owner só converte o texto em uuid.
create policy guardian_consents_obj_select on storage.objects for select to authenticated
  using (bucket_id = 'guardian-consents' and public.can_manage_student(public.storage_path_owner(name)));
create policy guardian_consents_obj_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'guardian-consents' and public.can_manage_student(public.storage_path_owner(name)));
create policy guardian_consents_obj_delete on storage.objects for delete to authenticated
  using (bucket_id = 'guardian-consents' and public.can_manage_student(public.storage_path_owner(name)));

-- Registra o termo assinado já enviado ao Storage. Devolve o caminho do arquivo anterior (para o app apagar).
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
  insert into public.student_guardian_consents (student_id, file_path, status, uploaded_at, uploaded_by, updated_at)
  values (p_student_id, p_path, 'enviado', now(), (select auth.uid()), now())
  on conflict (student_id) do update
    set file_path = excluded.file_path,
        status = 'enviado',
        uploaded_at = excluded.uploaded_at,
        uploaded_by = excluded.uploaded_by,
        updated_at = excluded.updated_at;
  return v_previous;
end $$;

revoke execute on function public.has_guardian_consent(uuid) from public, anon;
grant execute on function public.has_guardian_consent(uuid) to authenticated;
revoke execute on function public.set_guardian_consent_file(uuid, text) from public, anon;
grant execute on function public.set_guardian_consent_file(uuid, text) to authenticated;
revoke execute on function public.students_birth_date_check() from public, anon, authenticated;
revoke execute on function public.students_guardian_consent() from public, anon, authenticated;
revoke execute on function public.students_guardian_consent_row() from public, anon, authenticated;
