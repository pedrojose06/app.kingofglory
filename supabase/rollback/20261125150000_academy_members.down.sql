-- Desfaz 20261125150000_academy_members.

drop function if exists public.set_academy_member_role(uuid, uuid, text);
drop function if exists public.accept_academy_invite(text);
drop function if exists public.academy_invite_info(text);
drop function if exists public.cancel_academy_invite(uuid);
drop function if exists public.create_academy_invite(uuid, text, text);
drop function if exists public.update_academy(uuid, text, text);
drop function if exists public.create_academy(text, text);
drop function if exists public.my_academies();

drop policy if exists profiles_select_academy on public.profiles;
drop table if exists public.academy_invites;
drop table if exists public.academy_members;

drop function if exists public.academy_invite_hash(text);
drop function if exists public.is_academy_staff(uuid);
drop function if exists public.is_academy_admin(uuid);
drop function if exists public.academy_role(uuid);
drop function if exists public.email_verified();

drop policy gyms_select on public.gyms;
create policy gyms_select on public.gyms for select to authenticated
  using (public.is_gym_member(id) or created_by = (select auth.uid()));

-- As academias com gestão criadas continuam como academias comuns (sem gestão).
alter table public.gyms drop column management_enabled;
