-- Data marcada da próxima graduação, por academia. Com data futura, o app calcula os meses de cada aluno
-- até ela (ex.: 5 meses hoje, 6 no dia da graduação → já pode ir direto ao segundo grau).
alter table public.gyms add column next_graduation_on date;
comment on column public.gyms.next_graduation_on is
  'Data da próxima graduação da academia; o progresso de meses é calculado até ela.';

-- Área do aluno: devolve também a data da próxima graduação.
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
    'next_graduation_on', g.next_graduation_on,
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

