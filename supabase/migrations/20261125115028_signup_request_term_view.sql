-- Aprovar o cadastro de aluno menor exige conferir o termo do responsável antes (na mesma tela).
--
-- * list_student_requests passa a dizer se o aluno é menor e qual termo veio no cadastro: assinado na tela
--   ('esign') ou arquivo ('file', com o caminho, que o professor abre por URL assinada).
-- * signup_guardian_signature: os dados do termo assinado na tela no cadastro, para o PDF (professor da academia do
--   pedido), no mesmo formato de guardian_term_signature.

create or replace function public.list_student_requests()
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', r.id,
           'name', r.name,
           'phone', r.phone,
           'email', u.email,
           'gym_id', r.gym_id,
           'photo_path', r.photo_path,
           'rank_id', r.rank_id,
           'rank_name', k.name,
           'rank_grade', k.grade,
           'rank_track', k.track,
           'graduated_at', r.graduated_at,
           'birth_date', r.birth_date,
           'created_at', r.created_at,
           'minor', public.is_minor(r.birth_date, public.today_sp()),
           'guardian_term', case when r.guardian_esign is not null then 'esign' when r.guardian_file_path is not null then 'file' end,
           'guardian_file_path', r.guardian_file_path
         ) order by r.created_at), '[]'::jsonb)
  from public.student_signup_requests r
  join auth.users u on u.id = r.profile_id
  left join public.ranks k on k.id = r.rank_id
  where r.status = 'pending'
    and r.photo_path is not null
    and r.profile_id <> (select auth.uid())
    and public.is_gym_member(r.gym_id)
    and not exists (select 1 from public.students s where s.profile_id = r.profile_id)
$$;

create or replace function public.signup_guardian_signature(p_request_id uuid)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'student_name', r.name,
    'birth_date', r.birth_date,
    'gym_name', g.name,
    'status', 'em_analise',
    'signed_at', e ->> 'signed_at',
    'guardian_name', e ->> 'guardian_name',
    'guardian_cpf', e ->> 'guardian_cpf',
    'guardian_relationship', e ->> 'guardian_relationship',
    'image_authorized', (e ->> 'image_authorized')::boolean,
    'face_authorized', (e ->> 'face_authorized')::boolean,
    'signed_place', e ->> 'place',
    'signature_png', e ->> 'signature_png',
    'signed_ip', e ->> 'ip',
    'signed_user_agent', e ->> 'user_agent',
    'term_version', e ->> 'term_version',
    'document_sha256', e ->> 'document_sha256'
  )
  from public.student_signup_requests r
  cross join lateral (select r.guardian_esign as e) x
  join public.gyms g on g.id = r.gym_id
  where r.id = p_request_id and r.guardian_esign is not null and public.is_gym_member(r.gym_id)
$$;

revoke execute on function public.signup_guardian_signature(uuid) from public, anon;
grant execute on function public.signup_guardian_signature(uuid) to authenticated;
