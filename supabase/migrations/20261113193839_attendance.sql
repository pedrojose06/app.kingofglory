-- Presenças. Registros nunca são apagados: não há policy de delete e as FKs são RESTRICT.

create type public.attendance_status as enum ('present', 'absent', 'late', 'justified');
create type public.attendance_source as enum ('manual', 'walk_in', 'import', 'face', 'student_checkin');

create table public.attendance (
  id uuid primary key default gen_random_uuid(),
  class_id uuid references public.classes (id) on delete restrict,
  student_id uuid not null references public.students (id) on delete restrict,
  gym_id uuid not null references public.gyms (id) on delete restrict, -- academia do aluno (denormalizado p/ RLS)
  date date not null,
  status public.attendance_status not null default 'present',
  source public.attendance_source not null default 'manual',
  location_label text,
  marked_by uuid not null default auth.uid() references public.profiles (id),
  marked_at timestamptz not null default now(),
  check (class_id is not null or length(trim(location_label)) > 0)
);
create unique index attendance_class_student_uq on public.attendance (class_id, student_id)
  where class_id is not null;
-- Avulsa: no máximo uma por aluno/dia/local (torna o registro e a importação idempotentes).
create unique index attendance_walk_in_uq on public.attendance (student_id, date, location_label)
  where class_id is null;
create index attendance_student_date_idx on public.attendance (student_id, date desc);
create index attendance_gym_idx on public.attendance (gym_id);
create index attendance_marked_by_idx on public.attendance (marked_by) where class_id is null;

-- Mantém gym_id/date coerentes com o aluno e a aula.
create or replace function public.attendance_fill() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_student_gym uuid;
  v_class_gym uuid;
  v_class_date date;
begin
  select gym_id into v_student_gym from public.students where id = new.student_id;
  if v_student_gym is null then
    raise exception 'Aluno não encontrado';
  end if;
  new.gym_id := v_student_gym;

  if new.class_id is not null then
    select gym_id, date into v_class_gym, v_class_date from public.classes where id = new.class_id;
    if v_class_gym is null then
      raise exception 'Aula não encontrada';
    end if;
    if v_class_gym <> v_student_gym then
      raise exception 'Aluno não pertence à academia da aula';
    end if;
    new.date := v_class_date;
  else
    new.location_label := trim(new.location_label);
  end if;
  return new;
end $$;

create trigger attendance_fill_trg
  before insert or update of class_id, student_id, date, location_label on public.attendance
  for each row execute function public.attendance_fill();

-- ── RLS ────────────────────────────────────────────────────────────────────
alter table public.attendance enable row level security;

-- Aula normal: professores da academia. Avulsa: quem marcou. Aluno: as próprias.
create policy attendance_select on public.attendance for select to authenticated
  using (
    (class_id is not null and public.is_gym_member(gym_id))
    or (class_id is null and marked_by = (select auth.uid()))
    or public.is_own_student(student_id)
  );
create policy attendance_insert on public.attendance for insert to authenticated
  with check (public.is_gym_member(gym_id) and marked_by = (select auth.uid()));
create policy attendance_update on public.attendance for update to authenticated
  using (
    (class_id is not null and public.is_gym_member(gym_id))
    or (class_id is null and marked_by = (select auth.uid()))
  )
  with check (public.is_gym_member(gym_id));

-- ── RPCs (security invoker: a RLS acima continua valendo) ─────────────────

-- Upsert em lote, idempotente, last-write-wins por marked_at. Usado pela fila offline e pelo importador.
-- p_items: [{ "class_id", "student_id", "status", "marked_at"?, "source"? }]
create or replace function public.mark_attendance_batch(p_items jsonb)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_count integer;
begin
  insert into public.attendance (class_id, student_id, gym_id, date, status, source, marked_by, marked_at)
  select
    (i ->> 'class_id')::uuid,
    (i ->> 'student_id')::uuid,
    s.gym_id,
    c.date,
    (i ->> 'status')::public.attendance_status,
    coalesce((i ->> 'source')::public.attendance_source, 'manual'),
    (select auth.uid()),
    coalesce((i ->> 'marked_at')::timestamptz, now())
  from jsonb_array_elements(p_items) as i
  join public.students s on s.id = (i ->> 'student_id')::uuid
  join public.classes c on c.id = (i ->> 'class_id')::uuid
  on conflict (class_id, student_id) where class_id is not null
  do update set
    status = excluded.status,
    source = excluded.source,
    marked_by = excluded.marked_by,
    marked_at = excluded.marked_at
  where excluded.marked_at >= attendance.marked_at;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- Presença avulsa para vários alunos de uma vez.
create or replace function public.add_walk_ins(
  p_student_ids uuid[],
  p_date date,
  p_location text,
  p_source public.attendance_source default 'walk_in'
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_count integer;
begin
  if length(trim(coalesce(p_location, ''))) = 0 then
    raise exception 'Informe o local';
  end if;
  insert into public.attendance (class_id, student_id, gym_id, date, status, source, location_label, marked_by)
  select null, s.id, s.gym_id, p_date, 'present', p_source, trim(p_location), (select auth.uid())
  from public.students s
  where s.id = any (p_student_ids)
  on conflict (student_id, date, location_label) where class_id is null do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- Conclui a chamada: quem não foi marcado vira falta e a aula passa a 'done'.
create or replace function public.conclude_class(p_class_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_gym uuid;
  v_date date;
begin
  select gym_id, date into v_gym, v_date from public.classes where id = p_class_id;
  if v_gym is null then
    raise exception 'Aula não encontrada';
  end if;

  insert into public.attendance (class_id, student_id, gym_id, date, status, marked_by)
  select p_class_id, s.id, s.gym_id, v_date, 'absent', (select auth.uid())
  from public.students s
  where s.gym_id = v_gym and s.active
  on conflict (class_id, student_id) where class_id is not null do nothing;

  update public.classes set status = 'done' where id = p_class_id;
end $$;

-- Locais já usados em presenças avulsas, mais frequentes primeiro (autocomplete).
create or replace function public.walk_in_locations()
returns table (location_label text, uses bigint)
language sql stable
set search_path = ''
as $$
  select a.location_label, count(*) as uses
  from public.attendance a
  where a.class_id is null and a.marked_by = (select auth.uid())
  group by a.location_label
  order by count(*) desc, max(a.date) desc
  limit 20
$$;

-- Situação de cada aluno para graduação. security_invoker: respeita a RLS de quem consulta.
-- Contam presença e atraso; falta (justificada ou não) não conta.
create view public.student_progress
with (security_invoker = true) as
select
  s.id as student_id,
  s.gym_id,
  g.rank_id as current_rank_id,
  g.graduated_at as last_graduated_at,
  (
    select count(*) from public.attendance a
    where a.student_id = s.id
      and a.status in ('present', 'late')
      and (g.graduated_at is null or a.date > g.graduated_at)
  )::integer as attendance_since,
  (
    select count(*) from public.attendance a
    where a.student_id = s.id and a.status in ('present', 'late')
  )::integer as attendance_total,
  (
    select max(a.date) from public.attendance a
    where a.student_id = s.id and a.status in ('present', 'late')
  ) as last_attendance_on
from public.students s
left join lateral (
  select sg.rank_id, sg.graduated_at
  from public.student_graduations sg
  where sg.student_id = s.id
  order by sg.graduated_at desc, sg.created_at desc
  limit 1
) g on true;
