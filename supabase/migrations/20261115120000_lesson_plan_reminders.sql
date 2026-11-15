-- Lembrete do plano de aula por push: nos dias em que o professor tem aula, no horário escolhido (padrão 13:30),
-- avisa se o plano de alguma aula de hoje ainda não foi feito e enviado (salvo no servidor).
-- Usa a mesma estrutura do lembrete de chamada: pg_cron → dispatch → Edge Function `push-reminders`.

-- Uma linha por professor; sem linha = lembrete desligado.
create table public.lesson_plan_reminders (
  profile_id uuid primary key default auth.uid() references public.profiles (id) on delete cascade,
  remind_at time not null default '13:30', -- horário de São Paulo
  last_sent_on date,                       -- último dia em que disparou (um disparo por dia)
  created_at timestamptz not null default now()
);

-- Mudou o horário: o lembrete volta a valer para hoje (mesma regra do lembrete de chamada).
create trigger lesson_plan_reminders_rearm before update on public.lesson_plan_reminders
  for each row execute function public.attendance_reminder_rearm();

alter table public.lesson_plan_reminders enable row level security;
create policy lesson_plan_reminders_all on public.lesson_plan_reminders for all to authenticated
  using (profile_id = (select auth.uid()))
  with check (profile_id = (select auth.uid()));

-- Plano preenchido: o documento do editor tem algum texto. Abrir o editor e sair sem escrever não conta.
create or replace function public.lesson_plan_has_content(p_content jsonb)
returns boolean
language sql immutable
set search_path = ''
as $$
  select coalesce(jsonb_path_exists(p_content, 'strict $.** ? (@.type == "text" && @.text like_regex "\\S")'), false)
$$;

-- Marca os lembretes vencidos como disparados e devolve o que enviar: para cada um, as aulas de hoje do
-- professor (não canceladas) ainda sem plano e os aparelhos dele. Sem aula pendente, não gera aviso.
-- Chamado só pela Edge Function (service_role).
create or replace function public.claim_lesson_plan_reminders()
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_today date := public.today_sp();
  v_result jsonb;
begin
  with due as (
    update public.lesson_plan_reminders r
    set last_sent_on = v_today
    where public.attendance_reminder_is_due(r.remind_at, r.last_sent_on)
    returning r.profile_id
  ),
  missing as (
    -- Aulas da grade em que o professor é o responsável. A linha em `classes` só existe depois que o app é
    -- aberto no dia; sem ela também não há plano.
    select d.profile_id, c.id as class_id,
           coalesce(c.start_time, s.start_time) as start_time,
           coalesce(c.title, s.title) as title,
           g.name as gym
    from due d
    join public.class_schedules s on s.instructor_id = d.profile_id
    join public.gyms g on g.id = s.gym_id
    left join public.classes c on c.schedule_id = s.id and c.date = v_today
    left join public.lesson_plans lp on lp.class_id = c.id
    where s.active
      and s.weekday = extract(dow from v_today)
      and s.starts_on <= v_today
      and (s.ends_on is null or s.ends_on >= v_today)
      and coalesce(c.status, 'scheduled') <> 'cancelled'
      and not public.lesson_plan_has_content(lp.content)
      and exists (
        select 1 from public.gym_instructors gi
        where gi.gym_id = s.gym_id and gi.profile_id = d.profile_id
      )
    union all
    -- Aulas extras (fora da grade) de quem as criou.
    select d.profile_id, c.id, c.start_time, c.title, g.name
    from due d
    join public.classes c on c.instructor_id = d.profile_id
    join public.gyms g on g.id = c.gym_id
    left join public.lesson_plans lp on lp.class_id = c.id
    where c.schedule_id is null
      and c.date = v_today
      and c.status <> 'cancelled'
      and not public.lesson_plan_has_content(lp.content)
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
      jsonb_build_object('class_id', m.class_id, 'start_time', to_char(m.start_time, 'HH24:MI'), 'title', m.title, 'gym', m.gym)
      order by m.start_time nulls last, m.gym
    ) as classes
    from missing m where m.profile_id = d.profile_id
  ) k on k.classes is not null
  join lateral (
    select jsonb_agg(jsonb_build_object('id', ps.id, 'endpoint', ps.endpoint, 'p256dh', ps.p256dh, 'auth', ps.auth))
      as subscriptions
    from public.push_subscriptions ps where ps.profile_id = d.profile_id
  ) p on p.subscriptions is not null;

  return v_result;
end $$;

-- O job do pg_cron passa a acordar a Edge Function também quando há lembrete de plano vencido.
create or replace function public.dispatch_attendance_reminders()
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
  if not exists (
    select 1 from public.attendance_reminders r
    where public.attendance_reminder_is_due(r.remind_at, r.last_sent_on)
  ) and not exists (
    select 1 from public.lesson_plan_reminders r
    where public.attendance_reminder_is_due(r.remind_at, r.last_sent_on)
  ) then
    return;
  end if;

  select decrypted_secret into v_url from vault.decrypted_secrets where name = 'push_reminders_url';
  select decrypted_secret into v_secret from vault.decrypted_secrets where name = 'push_reminders_secret';
  if v_url is null or v_secret is null then
    return;
  end if;

  perform net.http_post(
    url := v_url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-cron-secret', v_secret),
    body := '{}'::jsonb
  );
end $$;

revoke execute on function public.lesson_plan_has_content(jsonb) from public, anon, authenticated;
revoke execute on function public.claim_lesson_plan_reminders() from public, anon, authenticated;
revoke execute on function public.dispatch_attendance_reminders() from public, anon, authenticated;
grant execute on function public.claim_lesson_plan_reminders() to service_role;
