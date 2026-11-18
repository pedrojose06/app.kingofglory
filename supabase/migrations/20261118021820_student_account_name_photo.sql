-- Aluno que se cadastrou pela conta: o nome que ele digitou passa a ser o nome do aluno (no lugar do nome que o
-- professor tinha cadastrado), e a foto de rosto do cadastro aparece como foto do aluno nas listas.

-- Ao aprovar o pedido, o aluno ligado fica com o nome do pedido.
create or replace function public.signup_request_apply_name() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  update public.students s
     set name = new.name
   where s.id = new.student_id
     and s.profile_id = new.profile_id
     and s.name is distinct from new.name;
  return new;
end $$;
revoke execute on function public.signup_request_apply_name() from public, anon, authenticated;

create trigger student_signup_requests_apply_name
  after update of status on public.student_signup_requests
  for each row when (new.status = 'approved' and old.status is distinct from 'approved' and new.student_id is not null)
  execute function public.signup_request_apply_name();

-- Alunos já aprovados.
update public.students s
   set name = r.name
  from public.student_signup_requests r
 where r.status = 'approved'
   and r.student_id = s.id
   and r.profile_id = s.profile_id
   and s.name is distinct from r.name;

-- Foto do cadastro de cada aluno das academias do professor (para assinar a URL no bucket `student-faces`,
-- que o professor já pode ler pela policy student_faces_obj_select).
create or replace function public.student_face_photos()
returns table (student_id uuid, photo_path text)
language sql stable security definer
set search_path = ''
as $$
  select s.id, r.photo_path
  from public.students s
  join public.student_signup_requests r
    on r.profile_id = s.profile_id and r.student_id = s.id and r.status = 'approved' and r.photo_path is not null
  where public.is_gym_member(s.gym_id)
$$;
revoke execute on function public.student_face_photos() from public, anon;
grant execute on function public.student_face_photos() to authenticated;
