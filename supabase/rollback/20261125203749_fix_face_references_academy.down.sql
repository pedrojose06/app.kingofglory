-- Desfaz 20261125203749_fix_face_references_academy (volta a versão de academy_face_contract, que não funciona no
-- sistema da academia).

create or replace function public.face_references(p_gym_id uuid)
returns table (id uuid, student_id uuid, embedding text, model text, created_at timestamptz)
language sql stable
set search_path = ''
as $$
  select e.id, e.student_id, e.embedding::text, e.model, e.created_at
  from public.face_embeddings e
  join public.students s on s.id = e.student_id
  join public.gyms g on g.id = s.gym_id
  where s.gym_id = p_gym_id and s.active
    and s.face_opt_out_at is null
    and (s.image_consent_at is not null or g.management_enabled)
  order by e.student_id, e.created_at desc
$$;

drop function if exists public.gym_has_management(uuid);
