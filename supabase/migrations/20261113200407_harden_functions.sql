-- Nenhuma função do schema public é chamável sem login.
revoke execute on all functions in schema public from public, anon;
grant execute on all functions in schema public to authenticated, service_role;
alter default privileges in schema public revoke execute on functions from public, anon;

-- Funções de trigger não fazem parte da API.
revoke execute on function public.handle_new_user() from authenticated;
revoke execute on function public.handle_new_gym() from authenticated;
revoke execute on function public.touch_updated_at() from authenticated;
revoke execute on function public.attendance_fill() from authenticated;
