-- Termo do responsável assinado no próprio app (assinatura eletrônica simples: Lei 14.063/2020, art. 4º, I, e
-- MP 2.200-2/2001, art. 10, § 2º), sem imprimir nem fotografar.
--
-- * O professor do aluno (ou o próprio aluno, na conta dele) gera um link secreto (/termo#código) e manda para o
--   responsável. O link vale 30 dias; gerar outro invalida o anterior.
-- * Pelo link, sem login, o responsável vê o termo com os dados do aluno, preenche nome, CPF e parentesco, responde
--   às duas autorizações, informa o local e assina com o dedo na tela.
-- * O banco guarda as respostas, a assinatura (PNG), data e hora, IP e navegador de quem assinou e um código de
--   verificação (SHA-256 de tudo isso). O PDF é gerado a partir desses dados quando alguém pede (nada de arquivo).
-- * O termo assinado fica 'em_analise' e o professor aprova como qualquer termo enviado. A aprovação com uso de
--   imagem só é aceita se o responsável marcou "Sim" nas duas autorizações.
-- * Termo em papel continua valendo: enviar um arquivo (professor ou aluno) apaga a assinatura eletrônica, e vice-versa.

alter table public.student_guardian_consents
  add column sign_token text unique,
  add column sign_token_expires_at timestamptz,
  add column sign_token_created_by uuid references public.profiles (id) on delete set null,
  add column signed_at timestamptz,
  add column guardian_name text,
  add column guardian_cpf text,
  add column guardian_relationship text,
  add column image_authorized boolean,
  add column face_authorized boolean,
  add column signed_place text,
  add column signature_png text,
  add column signed_ip text,
  add column signed_user_agent text,
  add column term_version text,
  add column document_sha256 text,
  drop constraint student_guardian_consents_file,
  -- Termo em análise ou aprovado tem o arquivo enviado OU a assinatura eletrônica (nunca os dois).
  add constraint student_guardian_consents_file check (
    (status = 'pendente' and file_path is null and uploaded_at is null and signed_at is null)
    or (status in ('em_analise', 'enviado') and uploaded_at is not null and ((file_path is not null) <> (signed_at is not null)))
  );

comment on column public.student_guardian_consents.sign_token is
  'Código secreto do link /termo para o responsável assinar no app. Vale até sign_token_expires_at.';
comment on column public.student_guardian_consents.document_sha256 is
  'SHA-256 dos dados assinados (aluno, responsável, respostas, assinatura, data, IP e navegador): código de verificação do termo.';

-- Arquivo novo ou termo recusado: a assinatura eletrônica anterior deixa de valer (as funções antigas não sabem dela).
create or replace function public.guardian_consents_clear_esign() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if (new.file_path is not null and new.file_path is distinct from old.file_path) or new.status = 'pendente' then
    new.signed_at := null;
    new.guardian_name := null;
    new.guardian_cpf := null;
    new.guardian_relationship := null;
    new.image_authorized := null;
    new.face_authorized := null;
    new.signed_place := null;
    new.signature_png := null;
    new.signed_ip := null;
    new.signed_user_agent := null;
    new.term_version := null;
    new.document_sha256 := null;
  end if;
  return new;
end $$;
create trigger guardian_consents_clear_esign before update on public.student_guardian_consents
  for each row execute function public.guardian_consents_clear_esign();

-- ── CPF ──────────────────────────────────────────────────────────────────────
-- 11 dígitos com os dois dígitos verificadores certos (e não todos iguais). Mesma regra de isValidCpf() no core.
create or replace function public.is_valid_cpf(p_cpf text) returns boolean
language plpgsql immutable
set search_path = ''
as $$
declare
  d int[];
  s int;
  r int;
  i int;
begin
  if p_cpf is null or p_cpf !~ '^[0-9]{11}$' or p_cpf ~ '^(.)\1{10}$' then
    return false;
  end if;
  d := array(select substr(p_cpf, n, 1)::int from generate_series(1, 11) n);
  s := 0;
  for i in 1..9 loop s := s + d[i] * (11 - i); end loop;
  r := (s * 10) % 11;
  if r = 10 then r := 0; end if;
  if r <> d[10] then return false; end if;
  s := 0;
  for i in 1..10 loop s := s + d[i] * (12 - i); end loop;
  r := (s * 10) % 11;
  if r = 10 then r := 0; end if;
  return r = d[11];
end $$;

-- ── Link para o responsável ──────────────────────────────────────────────────
-- Professor do aluno ou o próprio aluno (conta). Devolve o link em vigor, ou um novo se não houver (ou p_renew).
create or replace function public.create_guardian_sign_link(p_student_id uuid, p_renew boolean default false)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_birth date;
  v_row public.student_guardian_consents%rowtype;
begin
  if not (public.can_manage_student(p_student_id) or public.is_student_account(p_student_id)) then
    raise exception 'Aluno não encontrado.';
  end if;
  select s.birth_date into v_birth from public.students s where s.id = p_student_id;
  if not public.is_minor(v_birth, public.today_sp()) then
    raise exception 'O termo do responsável é só para aluno menor de 18 anos.';
  end if;

  insert into public.student_guardian_consents (student_id) values (p_student_id) on conflict (student_id) do nothing;
  select * into v_row from public.student_guardian_consents c where c.student_id = p_student_id for update;
  if v_row.status = 'enviado' then
    raise exception 'O termo deste aluno já foi aprovado.';
  end if;

  if p_renew or v_row.sign_token is null or v_row.sign_token_expires_at <= now() then
    update public.student_guardian_consents
       set sign_token = replace(gen_random_uuid()::text, '-', '') || replace(gen_random_uuid()::text, '-', ''),
           sign_token_expires_at = now() + interval '30 days',
           sign_token_created_by = (select auth.uid()),
           updated_at = now()
     where student_id = p_student_id
    returning * into v_row;
  end if;
  return jsonb_build_object('token', v_row.sign_token, 'expires_at', v_row.sign_token_expires_at);
end $$;

-- Linha do termo pelo código do link (válido). null = link inválido ou vencido.
create or replace function public.guardian_consent_by_token(p_token text)
returns public.student_guardian_consents
language sql stable security definer
set search_path = ''
as $$
  select c.* from public.student_guardian_consents c
  where p_token ~ '^[a-f0-9]{64}$' and c.sign_token = p_token and c.sign_token_expires_at > now()
$$;

-- O que a página do link mostra (sem login). Só o que o responsável precisa ver para assinar.
create or replace function public.guardian_sign_info(p_token text)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'student_name', s.name,
    'birth_date', s.birth_date,
    'gym_name', g.name,
    'minor', public.is_minor(s.birth_date, public.today_sp()),
    'status', c.status,
    'kind', case when c.signed_at is not null then 'esign' when c.file_path is not null then 'file' end,
    'signed_at', c.signed_at,
    'guardian_name', c.guardian_name,
    'rejected_reason', c.rejected_reason,
    'expires_at', c.sign_token_expires_at
  )
  from public.guardian_consent_by_token(p_token) c
  join public.students s on s.id = c.student_id
  join public.gyms g on g.id = s.gym_id
  where c.id is not null
$$;

-- Assinatura pelo link (sem login). IP e navegador vêm dos cabeçalhos da requisição (não do cliente).
create or replace function public.sign_guardian_term(
  p_token text,
  p_guardian_name text,
  p_guardian_cpf text,
  p_relationship text,
  p_image boolean,
  p_face boolean,
  p_place text,
  p_signature text,
  p_term_version text
)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_row public.student_guardian_consents%rowtype;
  v_student public.students%rowtype;
  v_name text := regexp_replace(trim(coalesce(p_guardian_name, '')), '\s+', ' ', 'g');
  v_cpf text := regexp_replace(coalesce(p_guardian_cpf, ''), '\D', '', 'g');
  v_rel text := regexp_replace(trim(coalesce(p_relationship, '')), '\s+', ' ', 'g');
  v_place text := regexp_replace(trim(coalesce(p_place, '')), '\s+', ' ', 'g');
  v_headers jsonb := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
  v_ip text;
  v_ua text;
  v_at timestamptz := now();
  v_hash text;
begin
  select c.* into v_row from public.guardian_consent_by_token(p_token) c;
  if v_row.id is null then
    raise exception 'Link inválido ou vencido. Peça um novo link ao professor.';
  end if;
  select s.* into v_student from public.students s where s.id = v_row.student_id;
  if not public.is_minor(v_student.birth_date, public.today_sp()) then
    raise exception 'O aluno já é maior de idade: o termo do responsável não é mais necessário.';
  end if;
  -- Trava a linha (duas assinaturas ao mesmo tempo).
  perform 1 from public.student_guardian_consents c where c.id = v_row.id for update;
  select c.* into v_row from public.student_guardian_consents c where c.id = v_row.id;
  if v_row.status = 'enviado' then
    raise exception 'O termo deste aluno já foi aprovado pelo professor.';
  end if;
  if v_row.status = 'em_analise' and v_row.file_path is not null then
    raise exception 'Já existe um termo em papel enviado, aguardando o professor conferir.';
  end if;

  if length(v_name) < 5 or length(v_name) > 120 or v_name !~ '\S+\s+\S+' then
    raise exception 'Informe o nome completo do responsável.';
  end if;
  if not public.is_valid_cpf(v_cpf) then
    raise exception 'CPF do responsável inválido.';
  end if;
  if length(v_rel) < 2 or length(v_rel) > 40 then
    raise exception 'Informe o parentesco com o aluno.';
  end if;
  if p_image is null or p_face is null then
    raise exception 'Responda às duas autorizações.';
  end if;
  if length(v_place) < 2 or length(v_place) > 80 then
    raise exception 'Informe a cidade.';
  end if;
  if p_signature is null or p_signature !~ '^data:image/png;base64,[A-Za-z0-9+/=]+$' or length(p_signature) > 400000 then
    raise exception 'Assine no quadro antes de enviar.';
  end if;
  if p_term_version is null or length(p_term_version) > 40 then
    raise exception 'Versão do termo inválida.';
  end if;

  v_ip := left(coalesce(
    nullif(trim(split_part(v_headers ->> 'x-forwarded-for', ',', 1)), ''),
    v_headers ->> 'cf-connecting-ip',
    v_headers ->> 'x-real-ip'
  ), 64);
  v_ua := left(v_headers ->> 'user-agent', 400);

  v_hash := encode(extensions.digest(convert_to(jsonb_build_object(
    'term_version', p_term_version,
    'student_id', v_student.id,
    'student_name', v_student.name,
    'student_birth_date', v_student.birth_date,
    'guardian_name', v_name,
    'guardian_cpf', v_cpf,
    'guardian_relationship', v_rel,
    'image_authorized', p_image,
    'face_authorized', p_face,
    'place', v_place,
    'signed_at', v_at,
    'ip', v_ip,
    'user_agent', v_ua,
    'signature_png', p_signature
  )::text, 'UTF8'), 'sha256'), 'hex');

  update public.student_guardian_consents
     set status = 'em_analise',
         file_path = null,
         uploaded_at = v_at,
         uploaded_by = null,
         reviewed_at = null,
         reviewed_by = null,
         rejected_reason = null,
         rejected_at = null,
         signed_at = v_at,
         guardian_name = v_name,
         guardian_cpf = v_cpf,
         guardian_relationship = v_rel,
         image_authorized = p_image,
         face_authorized = p_face,
         signed_place = v_place,
         signature_png = p_signature,
         signed_ip = v_ip,
         signed_user_agent = v_ua,
         term_version = p_term_version,
         document_sha256 = v_hash,
         updated_at = v_at
   where id = v_row.id;
  return jsonb_build_object('signed_at', v_at, 'document_sha256', v_hash);
end $$;

-- Dados do termo assinado, para gerar o PDF: pelo link (responsável) ou pelo aluno (professor dele ou a conta do aluno).
create or replace function public.guardian_term_signature(p_student_id uuid default null, p_token text default null)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'student_name', s.name,
    'birth_date', s.birth_date,
    'gym_name', g.name,
    'status', c.status,
    'signed_at', c.signed_at,
    'guardian_name', c.guardian_name,
    'guardian_cpf', c.guardian_cpf,
    'guardian_relationship', c.guardian_relationship,
    'image_authorized', c.image_authorized,
    'face_authorized', c.face_authorized,
    'signed_place', c.signed_place,
    'signature_png', c.signature_png,
    'signed_ip', c.signed_ip,
    'signed_user_agent', c.signed_user_agent,
    'term_version', c.term_version,
    'document_sha256', c.document_sha256
  )
  from public.student_guardian_consents c
  join public.students s on s.id = c.student_id
  join public.gyms g on g.id = s.gym_id
  where c.signed_at is not null
    and (
      (p_token is not null and c.id = (select t.id from public.guardian_consent_by_token(p_token) t))
      or (p_student_id is not null and c.student_id = p_student_id
          and (public.can_manage_student(p_student_id) or public.is_student_account(p_student_id)))
    )
$$;

-- Aprovação: com assinatura eletrônica, "uso de imagem" só se o responsável marcou Sim nas duas autorizações.
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
  v_signed timestamptz;
  v_image boolean;
  v_face boolean;
begin
  if not public.can_manage_student(p_student_id) then
    raise exception 'Aluno não encontrado.';
  end if;
  select c.status, c.file_path, c.signed_at, c.image_authorized, c.face_authorized
    into v_status, v_path, v_signed, v_image, v_face
    from public.student_guardian_consents c where c.student_id = p_student_id for update;
  if v_status is distinct from 'em_analise' then
    raise exception 'Não há termo aguardando conferência.';
  end if;

  if p_approve then
    if p_image_consent and v_signed is not null and not (coalesce(v_image, false) and coalesce(v_face, false)) then
      raise exception 'O responsável não autorizou uso de imagem e reconhecimento facial no termo assinado.';
    end if;
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

revoke execute on function public.guardian_consents_clear_esign() from public, anon, authenticated;
revoke execute on function public.is_valid_cpf(text) from public;
grant execute on function public.is_valid_cpf(text) to anon, authenticated;
revoke execute on function public.create_guardian_sign_link(uuid, boolean) from public, anon;
grant execute on function public.create_guardian_sign_link(uuid, boolean) to authenticated;
revoke execute on function public.guardian_consent_by_token(text) from public, anon, authenticated;
revoke execute on function public.guardian_sign_info(text) from public;
grant execute on function public.guardian_sign_info(text) to anon, authenticated;
revoke execute on function public.sign_guardian_term(text, text, text, text, boolean, boolean, text, text, text) from public;
grant execute on function public.sign_guardian_term(text, text, text, text, boolean, boolean, text, text, text) to anon, authenticated;
revoke execute on function public.guardian_term_signature(uuid, text) from public;
grant execute on function public.guardian_term_signature(uuid, text) to anon, authenticated;
revoke execute on function public.review_guardian_consent(uuid, boolean, boolean, text) from public, anon;
grant execute on function public.review_guardian_consent(uuid, boolean, boolean, text) to authenticated;
