-- Sistema da academia, etapa 1 (cadastros): acesso da academia aos alunos, ficha completa do aluno, modalidades,
-- turmas e faixas do jiu-jitsu.
--
-- - Alunos continuam em `students` (os mesmos do app do professor). A academia lê/edita os seus por novas policies
--   (as do app do professor não mudam).
-- - Dados pessoais completos (CPF, RG, endereço, e-mail) ficam em `student_details`: só o admin da academia e o próprio
--   aluno veem. Professor não (minimização da LGPD).
-- - Faixas do jiu-jitsu ficam em tabelas próprias (`belt_ranks`, `student_belts`): a graduação de muay thai do app do
--   professor (`ranks`, `student_graduations`) não muda e não enxerga o jiu-jitsu.
-- Rollback: supabase/rollback/20261126120000_academy_catalog.down.sql

-- ── helpers de acesso por aluno ──────────────────────────────────────────
create or replace function public.can_admin_student(p_student_id uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.students s where s.id = p_student_id and public.is_academy_admin(s.gym_id))
$$;

create or replace function public.can_staff_student(p_student_id uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.students s where s.id = p_student_id and public.is_academy_staff(s.gym_id))
$$;

-- Alunos: equipe da academia lê; só o admin cadastra e edita. Sem delete (aluno é inativado).
create policy students_select_academy on public.students for select to authenticated
  using (public.is_academy_staff(gym_id));
create policy students_insert_academy on public.students for insert to authenticated
  with check (public.is_academy_admin(gym_id));
create policy students_update_academy on public.students for update to authenticated
  using (public.is_academy_admin(gym_id)) with check (public.is_academy_admin(gym_id));

-- Graduação de muay thai (a mesma do app do professor): equipe lê, admin registra.
create policy graduations_select_academy on public.student_graduations for select to authenticated
  using (public.can_staff_student(student_id));
create policy graduations_insert_academy on public.student_graduations for insert to authenticated
  with check (public.can_admin_student(student_id) and recorded_by = (select auth.uid()));
create policy graduations_update_academy on public.student_graduations for update to authenticated
  using (public.can_admin_student(student_id)) with check (public.can_admin_student(student_id));
create policy graduations_delete_academy on public.student_graduations for delete to authenticated
  using (public.can_admin_student(student_id));

-- ── ficha do aluno ─────────────────────────────────────────────────────────
create table public.student_details (
  student_id uuid primary key references public.students (id) on delete cascade,
  gym_id uuid not null references public.gyms (id) on delete cascade,
  cpf text check (cpf is null or (cpf ~ '^\d{11}$' and public.is_valid_cpf(cpf))),
  rg text,
  email text check (email = lower(trim(email))),
  phone_home text,
  cep text check (cep ~ '^\d{8}$'),
  street text,
  number text,
  complement text,
  district text,
  city text,
  state text,
  -- Data de cadastro no sistema anterior (ou da matrícula aqui).
  registered_on date,
  -- Chave de importação (ex.: 'dojoweb:12345678909'): reimportar não duplica.
  external_ref text,
  updated_at timestamptz not null default now()
);
create unique index student_details_cpf_uq on public.student_details (gym_id, cpf) where cpf is not null;
create unique index student_details_ref_uq on public.student_details (gym_id, external_ref) where external_ref is not null;
create trigger student_details_touch before update on public.student_details
  for each row execute function public.touch_updated_at();

-- gym_id sempre o do aluno (usado na RLS e nos índices).
create or replace function public.student_details_fill() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  select gym_id into new.gym_id from public.students where id = new.student_id;
  if new.gym_id is null then
    raise exception 'Aluno não encontrado';
  end if;
  return new;
end $$;
create trigger student_details_fill_trg before insert or update of student_id on public.student_details
  for each row execute function public.student_details_fill();

alter table public.student_details enable row level security;
create policy student_details_admin on public.student_details for all to authenticated
  using (public.is_academy_admin(gym_id)) with check (public.is_academy_admin(gym_id));
create policy student_details_own on public.student_details for select to authenticated
  using (public.is_own_student(student_id));

-- ── modalidades e turmas ───────────────────────────────────────────────────
create table public.modalities (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  -- Sistema de graduação: muay_thai usa os graus do app (ranks); jiu_jitsu usa belt_ranks.
  belt_system text check (belt_system in ('muay_thai', 'jiu_jitsu')),
  color text check (color ~ '^#[0-9a-fA-F]{6}$'),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index modalities_name_uq on public.modalities (gym_id, lower(name));

create table public.class_groups (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms (id) on delete cascade,
  modality_id uuid not null references public.modalities (id) on delete restrict,
  name text not null check (length(trim(name)) > 0),
  color text check (color ~ '^#[0-9a-fA-F]{6}$'),
  capacity integer check (capacity > 0),
  min_age smallint check (min_age between 0 and 120),
  max_age smallint check (max_age between 0 and 120),
  notes text,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  check (min_age is null or max_age is null or min_age <= max_age)
);
create unique index class_groups_name_uq on public.class_groups (gym_id, lower(name));
create index class_groups_modality_idx on public.class_groups (modality_id);

create table public.class_group_members (
  group_id uuid not null references public.class_groups (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  gym_id uuid not null references public.gyms (id) on delete cascade,
  joined_on date not null default public.today_sp(),
  left_on date,
  created_at timestamptz not null default now(),
  primary key (group_id, student_id),
  check (left_on is null or left_on >= joined_on)
);
create index class_group_members_student_idx on public.class_group_members (student_id);

-- Turma e modalidade da mesma academia; aluno da academia da turma.
create or replace function public.class_group_check() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_table_name = 'class_groups' then
    if not exists (select 1 from public.modalities m where m.id = new.modality_id and m.gym_id = new.gym_id) then
      raise exception 'Modalidade de outra academia';
    end if;
  else
    select gym_id into new.gym_id from public.class_groups where id = new.group_id;
    if not exists (select 1 from public.students s where s.id = new.student_id and s.gym_id = new.gym_id) then
      raise exception 'Aluno não pertence à academia da turma';
    end if;
  end if;
  return new;
end $$;
create trigger class_groups_check before insert or update of gym_id, modality_id on public.class_groups
  for each row execute function public.class_group_check();
create trigger class_group_members_check before insert or update of group_id, student_id on public.class_group_members
  for each row execute function public.class_group_check();

alter table public.modalities enable row level security;
alter table public.class_groups enable row level security;
alter table public.class_group_members enable row level security;

create policy modalities_select on public.modalities for select to authenticated using (public.is_academy_staff(gym_id));
create policy modalities_write on public.modalities for all to authenticated
  using (public.is_academy_admin(gym_id)) with check (public.is_academy_admin(gym_id));
create policy class_groups_select on public.class_groups for select to authenticated using (public.is_academy_staff(gym_id));
create policy class_groups_write on public.class_groups for all to authenticated
  using (public.is_academy_admin(gym_id)) with check (public.is_academy_admin(gym_id));
create policy class_group_members_select on public.class_group_members for select to authenticated
  using (public.is_academy_staff(gym_id) or public.is_own_student(student_id));
create policy class_group_members_write on public.class_group_members for all to authenticated
  using (public.is_academy_admin(gym_id)) with check (public.is_academy_admin(gym_id));

-- ── faixas do jiu-jitsu ────────────────────────────────────────────────────
create table public.belt_ranks (
  id uuid primary key default gen_random_uuid(),
  belt_system text not null check (belt_system in ('jiu_jitsu')),
  track text not null check (track in ('adulto', 'infantil')),
  position smallint not null,
  name text not null,
  colors text[] not null default '{}',
  max_degrees smallint not null default 4 check (max_degrees between 0 and 10),
  unique (belt_system, track, position),
  unique (belt_system, track, name)
);

insert into public.belt_ranks (belt_system, track, position, name, colors, max_degrees) values
  ('jiu_jitsu', 'adulto', 1, 'Branca', '{#ffffff}', 4),
  ('jiu_jitsu', 'adulto', 2, 'Azul', '{#1d4ed8}', 4),
  ('jiu_jitsu', 'adulto', 3, 'Roxa', '{#7e22ce}', 4),
  ('jiu_jitsu', 'adulto', 4, 'Marrom', '{#78350f}', 4),
  ('jiu_jitsu', 'adulto', 5, 'Preta', '{#0a0a0a}', 6),
  ('jiu_jitsu', 'infantil', 1, 'Branca', '{#ffffff}', 4),
  ('jiu_jitsu', 'infantil', 2, 'Cinza e Branca', '{#9ca3af,#ffffff}', 4),
  ('jiu_jitsu', 'infantil', 3, 'Cinza', '{#9ca3af}', 4),
  ('jiu_jitsu', 'infantil', 4, 'Cinza e Preta', '{#9ca3af,#0a0a0a}', 4),
  ('jiu_jitsu', 'infantil', 5, 'Amarela e Branca', '{#facc15,#ffffff}', 4),
  ('jiu_jitsu', 'infantil', 6, 'Amarela', '{#facc15}', 4),
  ('jiu_jitsu', 'infantil', 7, 'Amarela e Preta', '{#facc15,#0a0a0a}', 4),
  ('jiu_jitsu', 'infantil', 8, 'Laranja e Branca', '{#f97316,#ffffff}', 4),
  ('jiu_jitsu', 'infantil', 9, 'Laranja', '{#f97316}', 4),
  ('jiu_jitsu', 'infantil', 10, 'Laranja e Preta', '{#f97316,#0a0a0a}', 4),
  ('jiu_jitsu', 'infantil', 11, 'Verde e Branca', '{#16a34a,#ffffff}', 4),
  ('jiu_jitsu', 'infantil', 12, 'Verde', '{#16a34a}', 4),
  ('jiu_jitsu', 'infantil', 13, 'Verde e Preta', '{#16a34a,#0a0a0a}', 4);

-- Histórico de faixas do aluno; a atual é a mais recente.
create table public.student_belts (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete restrict,
  belt_rank_id uuid not null references public.belt_ranks (id) on delete restrict,
  degrees smallint not null default 0 check (degrees between 0 and 10),
  graduated_at date not null,
  -- true quando a data não é conhecida (importação): graduated_at é a data do registro.
  date_unknown boolean not null default false,
  notes text,
  recorded_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  unique (student_id, belt_rank_id, degrees)
);
create index student_belts_student_idx on public.student_belts (student_id, graduated_at desc);

alter table public.belt_ranks enable row level security;
alter table public.student_belts enable row level security;
create policy belt_ranks_select on public.belt_ranks for select to authenticated using (true);
create policy student_belts_select on public.student_belts for select to authenticated
  using (public.can_staff_student(student_id) or public.is_own_student(student_id));
create policy student_belts_write on public.student_belts for all to authenticated
  using (public.can_admin_student(student_id)) with check (public.can_admin_student(student_id));

revoke execute on function public.can_admin_student(uuid), public.can_staff_student(uuid) from public, anon;
grant execute on function public.can_admin_student(uuid), public.can_staff_student(uuid) to authenticated;
