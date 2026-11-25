-- Sistema da academia: foto do aluno na ficha, que também é o primeiro rosto de referência do reconhecimento facial.
--
-- - Arquivo no bucket privado `student-photos`, em {gym_id}/{student_id}/{id}.jpg. A equipe da academia vê; só o
--   administrador envia, troca e apaga.
-- - Ao enviar, o navegador acha o rosto na foto e manda só o vetor (128 números), como nas fotos da turma. Ele vira a
--   referência `student_photo` do aluno: uma por aluno, fora da poda das 20 referências das fotos da turma. Trocar a
--   foto troca a referência; apagar a foto apaga a referência.
-- - Vale a regra do rosto (`has_image_consent`): aluno que pediu para não ser reconhecido fica só com a foto, sem vetor.
-- Rollback: supabase/rollback/20261125201732_academy_student_photo.down.sql

alter table public.students add column photo_path text;
comment on column public.students.photo_path is 'Foto do aluno no bucket student-photos ({gym_id}/{student_id}/{id}.jpg).';

alter table public.face_embeddings drop constraint face_embeddings_source_check;
alter table public.face_embeddings add constraint face_embeddings_source_check
  check (source in ('class_photo', 'signup_photo', 'student_photo'));
create unique index face_embeddings_student_photo_once on public.face_embeddings (student_id) where source = 'student_photo';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('student-photos', 'student-photos', false, 2097152, array['image/jpeg', 'image/webp', 'image/png'])
on conflict (id) do nothing;

create policy student_photos_obj_select on storage.objects for select to authenticated
  using (bucket_id = 'student-photos' and public.is_academy_staff(public.storage_path_gym(name)));
create policy student_photos_obj_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'student-photos' and public.is_academy_admin(public.storage_path_gym(name)));
create policy student_photos_obj_update on storage.objects for update to authenticated
  using (bucket_id = 'student-photos' and public.is_academy_admin(public.storage_path_gym(name)))
  with check (bucket_id = 'student-photos' and public.is_academy_admin(public.storage_path_gym(name)));
create policy student_photos_obj_delete on storage.objects for delete to authenticated
  using (bucket_id = 'student-photos' and public.is_academy_admin(public.storage_path_gym(name)));

-- Grava (ou tira, com p_path null) a foto do aluno e troca a referência do rosto. p_embedding null: foto sem rosto de
-- referência. Devolve o caminho da foto anterior, para o app apagar o arquivo (null se não havia ou é a mesma).
create or replace function public.set_student_photo(p_student_id uuid, p_path text, p_embedding jsonb default null)
returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  v_student public.students;
begin
  select * into v_student from public.students where id = p_student_id for update;
  if v_student.id is null or not public.is_academy_admin(v_student.gym_id) then
    raise exception 'Aluno não encontrado.';
  end if;
  if p_path is not null then
    if p_path not like v_student.gym_id::text || '/' || v_student.id::text || '/%'
       or not exists (select 1 from storage.objects o where o.bucket_id = 'student-photos' and o.name = p_path) then
      raise exception 'Foto não encontrada.';
    end if;
  end if;
  if p_embedding is not null and (jsonb_typeof(p_embedding) <> 'array' or jsonb_array_length(p_embedding) <> 128) then
    raise exception 'Vetor do rosto inválido';
  end if;

  update public.students set photo_path = p_path where id = p_student_id;

  delete from public.face_embeddings where student_id = p_student_id and source = 'student_photo';
  if p_path is not null and p_embedding is not null and public.has_image_consent(p_student_id) then
    insert into public.face_embeddings (student_id, embedding, source, created_by)
    values (p_student_id, (p_embedding::text)::extensions.vector, 'student_photo', (select auth.uid()));
  end if;

  return case when v_student.photo_path is distinct from p_path then v_student.photo_path end;
end $$;

revoke execute on function public.set_student_photo(uuid, text, jsonb) from public, anon;
grant execute on function public.set_student_photo(uuid, text, jsonb) to authenticated;
