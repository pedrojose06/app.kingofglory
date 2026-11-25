-- Check-ins dos apps parceiros (Gympass/Wellhub e TotalPass), com aprovação automática.
--
-- Fluxo:
--  1. O aluno faz check-in no app parceiro; o parceiro chama a Edge Function partner-checkins (webhook).
--  2. A função chama partner_checkin_receive(): grava o check-in e aplica as regras da academia
--     (aluno vinculado e ativo, aula da grade perto do horário, limite por dia, aprovação automática ligada).
--  3. Passou nas regras: a função valida o check-in na API do parceiro e chama partner_checkin_finish(),
--     que grava a presença. Não passou: o check-in fica "pendente" para a equipe aprovar ou recusar.
--  4. Aprovação manual (app da academia): partner_checkin_prepare() (vincula o aluno, escolhe a aula), a Edge Function
--     valida no parceiro e chama partner_checkin_finish(). Recusa: partner_checkin_reject().
--
-- As chaves de API e o segredo do webhook ficam só nos segredos da Edge Function, nunca no banco.
-- Check-in nunca é apagado (histórico/auditoria). A presença criada tem source 'gympass' ou 'totalpass'.
-- Rollback: supabase/rollback/20261129120100_partner_checkins.down.sql

-- ── configuração por academia ──────────────────────────────────────────────
create table public.partner_integrations (
  gym_id uuid not null references public.gyms (id) on delete cascade,
  provider text not null check (provider in ('gympass', 'totalpass')),
  -- Código da academia no parceiro (no Wellhub, o "gym id").
  external_gym_id text not null check (length(trim(external_gym_id)) > 0),
  enabled boolean not null default true,
  auto_approve boolean not null default true,
  -- Exige uma aula da grade perto do horário do check-in; sem isso, vira presença avulsa.
  require_class boolean not null default true,
  -- Janela: check-in de até N minutos antes do início da aula até M minutos depois.
  window_before_min smallint not null default 60 check (window_before_min between 0 and 240),
  window_after_min smallint not null default 30 check (window_after_min between 0 and 240),
  -- Check-ins aprovados automaticamente por aluno por dia.
  max_per_day smallint not null default 1 check (max_per_day between 1 and 10),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (gym_id, provider)
);
create unique index partner_integrations_external_uq on public.partner_integrations (provider, external_gym_id);
create trigger partner_integrations_touch before update on public.partner_integrations
  for each row execute function public.touch_updated_at();

-- Usuário do parceiro ↔ aluno da academia. Criado na primeira aprovação manual; depois o check-in é automático.
create table public.partner_links (
  gym_id uuid not null references public.gyms (id) on delete cascade,
  provider text not null check (provider in ('gympass', 'totalpass')),
  external_id text not null check (length(trim(external_id)) > 0),
  student_id uuid not null references public.students (id) on delete cascade,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  primary key (gym_id, provider, external_id)
);
create index partner_links_student_idx on public.partner_links (student_id);

create or replace function public.partner_links_same_gym() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if not exists (select 1 from public.students where id = new.student_id and gym_id = new.gym_id) then
    raise exception 'Aluno de outra academia';
  end if;
  return new;
end $$;
create trigger partner_links_same_gym_trg before insert or update on public.partner_links
  for each row execute function public.partner_links_same_gym();

-- ── check-ins recebidos ────────────────────────────────────────────────────
create table public.partner_checkins (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms (id) on delete cascade,
  provider text not null check (provider in ('gympass', 'totalpass')),
  external_id text not null,
  external_name text,
  external_email text,
  checked_in_at timestamptz not null,
  received_at timestamptz not null default now(),
  -- Torna o webhook idempotente (o parceiro pode reenviar o mesmo evento).
  event_key text not null unique,
  student_id uuid references public.students (id) on delete set null,
  -- Aluno com o mesmo e-mail, quando ainda não há vínculo (só sugestão: a equipe confirma).
  suggested_student_id uuid references public.students (id) on delete set null,
  class_id uuid references public.classes (id) on delete set null,
  -- pendente: aguarda a equipe; aprovado: validado no parceiro e com presença; recusado; erro: o parceiro recusou a validação.
  status text not null default 'pendente' check (status in ('pendente', 'aprovado', 'recusado', 'erro')),
  -- Por que não foi aprovado automaticamente, o motivo da recusa ou o erro do parceiro.
  reason text,
  -- Quem decidiu (null = automático).
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  validated_at timestamptz,
  attendance_id uuid references public.attendance (id) on delete set null,
  payload jsonb not null default '{}'::jsonb,
  check ((status = 'aprovado') = (validated_at is not null))
);
create index partner_checkins_gym_idx on public.partner_checkins (gym_id, checked_in_at desc);
create index partner_checkins_open_idx on public.partner_checkins (gym_id, checked_in_at desc) where status in ('pendente', 'erro');
create index partner_checkins_student_idx on public.partner_checkins (student_id, checked_in_at) where student_id is not null;

-- ── RLS ────────────────────────────────────────────────────────────────────
-- Gravação dos check-ins e dos vínculos só pelas funções abaixo.
alter table public.partner_integrations enable row level security;
alter table public.partner_links enable row level security;
alter table public.partner_checkins enable row level security;

create policy partner_integrations_select on public.partner_integrations for select to authenticated
  using (public.is_academy_staff(gym_id));
create policy partner_integrations_insert on public.partner_integrations for insert to authenticated
  with check (public.is_academy_admin(gym_id));
create policy partner_integrations_update on public.partner_integrations for update to authenticated
  using (public.is_academy_admin(gym_id)) with check (public.is_academy_admin(gym_id));
create policy partner_integrations_delete on public.partner_integrations for delete to authenticated
  using (public.is_academy_admin(gym_id));

create policy partner_links_select on public.partner_links for select to authenticated
  using (public.is_academy_staff(gym_id));
create policy partner_links_delete on public.partner_links for delete to authenticated
  using (public.is_academy_staff(gym_id));

create policy partner_checkins_select on public.partner_checkins for select to authenticated
  using (public.is_academy_staff(gym_id));

revoke all on public.partner_integrations, public.partner_links, public.partner_checkins from anon;
revoke insert, update on public.partner_links from authenticated;
revoke insert, update, delete on public.partner_checkins from authenticated;

-- ── funções ────────────────────────────────────────────────────────────────

-- Recebe um check-in do parceiro (só a Edge Function, com a service role). Idempotente por p_event_key.
-- Devolve { id, approve, reason, duplicate, ignored, external_gym_id }: com approve = true, a Edge Function valida
-- o check-in no parceiro e chama partner_checkin_finish().
create or replace function public.partner_checkin_receive(
  p_provider text,
  p_external_gym_id text,
  p_external_id text,
  p_name text,
  p_email text,
  p_checked_in_at timestamptz,
  p_event_key text,
  p_payload jsonb default '{}'::jsonb
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_int public.partner_integrations;
  v_id uuid;
  v_local timestamp := p_checked_in_at at time zone 'America/Sao_Paulo';
  v_student uuid;
  v_active boolean;
  v_suggested uuid;
  v_class uuid;
  v_today integer;
  v_reason text;
begin
  if length(trim(coalesce(p_external_id, ''))) = 0 or p_checked_in_at is null or length(trim(coalesce(p_event_key, ''))) = 0 then
    raise exception 'Check-in sem usuário, horário ou identificador';
  end if;

  select * into v_int from public.partner_integrations
   where provider = p_provider and external_gym_id = trim(p_external_gym_id) and enabled;
  if v_int.gym_id is null then
    return jsonb_build_object('ignored', true, 'approve', false, 'reason', 'Academia não configurada para este parceiro');
  end if;

  insert into public.partner_checkins (gym_id, provider, external_id, external_name, external_email, checked_in_at, event_key, payload)
  values (v_int.gym_id, p_provider, trim(p_external_id), nullif(trim(coalesce(p_name, '')), ''),
          nullif(lower(trim(coalesce(p_email, ''))), ''), p_checked_in_at, p_event_key, coalesce(p_payload, '{}'::jsonb))
  on conflict (event_key) do nothing
  returning id into v_id;
  if v_id is null then
    select id into v_id from public.partner_checkins where event_key = p_event_key;
    return jsonb_build_object('id', v_id, 'duplicate', true, 'approve', false);
  end if;

  -- Aluno: pelo vínculo; sem vínculo, sugere o aluno com o mesmo e-mail (se for um só).
  select l.student_id, s.active into v_student, v_active
    from public.partner_links l join public.students s on s.id = l.student_id
   where l.gym_id = v_int.gym_id and l.provider = p_provider and l.external_id = trim(p_external_id);
  if v_student is null and length(trim(coalesce(p_email, ''))) > 0 then
    select min(s.id::text)::uuid into v_suggested
      from public.students s join public.student_details d on d.student_id = s.id
     where s.gym_id = v_int.gym_id and d.email = lower(trim(p_email))
    having count(*) = 1;
  end if;

  -- Aulas do dia da grade (as que ainda não foram geradas), como ensure_academy_classes().
  insert into public.classes (gym_id, instructor_id, schedule_id, group_id, date, start_time, title)
  select s.gym_id, s.instructor_id, s.id, s.group_id, v_local::date, s.start_time, s.title
    from public.class_schedules s
   where s.gym_id = v_int.gym_id and s.active
     and s.starts_on <= v_local::date and (s.ends_on is null or s.ends_on >= v_local::date)
     and s.weekday = extract(dow from v_local::date)
  on conflict (schedule_id, date) do nothing;

  -- A aula mais perto do horário, dentro da janela.
  select c.id into v_class
    from public.classes c
   where c.gym_id = v_int.gym_id and c.date = v_local::date and c.status <> 'cancelled' and c.start_time is not null
     and v_local between (c.date + c.start_time) - make_interval(mins => v_int.window_before_min)
                     and (c.date + c.start_time) + make_interval(mins => v_int.window_after_min)
   order by abs(extract(epoch from (c.date + c.start_time) - v_local)), c.start_time
   limit 1;

  if v_student is not null then
    select count(*) into v_today from public.partner_checkins pc
     where pc.student_id = v_student and pc.provider = p_provider and pc.status = 'aprovado'
       and (pc.checked_in_at at time zone 'America/Sao_Paulo')::date = v_local::date;
  end if;

  v_reason := case
    when v_student is null then 'Usuário ainda não vinculado a um aluno'
    when not v_active then 'Aluno inativo'
    when v_class is null and v_int.require_class then 'Nenhuma aula da grade perto deste horário'
    when v_today >= v_int.max_per_day then 'Limite de check-ins do dia atingido'
    when not v_int.auto_approve then 'Aprovação automática desligada'
  end;

  update public.partner_checkins
     set student_id = v_student, suggested_student_id = v_suggested, class_id = v_class, reason = v_reason
   where id = v_id;

  return jsonb_build_object('id', v_id, 'approve', v_reason is null, 'reason', v_reason, 'external_gym_id', v_int.external_gym_id);
end $$;

-- Aprovação manual (equipe da academia): vincula o usuário do parceiro ao aluno e escolhe a aula (null = avulsa).
-- Devolve os dados para a Edge Function validar o check-in no parceiro.
create or replace function public.partner_checkin_prepare(p_id uuid, p_student_id uuid, p_class_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ci public.partner_checkins;
  v_ext text;
begin
  select * into v_ci from public.partner_checkins where id = p_id for update;
  if v_ci.id is null or not public.is_academy_staff(v_ci.gym_id) then
    raise exception 'Check-in não encontrado.';
  end if;
  if v_ci.status not in ('pendente', 'erro') then
    raise exception 'Este check-in já foi resolvido.';
  end if;
  if p_student_id is null or not exists (select 1 from public.students where id = p_student_id and gym_id = v_ci.gym_id) then
    raise exception 'Escolha um aluno da academia.';
  end if;
  if p_class_id is not null and not exists (
    select 1 from public.classes
     where id = p_class_id and gym_id = v_ci.gym_id and date = (v_ci.checked_in_at at time zone 'America/Sao_Paulo')::date
  ) then
    raise exception 'A aula precisa ser do dia do check-in.';
  end if;
  select external_gym_id into v_ext from public.partner_integrations where gym_id = v_ci.gym_id and provider = v_ci.provider;
  if v_ext is null then
    raise exception 'Integração com o parceiro não configurada.';
  end if;

  insert into public.partner_links (gym_id, provider, external_id, student_id)
  values (v_ci.gym_id, v_ci.provider, v_ci.external_id, p_student_id)
  on conflict (gym_id, provider, external_id) do update set student_id = excluded.student_id, created_by = excluded.created_by, created_at = now();

  update public.partner_checkins
     set student_id = p_student_id, class_id = p_class_id, decided_by = (select auth.uid()), decided_at = now()
   where id = p_id;

  return jsonb_build_object('id', p_id, 'provider', v_ci.provider, 'external_gym_id', v_ext, 'external_id', v_ci.external_id);
end $$;

-- Conclui a aprovação depois da validação no parceiro (só a Edge Function). p_error: o parceiro recusou.
-- Com sucesso, grava a presença (na aula, ou avulsa com o nome do parceiro) e devolve o id dela.
create or replace function public.partner_checkin_finish(p_id uuid, p_error text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ci public.partner_checkins;
  v_date date;
  v_by uuid;
  v_att uuid;
  v_label text;
begin
  select * into v_ci from public.partner_checkins where id = p_id for update;
  if v_ci.id is null then
    raise exception 'Check-in não encontrado.';
  end if;
  if v_ci.status = 'aprovado' then
    return v_ci.attendance_id;
  end if;
  if v_ci.status = 'recusado' then
    raise exception 'Este check-in foi recusado.';
  end if;
  if p_error is not null then
    update public.partner_checkins set status = 'erro', reason = left(p_error, 500) where id = p_id;
    return null;
  end if;
  if v_ci.student_id is null then
    raise exception 'Check-in sem aluno.';
  end if;

  v_date := (v_ci.checked_in_at at time zone 'America/Sao_Paulo')::date;
  -- Quem marcou: quem aprovou; no automático, o professor da aula ou o dono da academia.
  v_by := coalesce(
    v_ci.decided_by,
    (select instructor_id from public.classes where id = v_ci.class_id),
    (select created_by from public.gyms where id = v_ci.gym_id)
  );

  if v_ci.class_id is not null then
    insert into public.attendance (class_id, student_id, gym_id, date, status, source, marked_by)
    values (v_ci.class_id, v_ci.student_id, v_ci.gym_id, v_date, 'present', v_ci.provider::public.attendance_source, v_by)
    on conflict (class_id, student_id) where class_id is not null
    do update set status = 'present', source = excluded.source, marked_by = excluded.marked_by, marked_at = now()
       where attendance.status = 'absent'
    returning id into v_att;
    if v_att is null then
      select id into v_att from public.attendance where class_id = v_ci.class_id and student_id = v_ci.student_id;
    end if;
  else
    v_label := case v_ci.provider when 'gympass' then 'Gympass' else 'TotalPass' end;
    insert into public.attendance (class_id, student_id, gym_id, date, status, source, location_label, marked_by)
    values (null, v_ci.student_id, v_ci.gym_id, v_date, 'present', v_ci.provider::public.attendance_source, v_label, v_by)
    on conflict (student_id, date, location_label, walk_in_period) where class_id is null do nothing
    returning id into v_att;
    if v_att is null then
      select id into v_att from public.attendance
       where class_id is null and student_id = v_ci.student_id and date = v_date and location_label = v_label and walk_in_period = '';
    end if;
  end if;

  update public.partner_checkins
     set status = 'aprovado', validated_at = now(), attendance_id = v_att,
         reason = case when decided_by is null then null else reason end
   where id = p_id;
  return v_att;
end $$;

-- Recusa (equipe da academia). O check-in não é validado no parceiro e não vira presença.
create or replace function public.partner_checkin_reject(p_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ci public.partner_checkins;
begin
  select * into v_ci from public.partner_checkins where id = p_id for update;
  if v_ci.id is null or not public.is_academy_staff(v_ci.gym_id) then
    raise exception 'Check-in não encontrado.';
  end if;
  if v_ci.status not in ('pendente', 'erro') then
    raise exception 'Este check-in já foi resolvido.';
  end if;
  if length(trim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Informe o motivo.';
  end if;
  update public.partner_checkins
     set status = 'recusado', reason = trim(p_reason), decided_by = (select auth.uid()), decided_at = now()
   where id = p_id;
end $$;

revoke execute on function
  public.partner_checkin_receive(text, text, text, text, text, timestamptz, text, jsonb),
  public.partner_checkin_finish(uuid, text),
  public.partner_checkin_prepare(uuid, uuid, uuid),
  public.partner_checkin_reject(uuid, text)
from public, anon, authenticated;
grant execute on function
  public.partner_checkin_receive(text, text, text, text, text, timestamptz, text, jsonb),
  public.partner_checkin_finish(uuid, text)
to service_role;
grant execute on function
  public.partner_checkin_prepare(uuid, uuid, uuid),
  public.partner_checkin_reject(uuid, text)
to authenticated;
