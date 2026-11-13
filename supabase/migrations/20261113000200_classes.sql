-- Grade semanal, aulas e planos de aula.

create type public.class_status as enum ('scheduled', 'done', 'cancelled');

create table public.class_schedules (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms (id) on delete cascade,
  instructor_id uuid not null default auth.uid() references public.profiles (id),
  weekday smallint not null check (weekday between 0 and 6), -- 0 = domingo
  start_time time not null,
  title text not null default 'Muay Thai',
  starts_on date not null default public.today_sp(), -- aulas só são geradas a partir daqui
  ends_on date,
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create index class_schedules_gym_idx on public.class_schedules (gym_id) where active;

create table public.classes (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms (id) on delete restrict,
  instructor_id uuid not null default auth.uid() references public.profiles (id),
  schedule_id uuid references public.class_schedules (id) on delete set null,
  date date not null,
  start_time time,
  title text not null default 'Muay Thai',
  status public.class_status not null default 'scheduled',
  created_at timestamptz not null default now(),
  unique (schedule_id, date)
);
create index classes_gym_date_idx on public.classes (gym_id, date desc);
create index classes_pending_idx on public.classes (date) where status = 'scheduled';

create table public.lesson_templates (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  title text not null,
  content jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index lesson_templates_owner_idx on public.lesson_templates (owner_id);
create trigger lesson_templates_touch before update on public.lesson_templates
  for each row execute function public.touch_updated_at();

create table public.lesson_plans (
  id uuid primary key default gen_random_uuid(),
  class_id uuid not null unique references public.classes (id) on delete cascade,
  content jsonb not null default '{}'::jsonb,
  template_id uuid references public.lesson_templates (id) on delete set null,
  updated_at timestamptz not null default now()
);
create index lesson_plans_template_idx on public.lesson_plans (template_id) where template_id is not null;

create or replace function public.can_manage_class(p_class_id uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.classes c
    join public.gym_instructors gi on gi.gym_id = c.gym_id
    where c.id = p_class_id and gi.profile_id = (select auth.uid())
  )
$$;

-- Gera (de forma idempotente) as aulas da grade até p_until para as academias do usuário.
-- Chamada ao abrir "Hoje" e "Pendências"; dispensa cron.
create or replace function public.ensure_classes(p_until date default public.today_sp())
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_count integer;
begin
  insert into public.classes (gym_id, instructor_id, schedule_id, date, start_time, title)
  select s.gym_id, s.instructor_id, s.id, d::date, s.start_time, s.title
  from public.class_schedules s
  cross join lateral generate_series(
    greatest(s.starts_on, p_until - 400),
    least(coalesce(s.ends_on, p_until), p_until),
    interval '1 day'
  ) as d
  where s.active
    and public.is_gym_member(s.gym_id)
    and extract(dow from d) = s.weekday
  on conflict (schedule_id, date) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- ── RLS ────────────────────────────────────────────────────────────────────
alter table public.class_schedules enable row level security;
alter table public.classes enable row level security;
alter table public.lesson_templates enable row level security;
alter table public.lesson_plans enable row level security;

create policy class_schedules_all on public.class_schedules for all to authenticated
  using (public.is_gym_member(gym_id)) with check (public.is_gym_member(gym_id));

-- classes: sem delete — aula é cancelada, não apagada (preserva presenças).
create policy classes_select on public.classes for select to authenticated
  using (public.is_gym_member(gym_id));
create policy classes_insert on public.classes for insert to authenticated
  with check (public.is_gym_member(gym_id));
create policy classes_update on public.classes for update to authenticated
  using (public.is_gym_member(gym_id)) with check (public.is_gym_member(gym_id));

create policy lesson_templates_all on public.lesson_templates for all to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));

create policy lesson_plans_all on public.lesson_plans for all to authenticated
  using (public.can_manage_class(class_id)) with check (public.can_manage_class(class_id));
