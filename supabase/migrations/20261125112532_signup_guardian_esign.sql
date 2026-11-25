-- Termo do responsável assinado na tela já no cadastro do aluno menor (sem imprimir), além do termo em papel.
--
-- * O aluno ainda não existe: a assinatura fica no pedido (`student_signup_requests.guardian_esign`, jsonb com as
--   mesmas informações de student_guardian_consents: respostas, assinatura, data, IP, navegador e SHA-256).
-- * Sem sessão (antes de confirmar o e-mail) vale o mesmo código secreto do cadastro usado na foto e no termo em papel
--   (`guardian_upload_token`, uma vez, até 24 h); com a conta logada, o próprio dono do pedido pendente assina.
-- * Quando o professor aprova o aluno, a assinatura vai para o termo do aluno como 'em_analise' ("Termo para
--   conferir"), e o professor confere como qualquer termo (abre o PDF antes de aprovar).

alter table public.student_signup_requests add column guardian_esign jsonb;

-- Valida o formulário e monta o registro da assinatura (IP e navegador dos cabeçalhos da requisição).
-- Mesmas regras de sign_guardian_term. p_ref entra no código de verificação (aluno ou pedido).
create or replace function public.guardian_esign_record(
  p_ref uuid,
  p_student_name text,
  p_birth_date date,
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
language plpgsql
set search_path = ''
as $$
declare
  v_name text := regexp_replace(trim(coalesce(p_guardian_name, '')), '\s+', ' ', 'g');
  v_cpf text := regexp_replace(coalesce(p_guardian_cpf, ''), '\D', '', 'g');
  v_rel text := regexp_replace(trim(coalesce(p_relationship, '')), '\s+', ' ', 'g');
  v_place text := regexp_replace(trim(coalesce(p_place, '')), '\s+', ' ', 'g');
  v_headers jsonb := coalesce(nullif(current_setting('request.headers', true), '')::jsonb, '{}'::jsonb);
  v_ip text;
  v_ua text;
  v_at timestamptz := now();
  v_record jsonb;
begin
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

  v_record := jsonb_build_object(
    'term_version', p_term_version,
    'ref', p_ref,
    'student_name', p_student_name,
    'student_birth_date', p_birth_date,
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
  );
  return v_record || jsonb_build_object(
    'document_sha256', encode(extensions.digest(convert_to(v_record::text, 'UTF8'), 'sha256'), 'hex')
  );
end $$;

-- Assinatura no cadastro. Sem login: p_profile_id + o código do cadastro. Logado: o próprio pedido pendente.
create or replace function public.sign_signup_guardian_term(
  p_profile_id uuid,
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
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_req public.student_signup_requests%rowtype;
begin
  select r.* into v_req from public.student_signup_requests r
   where r.profile_id = p_profile_id and r.status = 'pending'
   for update;
  -- coalesce: sem login auth.uid() é nulo, e nulo numa comparação não pode deixar passar.
  if v_req.id is null
     or not coalesce(
       p_profile_id = (select auth.uid())
       or (p_token is not null and v_req.guardian_upload_token = p_token and v_req.created_at > now() - interval '24 hours'),
       false
     ) then
    raise exception 'Cadastro não encontrado. Assine de novo pela conta, depois da aprovação do professor.';
  end if;
  if not public.is_minor(v_req.birth_date, public.today_sp()) then
    raise exception 'O termo do responsável é só para aluno menor de 18 anos.';
  end if;

  update public.student_signup_requests
     set guardian_esign = public.guardian_esign_record(
           v_req.id, v_req.name, v_req.birth_date, p_guardian_name, p_guardian_cpf, p_relationship, p_image, p_face,
           p_place, p_signature, p_term_version),
         guardian_file_path = null,
         guardian_upload_token = null
   where id = v_req.id;
end $$;

-- Aprovado: a assinatura do cadastro vai para o termo do aluno como "para conferir" (sem passar por cima de um aprovado).
create or replace function public.signup_request_apply_esign() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  e jsonb := new.guardian_esign;
  v_at timestamptz := (new.guardian_esign ->> 'signed_at')::timestamptz;
begin
  if exists (
    select 1 from public.students s
    where s.id = new.student_id and public.is_minor(s.birth_date, public.today_sp())
  ) then
    insert into public.student_guardian_consents (
      student_id, status, file_path, uploaded_at, uploaded_by, updated_at, signed_at, guardian_name, guardian_cpf,
      guardian_relationship, image_authorized, face_authorized, signed_place, signature_png, signed_ip, signed_user_agent,
      term_version, document_sha256
    )
    values (
      new.student_id, 'em_analise', null, v_at, new.profile_id, now(), v_at, e ->> 'guardian_name', e ->> 'guardian_cpf',
      e ->> 'guardian_relationship', (e ->> 'image_authorized')::boolean, (e ->> 'face_authorized')::boolean,
      e ->> 'place', e ->> 'signature_png', e ->> 'ip', e ->> 'user_agent', e ->> 'term_version', e ->> 'document_sha256'
    )
    on conflict (student_id) do update
      set status = 'em_analise',
          file_path = null,
          uploaded_at = excluded.uploaded_at,
          uploaded_by = excluded.uploaded_by,
          reviewed_at = null,
          reviewed_by = null,
          rejected_reason = null,
          rejected_at = null,
          updated_at = excluded.updated_at,
          signed_at = excluded.signed_at,
          guardian_name = excluded.guardian_name,
          guardian_cpf = excluded.guardian_cpf,
          guardian_relationship = excluded.guardian_relationship,
          image_authorized = excluded.image_authorized,
          face_authorized = excluded.face_authorized,
          signed_place = excluded.signed_place,
          signature_png = excluded.signature_png,
          signed_ip = excluded.signed_ip,
          signed_user_agent = excluded.signed_user_agent,
          term_version = excluded.term_version,
          document_sha256 = excluded.document_sha256
      where public.student_guardian_consents.status <> 'enviado';
  end if;
  return new;
end $$;
create trigger student_signup_requests_apply_esign
  after update of status on public.student_signup_requests
  for each row when (new.status = 'approved' and old.status is distinct from 'approved'
                     and new.student_id is not null and new.guardian_esign is not null and new.guardian_file_path is null)
  execute function public.signup_request_apply_esign();

revoke execute on function public.guardian_esign_record(uuid, text, date, text, text, text, boolean, boolean, text, text, text) from public, anon, authenticated;
revoke execute on function public.signup_request_apply_esign() from public, anon, authenticated;
revoke execute on function public.sign_signup_guardian_term(uuid, text, text, text, text, boolean, boolean, text, text, text) from public;
grant execute on function public.sign_signup_guardian_term(uuid, text, text, text, text, boolean, boolean, text, text, text) to anon, authenticated;
