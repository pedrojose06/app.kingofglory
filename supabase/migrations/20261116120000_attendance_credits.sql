-- Presença que vale mais de uma: ex. aulão vale 2 presenças. `credits` é quanto o registro conta para a
-- graduação e nos totais (presença e atraso). Falta continua valendo 1 aula no período.
-- A UI oferece o valor na presença avulsa; registrar de novo o mesmo aluno/dia/local atualiza o valor.

alter table public.attendance
  add column credits smallint not null default 1 check (credits between 1 and 10);
comment on column public.attendance.credits is
  'Quantas presenças este registro vale (ex.: aulão = 2). Só pesa em presença e atraso.';

-- Avulsa com valor. Função nova (add_walk_ins continua igual para versões antigas do app em cache).
-- Repetir o registro (mesmo aluno, dia e local) atualiza o valor.
create or replace function public.register_walk_ins(
  p_student_ids uuid[],
  p_date date,
  p_location text,
  p_credits smallint default 1,
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
  insert into public.attendance (class_id, student_id, gym_id, date, status, source, location_label, marked_by, credits)
  select null, s.id, s.gym_id, p_date, 'present', p_source, trim(p_location), (select auth.uid()), coalesce(p_credits, 1)
  from public.students s
  where s.id = any (p_student_ids)
  on conflict (student_id, date, location_label) where class_id is null
  do update set credits = excluded.credits
  where attendance.credits is distinct from excluded.credits;
  get diagnostics v_count = row_count;
  return v_count;
end $$;
revoke execute on function public.register_walk_ins(uuid[], date, text, smallint, public.attendance_source) from public, anon;
grant execute on function public.register_walk_ins(uuid[], date, text, smallint, public.attendance_source) to authenticated;

-- Progresso: presenças somam `credits`; no período, falta conta 1 aula.
create or replace view public.student_progress
with (security_invoker = true) as
select
  s.id as student_id,
  s.gym_id,
  g.rank_id as current_rank_id,
  g.graduated_at as last_graduated_at,
  (
    (
      select coalesce(sum(a.credits), 0) from public.attendance a
      where a.student_id = s.id
        and a.status in ('present', 'late')
        and (g.graduated_at is null or a.date > g.graduated_at)
    )
    + case when o.counts then s.opening_present else least(coalesce(s.opening_after_grad, 0), s.opening_present) end
  )::integer as attendance_since,
  (
    (
      select coalesce(sum(a.credits), 0) from public.attendance a
      where a.student_id = s.id and a.status in ('present', 'late')
    ) + s.opening_present
  )::integer as attendance_total,
  (
    select max(a.date) from public.attendance a
    where a.student_id = s.id and a.status in ('present', 'late')
  ) as last_attendance_on,
  (
    (
      select coalesce(sum(case when a.status = 'absent' then 1 else a.credits end), 0) from public.attendance a
      where a.student_id = s.id
        and a.status in ('present', 'late', 'absent')
        and (g.graduated_at is null or a.date > g.graduated_at)
    )
    + case when o.counts then s.opening_present + s.opening_absent
        else least(coalesce(s.opening_after_grad, 0), s.opening_present) end
  )::integer as classes_since
from public.students s
left join lateral (
  select sg.rank_id, sg.graduated_at
  from public.student_graduations sg
  where sg.student_id = s.id
  order by sg.graduated_at desc, sg.created_at desc
  limit 1
) g on true
cross join lateral (
  select g.graduated_at is null
    or g.graduated_at < coalesce(s.opening_from, s.opening_until) as counts
) o;

-- Área do aluno: devolve o valor de cada presença.
create or replace function public.student_portal(p_token text)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_student_id uuid;
  v_result jsonb;
begin
  if p_token is null or length(p_token) < 32 then
    return null;
  end if;

  update public.student_access sa
     set last_seen_at = now()
   where sa.token = p_token
     and (sa.last_seen_at is null or sa.last_seen_at < now() - interval '1 hour');

  select sa.student_id into v_student_id from public.student_access sa where sa.token = p_token;
  if v_student_id is null then
    return null;
  end if;

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
               'credits', a.credits
             ) order by a.date desc, c.start_time desc nulls last)
      from public.attendance a
      left join public.classes c on c.id = a.class_id
      where a.student_id = s.id
    ), '[]'::jsonb)
  )
  into v_result
  from public.students s
  join public.gyms g on g.id = s.gym_id
  where s.id = v_student_id;

  return v_result;
end $$;

