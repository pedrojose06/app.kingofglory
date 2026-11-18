-- Lembrete de aula para o aluno com conta: nos dias em que a academia dele tem aula, um push por dia, um tempo
-- antes (padrão 1 h) da próxima aula, com os horários que ainda faltam no dia. O aluno liga, desliga e escolhe a
-- antecedência na área do aluno. Mesma estrutura dos lembretes do professor:
-- pg_cron → dispatch_attendance_reminders → Edge Function `push-reminders` → claim_student_class_reminders.

-- Uma linha por conta; sem linha = desligado (o aluno liga na área do aluno, junto com a permissão de notificação).
create table public.student_class_reminders (
  profile_id uuid primary key default auth.uid() references public.profiles (id) on delete cascade,
  enabled boolean not null default true,
  lead_minutes smallint not null default 60 check (lead_minutes in (30, 60, 120, 180)),
  last_sent_on date, -- último dia em que disparou (um aviso por dia)
  created_at timestamptz not null default now()
);

alter table public.student_class_reminders enable row level security;
create policy student_class_reminders_all on public.student_class_reminders for all to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

-- Aulas de hoje que ainda vão começar, para cada aluno com lembrete ligado que ainda não foi avisado hoje.
-- Aulas da grade da academia do aluno (a linha em `classes` só existe depois que o app é aberto no dia) e aulas
-- extras do dia. Aula cancelada não conta.
create or replace function public.student_reminder_classes()
returns table (profile_id uuid, start_at timestamp, title text, gym text, lead_minutes smallint)
language sql stable security definer
set search_path = ''
as $$
  with t as (
    select public.today_sp() as d, (now() at time zone 'America/Sao_Paulo') as n
  )
  select distinct r.profile_id, t.d + x.start_time, x.title, x.gym, r.lead_minutes
  from public.student_class_reminders r
  cross join t
  join public.students st on st.profile_id = r.profile_id and st.active
  join lateral (
    select coalesce(c.start_time, s.start_time) as start_time, coalesce(c.title, s.title) as title, g.name as gym
    from public.class_schedules s
    join public.gyms g on g.id = s.gym_id
    left join public.classes c on c.schedule_id = s.id and c.date = t.d
    where s.gym_id = st.gym_id
      and s.active
      and s.weekday = extract(dow from t.d)
      and s.starts_on <= t.d
      and (s.ends_on is null or s.ends_on >= t.d)
      and coalesce(c.status, 'scheduled') <> 'cancelled'
    union all
    select c.start_time, c.title, g.name
    from public.classes c
    join public.gyms g on g.id = c.gym_id
    where c.gym_id = st.gym_id
      and c.schedule_id is null
      and c.date = t.d
      and c.status <> 'cancelled'
      and c.start_time is not null
  ) x on true
  where r.enabled
    and (r.last_sent_on is null or r.last_sent_on < t.d)
    and t.d + x.start_time > t.n
$$;

-- Vencido: a próxima aula do dia começa dentro da antecedência escolhida.
create or replace function public.student_class_reminder_due_profiles()
returns table (profile_id uuid)
language sql stable security definer
set search_path = ''
as $$
  select distinct k.profile_id
  from public.student_reminder_classes() k
  where k.start_at - make_interval(mins => k.lead_minutes::integer) <= (now() at time zone 'America/Sao_Paulo')
$$;

-- Marca os lembretes vencidos como disparados e devolve o que enviar: as aulas que ainda faltam hoje e os
-- aparelhos do aluno. Chamado só pela Edge Function (service_role).
create or replace function public.claim_student_class_reminders()
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  -- Mesmo snapshot: as aulas são lidas antes de last_sent_on mudar.
  with classes as (
    select * from public.student_reminder_classes()
  ),
  due as (
    update public.student_class_reminders r
    set last_sent_on = public.today_sp()
    where r.profile_id in (select p.profile_id from public.student_class_reminder_due_profiles() p)
    returning r.profile_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'profile_id', d.profile_id,
    'classes', k.classes,
    'subscriptions', p.subscriptions
  )), '[]'::jsonb)
  into v_result
  from due d
  join lateral (
    select jsonb_agg(
      jsonb_build_object('start_time', to_char(c.start_at, 'HH24:MI'), 'title', c.title, 'gym', c.gym)
      order by c.start_at, c.gym
    ) as classes
    from classes c where c.profile_id = d.profile_id
  ) k on k.classes is not null
  join lateral (
    select jsonb_agg(jsonb_build_object('id', ps.id, 'endpoint', ps.endpoint, 'p256dh', ps.p256dh, 'auth', ps.auth))
      as subscriptions
    from public.push_subscriptions ps where ps.profile_id = d.profile_id
  ) p on p.subscriptions is not null;

  return v_result;
end $$;

-- O job do pg_cron acorda a função também quando há lembrete de aluno vencido.
create or replace function public.dispatch_attendance_reminders()
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.attendance_reminders r
    where public.attendance_reminder_is_due(r.remind_at, r.last_sent_on)
  ) and not exists (
    select 1 from public.lesson_plan_reminders r
    where public.attendance_reminder_is_due(r.remind_at, r.last_sent_on)
  ) and not exists (
    select 1 from public.lesson_plan_shares s where s.review_notify_pending
  ) and not exists (
    select 1 from public.student_class_reminder_due_profiles()
  ) then
    return;
  end if;

  perform public.wake_push_reminders();
end $$;

revoke execute on function public.student_reminder_classes() from public, anon, authenticated;
revoke execute on function public.student_class_reminder_due_profiles() from public, anon, authenticated;
revoke execute on function public.claim_student_class_reminders() from public, anon, authenticated;
grant execute on function public.claim_student_class_reminders() to service_role;
