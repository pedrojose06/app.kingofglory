-- Foto de rosto obrigatória no cadastro do aluno sem link. O aluno envia a foto (bucket privado `student-faces`,
-- caminho `{profile_id}/face.jpg`) e o professor vê a foto ao aprovar, para saber quem é. Pedido sem foto não
-- aparece para o professor: o aluno conclui o envio na área do aluno.

alter table public.student_signup_requests add column photo_path text;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('student-faces', 'student-faces', false, 2097152, array['image/jpeg', 'image/webp', 'image/png'])
on conflict (id) do nothing;

-- Dono da pasta = primeira parte do caminho.
create or replace function public.storage_path_owner(p_name text) returns uuid
language plpgsql immutable
set search_path = ''
as $$
begin
  return split_part(p_name, '/', 1)::uuid;
exception when others then
  return null;
end $$;

-- Professor vê a foto de quem pediu acesso a uma academia dele.
create or replace function public.can_view_signup_face(p_owner uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.student_signup_requests r
    where r.profile_id = p_owner and public.is_gym_member(r.gym_id)
  )
$$;
revoke execute on function public.can_view_signup_face(uuid) from public, anon;
grant execute on function public.can_view_signup_face(uuid) to authenticated;

create policy student_faces_obj_select on storage.objects for select to authenticated
  using (bucket_id = 'student-faces' and (
    public.storage_path_owner(name) = (select auth.uid()) or public.can_view_signup_face(public.storage_path_owner(name))
  ));
create policy student_faces_obj_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'student-faces' and public.storage_path_owner(name) = (select auth.uid()));
create policy student_faces_obj_update on storage.objects for update to authenticated
  using (bucket_id = 'student-faces' and public.storage_path_owner(name) = (select auth.uid()))
  with check (bucket_id = 'student-faces' and public.storage_path_owner(name) = (select auth.uid()));

-- Registra a foto já enviada no pedido da conta logada.
create or replace function public.set_signup_photo(p_path text)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'Entre na sua conta primeiro.';
  end if;
  if public.storage_path_owner(p_path) is distinct from v_uid
     or not exists (select 1 from storage.objects o where o.bucket_id = 'student-faces' and o.name = p_path) then
    raise exception 'Foto não encontrada. Envie de novo.';
  end if;
  update public.student_signup_requests set photo_path = p_path where profile_id = v_uid;
  if not found then
    raise exception 'Nenhum pedido de acesso encontrado.';
  end if;
end $$;
revoke execute on function public.set_signup_photo(text) from public, anon;
grant execute on function public.set_signup_photo(text) to authenticated;

-- Situação do pedido agora diz se a foto já foi enviada.
create or replace function public.my_signup_request()
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object('status', r.status, 'gym_name', g.name, 'name', r.name, 'created_at', r.created_at,
                            'has_photo', r.photo_path is not null)
  from public.student_signup_requests r
  join public.gyms g on g.id = r.gym_id
  where r.profile_id = (select auth.uid())
$$;

-- Só pedidos com foto chegam ao professor.
create or replace function public.list_student_requests()
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', r.id,
           'name', r.name,
           'phone', r.phone,
           'email', u.email,
           'gym_id', r.gym_id,
           'photo_path', r.photo_path,
           'created_at', r.created_at
         ) order by r.created_at), '[]'::jsonb)
  from public.student_signup_requests r
  join auth.users u on u.id = r.profile_id
  where r.status = 'pending'
    and r.photo_path is not null
    and public.is_gym_member(r.gym_id)
    and not exists (select 1 from public.students s where s.profile_id = r.profile_id)
$$;

-- Aprovar exige a foto.
create or replace function public.approve_student_request(p_request_id uuid, p_student_id uuid default null)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_req public.student_signup_requests;
  v_student_id uuid;
  v_owner uuid;
begin
  select * into v_req from public.student_signup_requests where id = p_request_id for update;
  if v_req.id is null or v_req.status <> 'pending' then
    raise exception 'Pedido não encontrado ou já decidido.';
  end if;
  if v_req.photo_path is null then
    raise exception 'O aluno ainda não enviou a foto de rosto.';
  end if;
  if not public.is_gym_member(v_req.gym_id) then
    raise exception 'Você não dá aula nesta academia.';
  end if;
  if exists (select 1 from public.students s where s.profile_id = v_req.profile_id) then
    raise exception 'Esta conta já está ligada a um aluno.';
  end if;
  if exists (select 1 from public.profiles p where p.id = v_req.profile_id and p.role = 'instructor') then
    raise exception 'Esta conta é de professor.';
  end if;

  if p_student_id is not null then
    select s.id, s.profile_id into v_student_id, v_owner
      from public.students s where s.id = p_student_id and s.gym_id = v_req.gym_id for update;
    if v_student_id is null then
      raise exception 'Aluno não encontrado nesta academia.';
    end if;
    if v_owner is not null then
      raise exception 'Este aluno já tem uma conta.';
    end if;
  else
    insert into public.students (gym_id, name, phone)
    values (v_req.gym_id, v_req.name, v_req.phone)
    returning id into v_student_id;
  end if;

  update public.students set profile_id = v_req.profile_id where id = v_student_id;
  update public.profiles set role = 'student' where id = v_req.profile_id;
  update public.student_signup_requests
     set status = 'approved', student_id = v_student_id, decided_by = (select auth.uid()), decided_at = now()
   where id = p_request_id;
  return v_student_id;
end $$;
