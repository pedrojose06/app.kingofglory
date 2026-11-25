-- Sistema da academia: o contrato de matrícula já traz a autorização de uso de imagem e de reconhecimento facial.
--
-- - Em academia com gestão (`gyms.management_enabled`) todo aluno entra no reconhecimento facial sem esperar a
--   autorização individual (`students.image_consent_at`): quem treina lá assinou o contrato.
-- - Quem pedir para não ser reconhecido fica de fora (`students.face_opt_out_at`): marcar apaga na hora os dados do
--   rosto do aluno (as presenças continuam) e vale também nas academias parceiras.
-- - Nas academias parceiras (sem gestão) nada muda: continua valendo só a autorização do aluno (e do responsável).
-- Rollback: supabase/rollback/20261125193409_academy_face_contract.down.sql

alter table public.students add column face_opt_out_at timestamptz;
comment on column public.students.face_opt_out_at is
  'Aluno pediu para não ser reconhecido pelo rosto. Vence a autorização e o contrato da academia.';

-- Quem pode ter dados do rosto: não pediu para ficar de fora e (autorizou ou é de academia com contrato).
create or replace function public.has_image_consent(p_student_id uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.students s
    join public.gyms g on g.id = s.gym_id
    where s.id = p_student_id
      and s.face_opt_out_at is null
      and (s.image_consent_at is not null or g.management_enabled)
  )
$$;

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

-- Pedir para ficar de fora apaga os dados do rosto, como retirar a autorização.
create trigger students_forget_face_opt_out after update of face_opt_out_at on public.students
  for each row when (old.face_opt_out_at is null and new.face_opt_out_at is not null)
  execute function public.students_forget_face();
