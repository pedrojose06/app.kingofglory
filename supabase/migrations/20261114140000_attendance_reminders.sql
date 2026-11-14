-- Lembrete de chamada por push: o professor escolhe um horário e, nos dias em que tem aula com a chamada
-- ainda em aberto, recebe uma notificação. O pg_cron confere a cada minuto e, havendo lembrete vencido,
-- chama a Edge Function `push-reminders`, que envia o Web Push.

create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;

-- ── aparelhos inscritos ────────────────────────────────────────────────────
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null references public.profiles (id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  user_agent text,
  created_at timestamptz not null default now()
);
create index push_subscriptions_profile_idx on public.push_subscriptions (profile_id);

-- ── lembretes ──────────────────────────────────────────────────────────────
-- schedule_id nulo  = um horário para todas as turmas do professor no dia;
-- schedule_id preenchido = horário próprio daquela turma (tem prioridade sobre o geral).
create table public.attendance_reminders (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  schedule_id uuid references public.class_schedules (id) on delete cascade,
  remind_at time not null, -- horário de São Paulo
  last_sent_on date,       -- último dia em que disparou (um disparo por dia)
  created_at timestamptz not null default now(),
  unique nulls not distinct (profile_id, schedule_id)
);
create index attendance_reminders_schedule_idx on public.attendance_reminders (schedule_id)
  where schedule_id is not null;

-- Mudou o horário: o lembrete volta a valer para hoje.
create or replace function public.attendance_reminder_rearm() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.remind_at is distinct from old.remind_at then
    new.last_sent_on := null;
  end if;
  return new;
end $$;

create trigger attendance_reminders_rearm before update on public.attendance_reminders
  for each row execute function public.attendance_reminder_rearm();

-- ── RLS ────────────────────────────────────────────────────────────────────
alter table public.push_subscriptions enable row level security;
alter table public.attendance_reminders enable row level security;

-- Inscrição: a gravação passa por save_push_subscription (o aparelho pode trocar de dono).
create policy push_subscriptions_select on public.push_subscriptions for select to authenticated
  using (profile_id = (select auth.uid()));
create policy push_subscriptions_delete on public.push_subscriptions for delete to authenticated
  using (profile_id = (select auth.uid()));

-- A subconsulta em class_schedules respeita a RLS: só turmas de academias do professor.
create policy attendance_reminders_all on public.attendance_reminders for all to authenticated
  using (profile_id = (select auth.uid()))
  with check (
    profile_id = (select auth.uid())
    and (schedule_id is null or exists (select 1 from public.class_schedules s where s.id = schedule_id))
  );

-- ── RPCs ───────────────────────────────────────────────────────────────────

-- Registra (ou atualiza) a inscrição de push deste aparelho para o usuário logado.
create or replace function public.save_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_user_agent text default null
)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if (select auth.uid()) is null then
    raise exception 'Faça login';
  end if;
  if p_endpoint !~ '^https://' or length(p_p256dh) = 0 or length(p_auth) = 0 then
    raise exception 'Inscrição de push inválida';
  end if;
  insert into public.push_subscriptions (profile_id, endpoint, p256dh, auth, user_agent)
  values ((select auth.uid()), p_endpoint, p_p256dh, p_auth, left(p_user_agent, 300))
  on conflict (endpoint) do update set
    profile_id = excluded.profile_id,
    p256dh = excluded.p256dh,
    auth = excluded.auth,
    user_agent = excluded.user_agent;
end $$;

-- Vencido: passou do horário hoje (com até 2h de tolerância, se o cron atrasar) e ainda não disparou.
create or replace function public.attendance_reminder_is_due(p_remind_at time, p_last_sent_on date)
returns boolean
language sql stable
set search_path = ''
as $$
  select p_remind_at <= (now() at time zone 'America/Sao_Paulo')::time
    and (now() at time zone 'America/Sao_Paulo')::time - p_remind_at < interval '2 hours'
    and (p_last_sent_on is null or p_last_sent_on < public.today_sp())
$$;

-- Marca os lembretes vencidos como disparados e devolve o que enviar: para cada um, as aulas de hoje
-- com chamada em aberto e os aparelhos do professor. Lembrete sem aula em aberto não gera aviso.
-- Chamado só pela Edge Function (service_role).
create or replace function public.claim_attendance_reminders()
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_today date := public.today_sp();
  v_result jsonb;
begin
  with due as (
    update public.attendance_reminders r
    set last_sent_on = v_today
    where public.attendance_reminder_is_due(r.remind_at, r.last_sent_on)
    returning r.id, r.profile_id, r.schedule_id
  ),
  open_classes as (
    -- Aulas da grade: a linha em `classes` só existe depois que o app é aberto no dia, então parte da grade.
    select d.id as reminder_id,
           coalesce(c.start_time, s.start_time) as start_time,
           coalesce(c.title, s.title) as title,
           g.name as gym
    from due d
    join public.class_schedules s on
      case
        when d.schedule_id is not null then s.id = d.schedule_id
        else s.instructor_id = d.profile_id and not exists (
          select 1 from public.attendance_reminders o
          where o.profile_id = d.profile_id and o.schedule_id = s.id
        )
      end
    join public.gyms g on g.id = s.gym_id
    left join public.classes c on c.schedule_id = s.id and c.date = v_today
    where s.active
      and s.weekday = extract(dow from v_today)
      and s.starts_on <= v_today
      and (s.ends_on is null or s.ends_on >= v_today)
      and coalesce(c.status, 'scheduled') = 'scheduled'
      and exists (
        select 1 from public.gym_instructors gi
        where gi.gym_id = s.gym_id and gi.profile_id = d.profile_id
      )
    union all
    -- Aulas extras (fora da grade) entram no lembrete geral de quem as criou.
    select d.id, c.start_time, c.title, g.name
    from due d
    join public.classes c on c.instructor_id = d.profile_id
    join public.gyms g on g.id = c.gym_id
    where d.schedule_id is null
      and c.schedule_id is null
      and c.date = v_today
      and c.status = 'scheduled'
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'reminder_id', d.id,
    'classes', k.classes,
    'subscriptions', p.subscriptions
  )), '[]'::jsonb)
  into v_result
  from due d
  join lateral (
    select jsonb_agg(
      jsonb_build_object('start_time', to_char(o.start_time, 'HH24:MI'), 'title', o.title, 'gym', o.gym)
      order by o.start_time nulls last, o.gym
    ) as classes
    from open_classes o where o.reminder_id = d.id
  ) k on k.classes is not null
  join lateral (
    select jsonb_agg(jsonb_build_object('id', ps.id, 'endpoint', ps.endpoint, 'p256dh', ps.p256dh, 'auth', ps.auth))
      as subscriptions
    from public.push_subscriptions ps where ps.profile_id = d.profile_id
  ) p on p.subscriptions is not null;

  return v_result;
end $$;

-- Roda a cada minuto pelo pg_cron. Só faz a chamada HTTP quando há lembrete vencido.
-- A URL da Edge Function e o segredo ficam no Vault (ver README); sem eles, não faz nada.
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

-- Só save_push_subscription faz parte da API do app.
revoke execute on function public.attendance_reminder_rearm() from public, anon, authenticated;
revoke execute on function public.attendance_reminder_is_due(time, date) from public, anon, authenticated;
revoke execute on function public.claim_attendance_reminders() from public, anon, authenticated;
revoke execute on function public.dispatch_attendance_reminders() from public, anon, authenticated;
revoke execute on function public.save_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;
grant execute on function public.claim_attendance_reminders() to service_role;

-- ── agendamento ────────────────────────────────────────────────────────────
select cron.schedule('attendance-reminders', '* * * * *', $$select public.dispatch_attendance_reminders()$$);
-- O pg_cron guarda um registro por execução; sem limpeza seriam 1440 linhas por dia.
select cron.schedule('cron-history-cleanup', '17 6 * * *',
  $$delete from cron.job_run_details where end_time < now() - interval '2 days'$$);
