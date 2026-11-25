-- Presença avulsa por período: o mesmo aluno pode ter mais de uma avulsa no mesmo dia e local
-- (ex.: treino de manhã que vale 2 e treino à noite que vale 1). '' = sem período (registros antigos).
-- O valor (credits) já era por registro; a tela agora deixa escolher o valor de cada aluno.

alter table public.attendance
  add column walk_in_period text not null default ''
    check (walk_in_period in ('', 'manha', 'tarde', 'noite'));
comment on column public.attendance.walk_in_period is
  'Período da presença avulsa: manha, tarde, noite ou vazio. Permite mais de uma avulsa no mesmo dia e local.';

-- Uma avulsa por aluno/dia/local/período (mantém o registro e a importação idempotentes).
drop index public.attendance_walk_in_uq;
create unique index attendance_walk_in_uq on public.attendance (student_id, date, location_label, walk_in_period)
  where class_id is null;

-- Versões antigas do app (em cache) ainda chamam add_walk_ins: sem período.
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
  on conflict (student_id, date, location_label, walk_in_period) where class_id is null do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- Avulsa com valor e período. Sem p_period continua igual (versões antigas do app).
-- Repetir o registro (mesmo aluno, dia, local e período) atualiza o valor.
drop function public.register_walk_ins(uuid[], date, text, integer, public.attendance_source);
create function public.register_walk_ins(
  p_student_ids uuid[],
  p_date date,
  p_location text,
  p_credits integer default 1,
  p_source public.attendance_source default 'walk_in',
  p_period text default ''
)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_count integer;
  v_period text := coalesce(p_period, '');
begin
  if length(trim(coalesce(p_location, ''))) = 0 then
    raise exception 'Informe o local';
  end if;
  if v_period not in ('', 'manha', 'tarde', 'noite') then
    raise exception 'Período inválido';
  end if;
  insert into public.attendance (class_id, student_id, gym_id, date, status, source, location_label, marked_by, credits, walk_in_period)
  select null, s.id, s.gym_id, p_date, 'present', p_source, trim(p_location), (select auth.uid()), coalesce(p_credits, 1), v_period
  from public.students s
  where s.id = any (p_student_ids)
  on conflict (student_id, date, location_label, walk_in_period) where class_id is null
  do update set credits = excluded.credits
  where attendance.credits is distinct from excluded.credits;
  get diagnostics v_count = row_count;
  return v_count;
end $$;
revoke execute on function public.register_walk_ins(uuid[], date, text, integer, public.attendance_source, text) from public, anon;
grant execute on function public.register_walk_ins(uuid[], date, text, integer, public.attendance_source, text) to authenticated;

-- Área do aluno: devolve o período da avulsa.
create or replace function public.portal_payload(p_student_id uuid)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'student', jsonb_build_object(
      'id', s.id,
      'name', s.name,
      'active', s.active,
      'track', s.track,
      'birth_date', s.birth_date,
      'started_on', s.started_on,
      'created_at', s.created_at,
      'opening_present', s.opening_present,
      'opening_absent', s.opening_absent,
      'opening_from', s.opening_from,
      'opening_until', s.opening_until,
      'opening_after_grad', s.opening_after_grad
    ),
    'gym_name', g.name,
    'next_graduation_on', (select gs.next_on from public.graduation_schedule gs where gs.track = s.track),
    'progress', (
      select to_jsonb(p) from public.student_progress p where p.student_id = s.id
    ),
    'graduations', coalesce((
      select jsonb_agg(jsonb_build_object('rank_id', sg.rank_id, 'graduated_at', sg.graduated_at)
                       order by sg.graduated_at desc, sg.created_at desc)
      from public.student_graduations sg where sg.student_id = s.id
    ), '[]'::jsonb),
    'ranks', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.grade) from public.ranks r where r.track = s.track
    ), '[]'::jsonb),
    'attendance', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', a.id,
               'date', a.date,
               'status', a.status,
               'class_id', a.class_id,
               'title', c.title,
               'start_time', c.start_time,
               'location_label', a.location_label,
               'walk_in_period', a.walk_in_period,
               'credits', a.credits
             ) order by a.date desc, c.start_time desc nulls last,
                        case a.walk_in_period when 'noite' then 1 when 'tarde' then 2 when 'manha' then 3 else 4 end)
      from public.attendance a
      left join public.classes c on c.id = a.class_id
      where a.student_id = s.id
    ), '[]'::jsonb)
  )
  from public.students s
  join public.gyms g on g.id = s.gym_id
  where s.id = p_student_id
$$;
