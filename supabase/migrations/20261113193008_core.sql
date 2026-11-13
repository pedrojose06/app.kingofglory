-- Núcleo: perfis, academias, alunos, graus e graduações.

create type public.profile_role as enum ('instructor', 'student');
create type public.gym_role as enum ('owner', 'instructor');

-- ── helpers ────────────────────────────────────────────────────────────────
create or replace function public.today_sp() returns date
language sql stable
set search_path = ''
as $$ select (now() at time zone 'America/Sao_Paulo')::date $$;

create or replace function public.touch_updated_at() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end $$;

-- ── profiles ───────────────────────────────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null default '',
  role public.profile_role not null default 'instructor',
  avatar_url text,
  created_at timestamptz not null default now()
);

-- Todo usuário novo ganha um perfil. O papel nunca vem de metadados do cliente.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.profiles (id, name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1), ''))
  on conflict (id) do nothing;
  return new;
end $$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ── gyms ───────────────────────────────────────────────────────────────────
create table public.gyms (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(trim(name)) > 0),
  address text,
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now()
);

create table public.gym_instructors (
  gym_id uuid not null references public.gyms (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  role public.gym_role not null default 'instructor',
  created_at timestamptz not null default now(),
  primary key (gym_id, profile_id)
);
create index gym_instructors_profile_idx on public.gym_instructors (profile_id);

-- security definer: evita recursão de RLS ao consultar gym_instructors dentro de policies.
create or replace function public.is_gym_member(p_gym_id uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.gym_instructors gi
    where gi.gym_id = p_gym_id and gi.profile_id = (select auth.uid())
  )
$$;

create or replace function public.is_gym_owner(p_gym_id uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.gym_instructors gi
    where gi.gym_id = p_gym_id and gi.profile_id = (select auth.uid()) and gi.role = 'owner'
  )
$$;

create or replace function public.is_instructor() returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.role = 'instructor'
  )
$$;

-- Quem cria a academia vira owner automaticamente.
create or replace function public.handle_new_gym() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  insert into public.gym_instructors (gym_id, profile_id, role)
  values (new.id, new.created_by, 'owner');
  return new;
end $$;

create trigger on_gym_created
  after insert on public.gyms
  for each row execute function public.handle_new_gym();

-- ── students ───────────────────────────────────────────────────────────────
create table public.students (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms (id) on delete restrict,
  name text not null check (length(trim(name)) > 0),
  phone text,
  birth_date date,
  active boolean not null default true,
  profile_id uuid references public.profiles (id) on delete set null,
  image_consent_at timestamptz,
  notes text,
  created_at timestamptz not null default now()
);
create index students_gym_idx on public.students (gym_id, active);
create index students_profile_idx on public.students (profile_id) where profile_id is not null;

create or replace function public.is_own_student(p_student_id uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.students s
    where s.id = p_student_id and s.profile_id = (select auth.uid())
  )
$$;

create or replace function public.can_manage_student(p_student_id uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.students s
    join public.gym_instructors gi on gi.gym_id = s.gym_id
    where s.id = p_student_id and gi.profile_id = (select auth.uid())
  )
$$;

-- ── graus (kruang / prajied) ───────────────────────────────────────────────
-- Tabela de referência da equipe. Os requisitos são os necessários para CHEGAR ao grau:
--   min_months        intervalo mínimo desde a graduação anterior
--   required_classes  quantidade de aulas de referência do período
--   min_percent       porcentagem mínima de presença sobre required_classes
create table public.ranks (
  id uuid primary key default gen_random_uuid(),
  grade smallint not null unique check (grade > 0),
  name text not null,
  level text not null,
  colors text[] not null default '{}',
  min_months smallint check (min_months >= 0),
  required_classes smallint check (required_classes >= 0),
  min_percent smallint check (min_percent between 0 and 100)
);

insert into public.ranks (grade, name, level, colors, min_months) values
  (1,  'Branco',                    'Iniciante',          '{#ffffff}',                 null),
  (2,  'Vermelho e Branco',         'Iniciante',          '{#e11d1d,#ffffff}',         6),
  (3,  'Vermelho',                  'Iniciante',          '{#e11d1d}',                 6),
  (4,  'Vermelho e Azul Claro',     'Intermediário',      '{#e11d1d,#2f9bea}',         6),
  (5,  'Azul Claro',                'Intermediário',      '{#2f9bea}',                 6),
  (6,  'Azul Claro e Azul Escuro',  'Intermediário',      '{#2f9bea,#1414c8}',         null),
  (7,  'Azul Escuro',               'Instrutor Auxiliar', '{#1414c8}',                 null),
  (8,  'Azul Escuro e Preto',       'Instrutor',          '{#1414c8,#0a0a0a}',         null),
  (9,  'Preto',                     'Professor',          '{#0a0a0a}',                 null),
  (10, 'Preto e Branco',            'Mestre',             '{#0a0a0a,#ffffff}',         null),
  (11, 'Preto, Branco e Vermelho',  'Grão-Mestre',        '{#0a0a0a,#ffffff,#e11d1d}', null);

create table public.student_graduations (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete restrict,
  rank_id uuid not null references public.ranks (id) on delete restrict,
  graduated_at date not null,
  notes text,
  recorded_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  unique (student_id, rank_id)
);
create index student_graduations_student_idx on public.student_graduations (student_id, graduated_at desc);

-- ── RLS ────────────────────────────────────────────────────────────────────
alter table public.profiles enable row level security;
alter table public.gyms enable row level security;
alter table public.gym_instructors enable row level security;
alter table public.students enable row level security;
alter table public.ranks enable row level security;
alter table public.student_graduations enable row level security;

-- profiles: cada um vê o próprio e o de colegas das mesmas academias; edita só nome/avatar.
create policy profiles_select on public.profiles for select to authenticated
  using (
    id = (select auth.uid())
    or exists (
      select 1 from public.gym_instructors gi
      where gi.profile_id = profiles.id and public.is_gym_member(gi.gym_id)
    )
  );
create policy profiles_update on public.profiles for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));
revoke update on public.profiles from authenticated, anon;
grant update (name, avatar_url) on public.profiles to authenticated;

-- gyms
create policy gyms_select on public.gyms for select to authenticated
  using (public.is_gym_member(id) or created_by = (select auth.uid()));
create policy gyms_insert on public.gyms for insert to authenticated
  with check (created_by = (select auth.uid()) and public.is_instructor());
create policy gyms_update on public.gyms for update to authenticated
  using (public.is_gym_member(id)) with check (public.is_gym_member(id));
create policy gyms_delete on public.gyms for delete to authenticated
  using (public.is_gym_owner(id));

-- gym_instructors: membros veem a equipe; só o owner gerencia (Fase 2: convites).
create policy gym_instructors_select on public.gym_instructors for select to authenticated
  using (public.is_gym_member(gym_id));
create policy gym_instructors_insert on public.gym_instructors for insert to authenticated
  with check (public.is_gym_owner(gym_id));
create policy gym_instructors_update on public.gym_instructors for update to authenticated
  using (public.is_gym_owner(gym_id)) with check (public.is_gym_owner(gym_id));
create policy gym_instructors_delete on public.gym_instructors for delete to authenticated
  using (public.is_gym_owner(gym_id) and profile_id <> (select auth.uid()));

-- students: sem policy de delete — aluno é inativado, nunca apagado.
create policy students_select on public.students for select to authenticated
  using (public.is_gym_member(gym_id) or profile_id = (select auth.uid()));
create policy students_insert on public.students for insert to authenticated
  with check (public.is_gym_member(gym_id));
create policy students_update on public.students for update to authenticated
  using (public.is_gym_member(gym_id)) with check (public.is_gym_member(gym_id));

-- ranks: leitura para todos os autenticados; edição por professores.
create policy ranks_select on public.ranks for select to authenticated using (true);
create policy ranks_insert on public.ranks for insert to authenticated with check (public.is_instructor());
create policy ranks_update on public.ranks for update to authenticated
  using (public.is_instructor()) with check (public.is_instructor());

-- graduações
create policy graduations_select on public.student_graduations for select to authenticated
  using (public.can_manage_student(student_id) or public.is_own_student(student_id));
create policy graduations_insert on public.student_graduations for insert to authenticated
  with check (public.can_manage_student(student_id) and recorded_by = (select auth.uid()));
create policy graduations_update on public.student_graduations for update to authenticated
  using (public.can_manage_student(student_id)) with check (public.can_manage_student(student_id));
create policy graduations_delete on public.student_graduations for delete to authenticated
  using (public.can_manage_student(student_id));
