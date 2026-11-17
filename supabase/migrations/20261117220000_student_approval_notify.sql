-- Aviso ao aluno quando o professor aprova o pedido de acesso: push (nos aparelhos em que ele ativou as
-- notificações) e e-mail. A aprovação marca o aviso como pendente e acorda na hora a Edge Function
-- `push-reminders`; o cron de cada minuto acorda de novo se sobrar aviso pendente (rede falhou etc.).

alter table public.student_signup_requests add column approval_notify_pending boolean not null default false;
create index student_signup_requests_notify_idx on public.student_signup_requests (approval_notify_pending)
  where approval_notify_pending;

-- Aprovar: além do que já fazia, agenda o aviso ao aluno.
create or replace function public.approve_student_request(p_request_id uuid, p_student_id uuid default null)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_req public.student_signup_requests;
  v_student_id uuid;
  v_owner uuid;
  v_track text;
begin
  select * into v_req from public.student_signup_requests where id = p_request_id for update;
  if v_req.id is null or v_req.status <> 'pending' then
    raise exception 'Pedido não encontrado ou já decidido.';
  end if;
  if v_req.photo_path is null then
    raise exception 'O aluno ainda não enviou a foto de rosto.';
  end if;
  if not public.is_gym_member(v_req.gym_id) then
    raise exception 'Você não dá aula nesta academia.';
  end if;
  if exists (select 1 from public.students s where s.profile_id = v_req.profile_id) then
    raise exception 'Esta conta já está ligada a um aluno.';
  end if;
  if exists (select 1 from public.profiles p where p.id = v_req.profile_id and p.role = 'instructor') then
    raise exception 'Esta conta é de professor.';
  end if;

  select r.track into v_track from public.ranks r where r.id = v_req.rank_id;

  if p_student_id is not null then
    select s.id, s.profile_id into v_student_id, v_owner
      from public.students s where s.id = p_student_id and s.gym_id = v_req.gym_id for update;
    if v_student_id is null then
      raise exception 'Aluno não encontrado nesta academia.';
    end if;
    if v_owner is not null then
      raise exception 'Este aluno já tem uma conta.';
    end if;
  else
    insert into public.students (gym_id, name, phone, track)
    values (v_req.gym_id, v_req.name, v_req.phone, coalesce(v_track, 'adulto'))
    returning id into v_student_id;
  end if;

  if v_req.rank_id is not null and v_req.graduated_at is not null
     and not exists (select 1 from public.student_graduations g where g.student_id = v_student_id) then
    insert into public.student_graduations (student_id, rank_id, graduated_at)
    values (v_student_id, v_req.rank_id, v_req.graduated_at)
    on conflict (student_id, rank_id) do nothing;
  end if;

  update public.students set profile_id = v_req.profile_id where id = v_student_id;
  update public.profiles set role = 'student' where id = v_req.profile_id;
  update public.student_signup_requests
     set status = 'approved', student_id = v_student_id, decided_by = (select auth.uid()), decided_at = now(),
         approval_notify_pending = true
   where id = p_request_id;

  -- Avisa o aluno (push + e-mail) na hora. Falha ao acordar a função não desfaz a aprovação: o cron tenta de novo.
  begin
    perform public.wake_push_reminders();
  exception when others then
    null;
  end;
  return v_student_id;
end $$;

-- Pega os avisos de aprovação pendentes (e os marca como enviados): e-mail, nome, academia e aparelhos do aluno.
-- Chamado só pela Edge Function (service_role).
create or replace function public.claim_student_approval_notifications()
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  with due as (
    update public.student_signup_requests r
    set approval_notify_pending = false
    where r.approval_notify_pending
    returning r.profile_id, r.gym_id, r.name
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'profile_id', d.profile_id,
    'name', d.name,
    'email', u.email,
    'gym', g.name,
    'subscriptions', coalesce((
      select jsonb_agg(jsonb_build_object('id', ps.id, 'endpoint', ps.endpoint, 'p256dh', ps.p256dh, 'auth', ps.auth))
      from public.push_subscriptions ps where ps.profile_id = d.profile_id
    ), '[]'::jsonb)
  )), '[]'::jsonb)
  into v_result
  from due d
  join auth.users u on u.id = d.profile_id
  join public.gyms g on g.id = d.gym_id;

  return v_result;
end $$;

-- O job do pg_cron acorda a função também quando há aviso de aprovação pendente.
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
  ) and not exists (
    select 1 from public.student_signup_requests r where r.approval_notify_pending
  ) then
    return;
  end if;

  perform public.wake_push_reminders();
end $$;

revoke execute on function public.claim_student_approval_notifications() from public, anon, authenticated;
grant execute on function public.claim_student_approval_notifications() to service_role;
