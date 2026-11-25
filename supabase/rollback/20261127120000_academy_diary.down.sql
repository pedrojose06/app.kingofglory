-- Desfaz 20261127120000_academy_diary.

drop function if exists public.conclude_academy_class(uuid);
drop function if exists public.ensure_academy_classes(uuid, date, date);

drop policy if exists face_detections_update_academy on public.face_detections;
drop policy if exists face_detections_insert_academy on public.face_detections;
drop policy if exists face_detections_select_academy on public.face_detections;
drop policy if exists face_embeddings_delete_academy on public.face_embeddings;
drop policy if exists face_embeddings_insert_academy on public.face_embeddings;
drop policy if exists face_embeddings_select_academy on public.face_embeddings;

drop policy if exists class_photos_obj_delete_academy on storage.objects;
drop policy if exists class_photos_obj_update_academy on storage.objects;
drop policy if exists class_photos_obj_insert_academy on storage.objects;
drop policy if exists class_photos_obj_select_academy on storage.objects;
drop policy if exists class_photos_delete_academy on public.class_photos;
drop policy if exists class_photos_insert_academy on public.class_photos;
drop policy if exists class_photos_select_academy on public.class_photos;

drop policy if exists attendance_update_academy on public.attendance;
drop policy if exists attendance_insert_academy on public.attendance;
drop policy if exists attendance_select_academy on public.attendance;

drop policy if exists classes_update_academy on public.classes;
drop policy if exists classes_insert_academy on public.classes;
drop policy if exists classes_select_academy on public.classes;
drop policy if exists class_schedules_write_academy on public.class_schedules;
drop policy if exists class_schedules_select_academy on public.class_schedules;

drop function if exists public.can_staff_photo(uuid);
drop function if exists public.can_staff_class(uuid);

drop trigger if exists classes_group_gym on public.classes;
drop trigger if exists class_schedules_group_gym on public.class_schedules;
drop function if exists public.class_group_same_gym();
drop index if exists public.classes_group_date_idx;
drop index if exists public.class_schedules_group_idx;
alter table public.classes drop column if exists group_id;
alter table public.class_schedules drop column if exists group_id;
