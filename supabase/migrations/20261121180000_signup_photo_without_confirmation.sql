-- Foto de rosto salva já no cadastro do aluno, mesmo antes de ele confirmar o e-mail (sem sessão).
--
-- Antes, sem sessão a foto ficava só no aparelho e subia no primeiro acesso; quem não confirmava o e-mail ou não
-- entrava no app nunca mandava a foto, e o pedido não aparecia para o professor.
--
-- Agora o app gera um código secreto (uso único) e manda no signUp (`student_photo_token`). O pedido guarda o código e,
-- com ele, o app envia a foto sem login para `{profile_id}/signup-{código}.jpg` e liga ao pedido
-- (`set_pending_signup_photo`). Só quem tem o código (o aparelho que fez o cadastro) consegue: vale uma vez e por
-- 24 horas depois do cadastro. O caminho começa pelo profile_id, então as policies e funções que já leem a foto
-- (professor da academia, foto do aluno nas listas, referência do reconhecimento facial) continuam valendo.

alter table public.student_signup_requests add column photo_upload_token text;

-- O código vem dos metadados do signUp (o pedido é criado pelo handle_new_user). Formato inválido é ignorado.
create or replace function public.signup_request_photo_token() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_token text;
begin
  select u.raw_user_meta_data ->> 'student_photo_token' into v_token from auth.users u where u.id = new.profile_id;
  if v_token ~ '^[a-f0-9]{32,64}$' and new.photo_path is null then
    new.photo_upload_token := v_token;
  end if;
  return new;
end $$;
create trigger student_signup_requests_photo_token before insert on public.student_signup_requests
  for each row execute function public.signup_request_photo_token();

-- Pode enviar sem login: caminho `{profile_id}/signup-{código}.jpg` de um pedido pendente, sem foto, com esse código
-- e criado há menos de 24 horas.
create or replace function public.can_upload_pending_signup_face(p_name text) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.student_signup_requests r
    where r.profile_id = public.storage_path_owner(p_name)
      and r.status = 'pending'
      and r.photo_path is null
      and r.photo_upload_token is not null
      and r.created_at > now() - interval '24 hours'
      and p_name = r.profile_id::text || '/signup-' || r.photo_upload_token || '.jpg'
  )
$$;

create policy student_faces_obj_insert_pending on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'student-faces' and public.can_upload_pending_signup_face(name));

-- Liga a foto enviada sem login ao pedido. O código só vale uma vez.
create or replace function public.set_pending_signup_photo(p_profile_id uuid, p_token text)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_path text := p_profile_id::text || '/signup-' || coalesce(p_token, '') || '.jpg';
begin
  if p_token is null or not public.can_upload_pending_signup_face(v_path)
     or not exists (select 1 from storage.objects o where o.bucket_id = 'student-faces' and o.name = v_path) then
    raise exception 'Foto não encontrada. Envie de novo.';
  end if;
  update public.student_signup_requests
     set photo_path = v_path, photo_upload_token = null
   where profile_id = p_profile_id;
end $$;

revoke execute on function public.signup_request_photo_token() from public, anon, authenticated;
revoke execute on function public.can_upload_pending_signup_face(text) from public;
grant execute on function public.can_upload_pending_signup_face(text) to anon, authenticated;
revoke execute on function public.set_pending_signup_photo(uuid, text) from public;
grant execute on function public.set_pending_signup_photo(uuid, text) to anon, authenticated;
