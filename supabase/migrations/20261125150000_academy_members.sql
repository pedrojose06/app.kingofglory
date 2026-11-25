-- Sistema de gestão da academia (academia.kingofglory.com.br): acesso próprio, separado do app do professor.
--
-- A academia é uma linha de `gyms` com `management_enabled` (alunos, turmas e presenças continuam em comum).
-- Quem entra no sistema da academia está em `academy_members`, com um papel:
--   admin      dono/gestão: tudo, inclusive financeiro e contratos
--   professor  aulas, turmas e chamada
--   membro     aluno ou responsável: os próprios contratos e cobranças
-- Ser professor no app (gym_instructors) não dá acesso ao sistema da academia, e vice-versa.
-- Toda entrada exige e-mail confirmado; o convite só pode ser aceito pela conta com o e-mail convidado.
-- Rollback: supabase/rollback/20261125150000_academy_members.down.sql

alter table public.gyms add column management_enabled boolean not null default false;
comment on column public.gyms.management_enabled is
  'Academia com o sistema de gestão (academia.kingofglory.com.br). Não aparece no app do professor para quem não dá aula nela.';

-- Academia com gestão só aparece no app do professor para quem dá aula nela (gym_instructors).
-- As academias parceiras (management_enabled = false) continuam exatamente como antes.
drop policy gyms_select on public.gyms;
create policy gyms_select on public.gyms for select to authenticated
  using (public.is_gym_member(id) or (created_by = (select auth.uid()) and not management_enabled));

-- ── membros ────────────────────────────────────────────────────────────────
create table public.academy_members (
  gym_id uuid not null references public.gyms (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role text not null check (role in ('admin', 'professor', 'membro')),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (gym_id, profile_id)
);
create index academy_members_profile_idx on public.academy_members (profile_id);

create table public.academy_invites (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms (id) on delete cascade,
  email text not null check (email = lower(trim(email)) and email like '%_@_%'),
  role text not null check (role in ('admin', 'professor', 'membro')),
  -- Só o hash do token fica no banco: quem lê a tabela não consegue montar o link.
  token_sha256 text not null unique,
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '14 days',
  accepted_at timestamptz,
  accepted_by uuid references public.profiles (id),
  cancelled_at timestamptz
);
-- No máximo um convite em aberto por e-mail em cada academia.
create unique index academy_invites_open_uq on public.academy_invites (gym_id, email)
  where accepted_at is null and cancelled_at is null;

-- ── helpers ────────────────────────────────────────────────────────────────
create or replace function public.email_verified() returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from auth.users u where u.id = (select auth.uid()) and u.email_confirmed_at is not null
  )
$$;

-- Papel do usuário na academia (null = sem acesso). Conta sem e-mail confirmado não tem acesso.
create or replace function public.academy_role(p_gym_id uuid) returns text
language sql stable security definer
set search_path = ''
as $$
  select am.role from public.academy_members am
  join public.gyms g on g.id = am.gym_id and g.management_enabled
  where am.gym_id = p_gym_id and am.profile_id = (select auth.uid()) and public.email_verified()
$$;

create or replace function public.is_academy_admin(p_gym_id uuid) returns boolean
language sql stable
set search_path = ''
as $$ select coalesce(public.academy_role(p_gym_id) = 'admin', false) $$;

-- Equipe da academia: admin ou professor.
create or replace function public.is_academy_staff(p_gym_id uuid) returns boolean
language sql stable
set search_path = ''
as $$ select coalesce(public.academy_role(p_gym_id) in ('admin', 'professor'), false) $$;

create or replace function public.academy_invite_hash(p_token text) returns text
language sql immutable
set search_path = ''
as $$ select encode(extensions.digest(convert_to(p_token, 'UTF8'), 'sha256'), 'hex') $$;

-- ── RLS ────────────────────────────────────────────────────────────────────
-- Escrita só pelas funções abaixo (validam papel, e-mail e o último admin).
alter table public.academy_members enable row level security;
alter table public.academy_invites enable row level security;

create policy academy_members_select on public.academy_members for select to authenticated
  using (profile_id = (select auth.uid()) or public.is_academy_admin(gym_id));

create policy academy_invites_select on public.academy_invites for select to authenticated
  using (public.is_academy_admin(gym_id));

-- O admin vê o nome dos membros da academia.
create policy profiles_select_academy on public.profiles for select to authenticated
  using (exists (
    select 1 from public.academy_members am
    where am.profile_id = profiles.id and public.is_academy_admin(am.gym_id)
  ));

-- ── funções ────────────────────────────────────────────────────────────────

-- Academias do usuário no sistema de gestão.
create or replace function public.my_academies()
returns table (gym_id uuid, name text, address text, role text)
language sql stable security definer
set search_path = ''
as $$
  select g.id, g.name, g.address, am.role
  from public.academy_members am
  join public.gyms g on g.id = am.gym_id and g.management_enabled
  where am.profile_id = (select auth.uid()) and public.email_verified()
  order by g.name
$$;

-- Cria uma academia com gestão; quem cria vira admin. Só professor (conta com acesso ao app) com e-mail confirmado.
-- Quem cria NÃO entra na equipe do app do professor: dar aula na academia é outra coisa.
create or replace function public.create_academy(p_name text, p_address text default null)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_gym uuid;
begin
  if v_uid is null or not public.email_verified() then
    raise exception 'Confirme o seu e-mail antes de criar uma academia.';
  end if;
  if not public.is_instructor() then
    raise exception 'Só professores podem criar uma academia.';
  end if;
  if length(trim(coalesce(p_name, ''))) = 0 then
    raise exception 'Informe o nome da academia.';
  end if;
  insert into public.gyms (name, address, created_by, management_enabled)
  values (trim(p_name), nullif(trim(p_address), ''), v_uid, true)
  returning id into v_gym;
  -- O trigger on_gym_created põe quem cria como dono no app do professor; aqui não.
  delete from public.gym_instructors where gym_id = v_gym and profile_id = v_uid;
  insert into public.academy_members (gym_id, profile_id, role, created_by) values (v_gym, v_uid, 'admin', v_uid);
  return v_gym;
end $$;

-- Nome e endereço da academia (admin).
create or replace function public.update_academy(p_gym_id uuid, p_name text, p_address text default null)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not public.is_academy_admin(p_gym_id) then
    raise exception 'Só o administrador da academia pode alterar os dados dela.';
  end if;
  if length(trim(coalesce(p_name, ''))) = 0 then
    raise exception 'Informe o nome da academia.';
  end if;
  update public.gyms set name = trim(p_name), address = nullif(trim(p_address), '') where id = p_gym_id;
end $$;

-- Convite para um e-mail. Devolve o token (só desta vez; o banco guarda o hash). Um convite novo para o mesmo
-- e-mail substitui o que estava em aberto.
create or replace function public.create_academy_invite(p_gym_id uuid, p_email text, p_role text)
returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  v_email text := lower(trim(coalesce(p_email, '')));
  v_token text := encode(extensions.gen_random_bytes(24), 'hex');
begin
  if not public.is_academy_admin(p_gym_id) then
    raise exception 'Só o administrador da academia pode convidar.';
  end if;
  if v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then
    raise exception 'E-mail inválido.';
  end if;
  if p_role not in ('admin', 'professor', 'membro') then
    raise exception 'Papel inválido.';
  end if;
  update public.academy_invites set cancelled_at = now()
   where gym_id = p_gym_id and email = v_email and accepted_at is null and cancelled_at is null;
  insert into public.academy_invites (gym_id, email, role, token_sha256, created_by)
  values (p_gym_id, v_email, p_role, public.academy_invite_hash(v_token), (select auth.uid()));
  return v_token;
end $$;

create or replace function public.cancel_academy_invite(p_invite_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_gym uuid;
begin
  select gym_id into v_gym from public.academy_invites where id = p_invite_id;
  if v_gym is null or not public.is_academy_admin(v_gym) then
    raise exception 'Convite não encontrado.';
  end if;
  update public.academy_invites set cancelled_at = now()
   where id = p_invite_id and accepted_at is null and cancelled_at is null;
end $$;

-- Dados do convite para a tela de entrada (sem login): academia, e-mail convidado, papel e situação.
create or replace function public.academy_invite_info(p_token text)
returns table (academy text, email text, role text, status text)
language sql stable security definer
set search_path = ''
as $$
  select g.name, i.email, i.role,
    case
      when i.accepted_at is not null then 'aceito'
      when i.cancelled_at is not null then 'cancelado'
      when i.expires_at < now() then 'vencido'
      else 'aberto'
    end
  from public.academy_invites i
  join public.gyms g on g.id = i.gym_id
  where i.token_sha256 = public.academy_invite_hash(p_token)
$$;

-- Aceita o convite com a conta logada. A conta precisa ter o e-mail convidado e confirmado.
-- Quem já é membro fica com o papel do convite (o admin decidiu ao convidar).
create or replace function public.accept_academy_invite(p_token text)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_inv public.academy_invites;
  v_email text;
begin
  select lower(u.email) into v_email from auth.users u where u.id = v_uid;
  if v_uid is null or not public.email_verified() then
    raise exception 'Confirme o seu e-mail antes de aceitar o convite.';
  end if;
  select * into v_inv from public.academy_invites
   where token_sha256 = public.academy_invite_hash(p_token) for update;
  if v_inv.id is null or v_inv.cancelled_at is not null then
    raise exception 'Convite não encontrado ou cancelado.';
  end if;
  if v_inv.accepted_at is not null then
    if v_inv.accepted_by = v_uid then
      return v_inv.gym_id;
    end if;
    raise exception 'Este convite já foi usado.';
  end if;
  if v_inv.expires_at < now() then
    raise exception 'Convite vencido. Peça um novo ao administrador da academia.';
  end if;
  if v_email is distinct from v_inv.email then
    raise exception 'Este convite é para %. Entre com a conta desse e-mail.', v_inv.email;
  end if;
  insert into public.academy_members (gym_id, profile_id, role, created_by)
  values (v_inv.gym_id, v_uid, v_inv.role, v_inv.created_by)
  on conflict (gym_id, profile_id) do update set role = excluded.role;
  update public.academy_invites set accepted_at = now(), accepted_by = v_uid where id = v_inv.id;
  return v_inv.gym_id;
end $$;

-- Muda o papel ou remove um membro (admin). A academia nunca fica sem administrador.
create or replace function public.set_academy_member_role(p_gym_id uuid, p_profile_id uuid, p_role text)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not public.is_academy_admin(p_gym_id) then
    raise exception 'Só o administrador da academia pode mudar papéis.';
  end if;
  if p_role is not null and p_role not in ('admin', 'professor', 'membro') then
    raise exception 'Papel inválido.';
  end if;
  -- Trava as linhas da academia: dois admins se rebaixando ao mesmo tempo não deixam a academia sem admin.
  perform 1 from public.academy_members where gym_id = p_gym_id for update;
  if (p_role is null or p_role <> 'admin')
     and exists (select 1 from public.academy_members where gym_id = p_gym_id and profile_id = p_profile_id and role = 'admin')
     and (select count(*) from public.academy_members where gym_id = p_gym_id and role = 'admin') = 1 then
    raise exception 'A academia precisa de pelo menos um administrador.';
  end if;
  if p_role is null then
    delete from public.academy_members where gym_id = p_gym_id and profile_id = p_profile_id;
  else
    update public.academy_members set role = p_role where gym_id = p_gym_id and profile_id = p_profile_id;
  end if;
  if not found then
    raise exception 'Membro não encontrado.';
  end if;
end $$;

-- Nenhuma função fica exposta sem login, exceto a leitura do convite (tela de entrada).
revoke execute on function
  public.email_verified(), public.academy_role(uuid), public.is_academy_admin(uuid), public.is_academy_staff(uuid),
  public.academy_invite_hash(text), public.my_academies(), public.create_academy(text, text),
  public.update_academy(uuid, text, text), public.create_academy_invite(uuid, text, text),
  public.cancel_academy_invite(uuid), public.academy_invite_info(text), public.accept_academy_invite(text),
  public.set_academy_member_role(uuid, uuid, text)
from public, anon;
grant execute on function
  public.email_verified(), public.academy_role(uuid), public.is_academy_admin(uuid), public.is_academy_staff(uuid),
  public.my_academies(), public.create_academy(text, text), public.update_academy(uuid, text, text),
  public.create_academy_invite(uuid, text, text), public.cancel_academy_invite(uuid), public.academy_invite_info(text),
  public.accept_academy_invite(text), public.set_academy_member_role(uuid, uuid, text)
to authenticated;
grant execute on function public.academy_invite_info(text) to anon;
