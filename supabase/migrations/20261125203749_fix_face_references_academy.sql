-- Corrige face_references no sistema da academia: desde academy_face_contract ela lia `gyms` (para saber se a academia
-- tem gestão), mas a equipe da academia não lê a linha da academia pela RLS de `gyms` (só quem é de gym_instructors).
-- A função é security invoker, então devolvia zero referências e o reconhecimento nunca sugeria ninguém.
-- A pergunta "a academia tem gestão?" passa a ser respondida por uma função security definer.
-- Rollback: supabase/rollback/20261125203749_fix_face_references_academy.down.sql

create or replace function public.gym_has_management(p_gym_id uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select coalesce((select g.management_enabled from public.gyms g where g.id = p_gym_id), false)
$$;

revoke execute on function public.gym_has_management(uuid) from public, anon;
grant execute on function public.gym_has_management(uuid) to authenticated;

create or replace function public.face_references(p_gym_id uuid)
returns table (id uuid, student_id uuid, embedding text, model text, created_at timestamptz)
language sql stable
set search_path = ''
as $$
  select e.id, e.student_id, e.embedding::text, e.model, e.created_at
  from public.face_embeddings e
  join public.students s on s.id = e.student_id
  where s.gym_id = p_gym_id and s.active
    and s.face_opt_out_at is null
    and (s.image_consent_at is not null or public.gym_has_management(s.gym_id))
  order by e.student_id, e.created_at desc
$$;
