-- Fotos do treino: bucket privado, acesso por URL assinada.
-- Caminho do objeto: {gym_id}/{class_id}/{photo_id}.jpg

create table public.class_photos (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null references public.classes (id) on delete restrict,
  storage_path text not null unique,
  taken_at timestamptz not null default now(),
  uploaded_by uuid not null default auth.uid() references public.profiles (id)
);
create index class_photos_class_idx on public.class_photos (class_id);

alter table public.class_photos enable row level security;

create policy class_photos_select on public.class_photos for select to authenticated
  using (public.can_manage_class(class_id));
create policy class_photos_insert on public.class_photos for insert to authenticated
  with check (public.can_manage_class(class_id) and uploaded_by = (select auth.uid()));
create policy class_photos_delete on public.class_photos for delete to authenticated
  using (public.can_manage_class(class_id));

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('class-photos', 'class-photos', false, 5242880, array['image/jpeg', 'image/webp', 'image/png'])
on conflict (id) do nothing;

create or replace function public.storage_path_gym(p_name text) returns uuid
language plpgsql immutable
set search_path = ''
as $$
begin
  return split_part(p_name, '/', 1)::uuid;
exception when others then
  return null;
end $$;

create policy class_photos_obj_select on storage.objects for select to authenticated
  using (bucket_id = 'class-photos' and public.is_gym_member(public.storage_path_gym(name)));
create policy class_photos_obj_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'class-photos' and public.is_gym_member(public.storage_path_gym(name)));
create policy class_photos_obj_update on storage.objects for update to authenticated
  using (bucket_id = 'class-photos' and public.is_gym_member(public.storage_path_gym(name)))
  with check (bucket_id = 'class-photos' and public.is_gym_member(public.storage_path_gym(name)));
create policy class_photos_obj_delete on storage.objects for delete to authenticated
  using (bucket_id = 'class-photos' and public.is_gym_member(public.storage_path_gym(name)));
