-- Foto do cadastro do próprio aluno logado, para mostrar na área do aluno. A pasta no bucket `student-faces` é dele
-- (policy student_faces_obj_select), então ele assina a URL do caminho devolvido aqui.
create or replace function public.my_face_photo()
returns text
language sql stable security definer
set search_path = ''
as $$
  select r.photo_path
  from public.student_signup_requests r
  where r.profile_id = (select auth.uid()) and r.status = 'approved' and r.photo_path is not null
  limit 1
$$;
revoke execute on function public.my_face_photo() from public, anon;
grant execute on function public.my_face_photo() to authenticated;
