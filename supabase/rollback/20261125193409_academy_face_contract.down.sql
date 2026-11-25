-- Desfaz 20261125193409_academy_face_contract.

drop trigger if exists students_forget_face_opt_out on public.students;

create or replace function public.face_references(p_gym_id uuid)
returns table (id uuid, student_id uuid, embedding text, model text, created_at timestamptz)
language sql stable
set search_path = ''
as $$
  select e.id, e.student_id, e.embedding::text, e.model, e.created_at
  from public.face_embeddings e
  join public.students s on s.id = e.student_id
  where s.gym_id = p_gym_id and s.active and s.image_consent_at is not null
  order by e.student_id, e.created_at desc
$$;

create or replace function public.has_image_consent(p_student_id uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.students s where s.id = p_student_id and s.image_consent_at is not null)
$$;

alter table public.students drop column if exists face_opt_out_at;
