-- Push para o professor quando o mestre aprova ou pede ajustes no plano compartilhado.
-- A revisão marca o aviso como pendente e acorda na hora a Edge Function `push-reminders` (via pg_net, enviado
-- depois do commit); o cron de cada minuto também acorda a função se sobrar aviso pendente (rede falhou etc.).

alter table public.lesson_plan_shares add column review_notify_pending boolean not null default false;

-- Chama a Edge Function com o segredo do cron. Sem URL/segredo no Vault, não faz nada.
create or replace function public.wake_push_reminders()
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_url text;
  v_secret text;
begin
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

-- O job do pg_cron acorda a função quando há lembrete vencido ou aviso de revisão pendente.
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
  ) then
    return;
  end if;

  perform public.wake_push_reminders();
end $$;

-- Revisão do mestre: agora também agenda o push para o professor.
create or replace function public.review_shared_lesson_plan(p_token text, p_status text, p_note text default null, p_reviewer_name text default null)
returns boolean
language plpgsql security definer
set search_path = ''
as $$
begin
  if p_token is null or length(p_token) < 32 then
    return false;
  end if;
  if p_status not in ('approved', 'changes_requested') then
    raise exception 'Revisão inválida' using errcode = '22023';
  end if;

  update public.lesson_plan_shares s
     set review_status = p_status,
         review_note = nullif(left(btrim(coalesce(p_note, '')), 2000), ''),
         reviewer_name = nullif(left(btrim(coalesce(p_reviewer_name, '')), 80), ''),
         reviewed_at = now(),
         review_notify_pending = true
   where s.token = p_token;

  if not found then
    return false;
  end if;

  -- Falha ao acordar a função não desfaz a revisão: o cron tenta de novo no próximo minuto.
  begin
    perform public.wake_push_reminders();
  exception when others then
    null;
  end;
  return true;
end $$;

-- Novo link zera a revisão e também o aviso pendente.
create or replace function public.rotate_lesson_plan_share(p_class_id uuid)
returns text
language sql
set search_path = ''
as $$
  insert into public.lesson_plan_shares (class_id) values (p_class_id)
  on conflict (class_id) do update
    set token = replace(gen_random_uuid()::text, '-', ''),
        created_by = (select auth.uid()),
        created_at = now(),
        last_seen_at = null,
        review_status = null,
        review_note = null,
        reviewer_name = null,
        reviewed_at = null,
        review_notify_pending = false
  returning token
$$;

-- Marca os avisos de revisão como enviados e devolve o que mandar: a aula, a revisão e os aparelhos de quem
-- compartilhou o plano. Chamado só pela Edge Function (service_role).
create or replace function public.claim_plan_review_notifications()
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  with claimed as (
    update public.lesson_plan_shares s
       set review_notify_pending = false
     where s.review_notify_pending
    returning s.class_id, s.created_by, s.review_status, s.review_note, s.reviewer_name
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'class_id', c.id,
    'date', c.date,
    'start_time', to_char(c.start_time, 'HH24:MI'),
    'gym', g.name,
    'status', k.review_status,
    'note', k.review_note,
    'reviewer_name', k.reviewer_name,
    'subscriptions', p.subscriptions
  )), '[]'::jsonb)
  into v_result
  from claimed k
  join public.classes c on c.id = k.class_id
  join public.gyms g on g.id = c.gym_id
  join lateral (
    select jsonb_agg(jsonb_build_object('id', ps.id, 'endpoint', ps.endpoint, 'p256dh', ps.p256dh, 'auth', ps.auth))
      as subscriptions
    from public.push_subscriptions ps where ps.profile_id = k.created_by
  ) p on p.subscriptions is not null
  where k.review_status is not null;

  return v_result;
end $$;

revoke execute on function public.wake_push_reminders() from public, anon, authenticated;
revoke execute on function public.dispatch_attendance_reminders() from public, anon, authenticated;
revoke execute on function public.claim_plan_review_notifications() from public, anon, authenticated;
grant execute on function public.claim_plan_review_notifications() to service_role;

revoke execute on function public.review_shared_lesson_plan(text, text, text, text) from public;
grant execute on function public.review_shared_lesson_plan(text, text, text, text) to anon, authenticated;
revoke execute on function public.rotate_lesson_plan_share(uuid) from public, anon;
grant execute on function public.rotate_lesson_plan_share(uuid) to authenticated;
