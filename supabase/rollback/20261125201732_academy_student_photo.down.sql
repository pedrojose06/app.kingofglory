-- Desfaz 20261125201732_academy_student_photo. Os arquivos do bucket student-photos precisam ser apagados antes
-- (pelo painel ou pela API do Storage) para o bucket poder ser removido.

drop function if exists public.set_student_photo(uuid, text, jsonb);

drop policy if exists student_photos_obj_delete on storage.objects;
drop policy if exists student_photos_obj_update on storage.objects;
drop policy if exists student_photos_obj_insert on storage.objects;
drop policy if exists student_photos_obj_select on storage.objects;

delete from public.face_embeddings where source = 'student_photo';
drop index if exists public.face_embeddings_student_photo_once;
alter table public.face_embeddings drop constraint face_embeddings_source_check;
alter table public.face_embeddings add constraint face_embeddings_source_check
  check (source in ('class_photo', 'signup_photo'));

alter table public.students drop column if exists photo_path;
