-- Sistema da academia, etapa 1: pagadores/responsáveis, planos, contratos de matrícula, cobranças e pagamentos.
--
-- Regras:
-- - Valores em centavos (inteiro). Datas são dias civis de São Paulo (public.today_sp()).
-- - Cobrança "atrasada" não é guardada: é aberta com vencimento antes de hoje (view charge_overview).
-- - Pagamento nunca é apagado: estorno marca reversed_at. No máximo um pagamento válido por cobrança.
-- - Só o admin da academia vê e mexe no financeiro. O pagador e o aluno (conta logada) veem só o que é deles.
-- - Campos de gateway (PagBank etc.) já existem, sem uso nesta fase.
-- Rollback: supabase/rollback/20261126120100_academy_billing.down.sql

-- ── pagadores (responsáveis financeiros) ──────────────────────────────────
create table public.payers (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  cpf text check (cpf is null or (cpf ~ '^\d{11}$' and public.is_valid_cpf(cpf))),
  email text check (email = lower(trim(email))),
  phone text,
  -- O próprio aluno pagando (maior de idade): um pagador por aluno.
  student_id uuid references public.students (id) on delete set null,
  -- Conta de acesso (membro da academia) quando o pagador tiver uma.
  profile_id uuid references public.profiles (id) on delete set null,
  notes text,
  external_ref text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index payers_cpf_uq on public.payers (gym_id, cpf) where cpf is not null;
create unique index payers_student_uq on public.payers (gym_id, student_id) where student_id is not null;
create unique index payers_ref_uq on public.payers (gym_id, external_ref) where external_ref is not null;
create index payers_profile_idx on public.payers (profile_id) where profile_id is not null;
create trigger payers_touch before update on public.payers for each row execute function public.touch_updated_at();

-- Responsável legal / financeiro de um aluno (menor ou não). Um aluno pode ter vários; um responsável, vários alunos.
create table public.student_guardians (
  student_id uuid not null references public.students (id) on delete cascade,
  payer_id uuid not null references public.payers (id) on delete cascade,
  relationship text,
  legal_guardian boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (student_id, payer_id)
);
create index student_guardians_payer_idx on public.student_guardians (payer_id);

-- ── planos ─────────────────────────────────────────────────────────────────
create table public.plans (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  description text,
  price_cents integer not null check (price_cents >= 0),
  duration_months smallint not null default 12 check (duration_months between 1 and 60),
  enrollment_fee_cents integer not null default 0 check (enrollment_fee_cents >= 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create unique index plans_name_uq on public.plans (gym_id, lower(name));

-- ── contratos de matrícula ─────────────────────────────────────────────────
create table public.contracts (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms (id) on delete cascade,
  payer_id uuid not null references public.payers (id) on delete restrict,
  plan_id uuid references public.plans (id) on delete restrict,
  -- mensal: gera mensalidades; isento: bolsista/sem cobrança; app_parceiro: Gympass/Totalpass (sem mensalidade).
  billing text not null default 'mensal' check (billing in ('mensal', 'isento', 'app_parceiro')),
  status text not null default 'ativo' check (status in ('ativo', 'suspenso', 'cancelado')),
  starts_on date not null,
  ends_on date not null,
  due_day smallint not null check (due_day between 1 and 31),
  amount_cents integer not null check (amount_cents >= 0),
  discount_cents integer not null default 0 check (discount_cents >= 0),
  enrollment_fee_cents integer not null default 0 check (enrollment_fee_cents >= 0),
  notes text,
  -- Importado sem todos os dados (vigência, plano): pede revisão do admin.
  review_needed boolean not null default false,
  source text not null default 'manual' check (source in ('manual', 'importado')),
  external_ref text,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles (id) on delete set null,
  cancel_reason text,
  check (ends_on >= starts_on),
  check (discount_cents <= amount_cents),
  check ((status = 'cancelado') = (cancelled_at is not null))
);
create index contracts_gym_idx on public.contracts (gym_id, status, ends_on);
create index contracts_payer_idx on public.contracts (payer_id);
create unique index contracts_ref_uq on public.contracts (gym_id, external_ref) where external_ref is not null;

create table public.contract_students (
  contract_id uuid not null references public.contracts (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete restrict,
  primary key (contract_id, student_id)
);
create index contract_students_student_idx on public.contract_students (student_id);

-- ── cobranças e pagamentos ─────────────────────────────────────────────────
create table public.charges (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms (id) on delete cascade,
  contract_id uuid references public.contracts (id) on delete restrict,
  payer_id uuid not null references public.payers (id) on delete restrict,
  kind text not null check (kind in ('mensalidade', 'matricula', 'avulsa', 'exame', 'produto')),
  description text,
  -- Mês de referência (dia 1) das mensalidades.
  competence date check (competence is null or extract(day from competence) = 1),
  due_on date not null,
  amount_cents integer not null check (amount_cents >= 0),
  status text not null default 'aberta' check (status in ('aberta', 'paga', 'cancelada')),
  installment smallint check (installment > 0),
  installments_total smallint check (installments_total > 0),
  -- Preparado para cobrança automática (fora desta fase).
  gateway text,
  gateway_charge_id text,
  payment_url text,
  source text not null default 'manual' check (source in ('manual', 'contrato', 'importado')),
  external_ref text,
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  cancelled_at timestamptz,
  cancelled_by uuid references public.profiles (id) on delete set null,
  cancel_reason text,
  check ((status = 'cancelada') = (cancelled_at is not null))
);
create index charges_gym_due_idx on public.charges (gym_id, due_on);
create index charges_open_idx on public.charges (gym_id, due_on) where status = 'aberta';
create index charges_payer_idx on public.charges (payer_id);
create index charges_contract_idx on public.charges (contract_id) where contract_id is not null;
create unique index charges_ref_uq on public.charges (gym_id, external_ref) where external_ref is not null;
-- Uma mensalidade por mês e contrato (a cancelada não conta).
create unique index charges_contract_month_uq on public.charges (contract_id, kind, competence)
  where contract_id is not null and competence is not null and status <> 'cancelada';

create table public.charge_students (
  charge_id uuid not null references public.charges (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete restrict,
  primary key (charge_id, student_id)
);
create index charge_students_student_idx on public.charge_students (student_id);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  charge_id uuid not null references public.charges (id) on delete restrict,
  gym_id uuid not null references public.gyms (id) on delete cascade,
  paid_on date not null,
  amount_cents integer not null check (amount_cents >= 0),
  method text not null check (method in ('pix', 'dinheiro', 'boleto', 'credito', 'debito', 'gympass', 'totalpass', 'transferencia', 'outro')),
  notes text,
  received_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  reversed_at timestamptz,
  reversed_by uuid references public.profiles (id) on delete set null,
  reverse_reason text,
  source text not null default 'manual' check (source in ('manual', 'importado', 'gateway')),
  gateway_payment_id text,
  external_ref text
);
create unique index payments_active_uq on public.payments (charge_id) where reversed_at is null;
create index payments_gym_paid_idx on public.payments (gym_id, paid_on) where reversed_at is null;

-- ── coerência entre academias ──────────────────────────────────────────────
-- Tudo de uma cobrança/contrato pertence à mesma academia (o aluno, o pagador, o plano, o contrato).
create or replace function public.billing_same_gym() returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_gym uuid;
begin
  if tg_table_name = 'payers' then
    if new.student_id is not null and not exists (select 1 from public.students where id = new.student_id and gym_id = new.gym_id) then
      raise exception 'Aluno de outra academia';
    end if;
  elsif tg_table_name = 'student_guardians' then
    if not exists (select 1 from public.students s join public.payers p on p.gym_id = s.gym_id where s.id = new.student_id and p.id = new.payer_id) then
      raise exception 'Responsável e aluno de academias diferentes';
    end if;
  elsif tg_table_name = 'contracts' then
    if not exists (select 1 from public.payers where id = new.payer_id and gym_id = new.gym_id)
       or (new.plan_id is not null and not exists (select 1 from public.plans where id = new.plan_id and gym_id = new.gym_id)) then
      raise exception 'Pagador ou plano de outra academia';
    end if;
  elsif tg_table_name = 'contract_students' then
    select gym_id into v_gym from public.contracts where id = new.contract_id;
    if not exists (select 1 from public.students where id = new.student_id and gym_id = v_gym) then
      raise exception 'Aluno de outra academia';
    end if;
  elsif tg_table_name = 'charges' then
    if not exists (select 1 from public.payers where id = new.payer_id and gym_id = new.gym_id)
       or (new.contract_id is not null and not exists (select 1 from public.contracts where id = new.contract_id and gym_id = new.gym_id)) then
      raise exception 'Pagador ou contrato de outra academia';
    end if;
  elsif tg_table_name = 'charge_students' then
    select gym_id into v_gym from public.charges where id = new.charge_id;
    if not exists (select 1 from public.students where id = new.student_id and gym_id = v_gym) then
      raise exception 'Aluno de outra academia';
    end if;
  elsif tg_table_name = 'payments' then
    select gym_id into new.gym_id from public.charges where id = new.charge_id;
  end if;
  return new;
end $$;

create trigger payers_same_gym before insert or update on public.payers for each row execute function public.billing_same_gym();
create trigger student_guardians_same_gym before insert or update on public.student_guardians for each row execute function public.billing_same_gym();
create trigger contracts_same_gym before insert or update on public.contracts for each row execute function public.billing_same_gym();
create trigger contract_students_same_gym before insert or update on public.contract_students for each row execute function public.billing_same_gym();
create trigger charges_same_gym before insert or update on public.charges for each row execute function public.billing_same_gym();
create trigger charge_students_same_gym before insert or update on public.charge_students for each row execute function public.billing_same_gym();
create trigger payments_same_gym before insert or update on public.payments for each row execute function public.billing_same_gym();

-- ── RLS ────────────────────────────────────────────────────────────────────
create or replace function public.is_own_payer(p_payer_id uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.payers p
    where p.id = p_payer_id
      and (p.profile_id = (select auth.uid()) or (p.student_id is not null and public.is_own_student(p.student_id)))
  )
$$;

create or replace function public.can_view_charge(p_charge_id uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.charges c
    where c.id = p_charge_id
      and (public.is_academy_admin(c.gym_id) or public.is_own_payer(c.payer_id)
           or exists (select 1 from public.charge_students cs where cs.charge_id = c.id and public.is_own_student(cs.student_id)))
  )
$$;

-- Contrato: helpers security definer (as policies de contracts e contract_students se consultam e entrariam em recursão).
create or replace function public.can_admin_contract(p_contract_id uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.contracts c where c.id = p_contract_id and public.is_academy_admin(c.gym_id))
$$;

create or replace function public.can_view_contract(p_contract_id uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.contracts c
    where c.id = p_contract_id
      and (public.is_academy_admin(c.gym_id) or public.is_own_payer(c.payer_id)
           or exists (select 1 from public.contract_students cs where cs.contract_id = c.id and public.is_own_student(cs.student_id)))
  )
$$;

create or replace function public.can_admin_charge(p_charge_id uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.charges c where c.id = p_charge_id and public.is_academy_admin(c.gym_id))
$$;

alter table public.payers enable row level security;
alter table public.student_guardians enable row level security;
alter table public.plans enable row level security;
alter table public.contracts enable row level security;
alter table public.contract_students enable row level security;
alter table public.charges enable row level security;
alter table public.charge_students enable row level security;
alter table public.payments enable row level security;

create policy payers_admin on public.payers for all to authenticated
  using (public.is_academy_admin(gym_id)) with check (public.is_academy_admin(gym_id));
create policy payers_own on public.payers for select to authenticated using (public.is_own_payer(id));

create policy student_guardians_admin on public.student_guardians for all to authenticated
  using (public.can_admin_student(student_id)) with check (public.can_admin_student(student_id));
create policy student_guardians_own on public.student_guardians for select to authenticated
  using (public.is_own_payer(payer_id) or public.is_own_student(student_id));

-- Planos: a equipe vê (o professor sabe o que o aluno contratou); o admin edita.
create policy plans_select on public.plans for select to authenticated using (public.is_academy_staff(gym_id));
create policy plans_admin on public.plans for all to authenticated
  using (public.is_academy_admin(gym_id)) with check (public.is_academy_admin(gym_id));

-- Contratos: sem delete (cancelamento guarda o histórico).
create policy contracts_admin_select on public.contracts for select to authenticated using (public.is_academy_admin(gym_id));
create policy contracts_admin_insert on public.contracts for insert to authenticated with check (public.is_academy_admin(gym_id));
create policy contracts_admin_update on public.contracts for update to authenticated
  using (public.is_academy_admin(gym_id)) with check (public.is_academy_admin(gym_id));
create policy contracts_own on public.contracts for select to authenticated using (public.can_view_contract(id));

create policy contract_students_admin on public.contract_students for all to authenticated
  using (public.can_admin_contract(contract_id)) with check (public.can_admin_contract(contract_id));
create policy contract_students_own on public.contract_students for select to authenticated
  using (public.can_view_contract(contract_id));

-- Cobranças: sem delete (cancela). Status "paga" só pelas funções de baixa (etapa 2) ou importação.
-- Admin e pagador avaliados na própria linha (no INSERT ... RETURNING a linha nova ainda não é visível para funções).
create policy charges_select on public.charges for select to authenticated
  using (public.is_academy_admin(gym_id) or public.is_own_payer(payer_id) or public.can_view_charge(id));
create policy charges_admin_insert on public.charges for insert to authenticated
  with check (public.is_academy_admin(gym_id) and status = 'aberta');
create policy charges_admin_update on public.charges for update to authenticated
  using (public.is_academy_admin(gym_id)) with check (public.is_academy_admin(gym_id));

create policy charge_students_select on public.charge_students for select to authenticated using (public.can_view_charge(charge_id));
create policy charge_students_admin on public.charge_students for all to authenticated
  using (public.can_admin_charge(charge_id)) with check (public.can_admin_charge(charge_id));

-- Pagamentos: leitura; gravação só pelas funções de baixa/estorno (etapa 2).
create policy payments_select on public.payments for select to authenticated using (public.can_view_charge(charge_id));

-- ── visão das cobranças ────────────────────────────────────────────────────
-- Situação calculada (em_aberto / atrasada / paga / cancelada), pagador, alunos e o pagamento válido.
create view public.charge_overview with (security_invoker = true) as
select
  c.id, c.gym_id, c.contract_id, c.payer_id, c.kind, c.description, c.competence, c.due_on, c.amount_cents,
  c.status, c.installment, c.installments_total, c.source, c.created_at, c.cancelled_at, c.cancel_reason,
  case
    when c.status = 'paga' then 'paga'
    when c.status = 'cancelada' then 'cancelada'
    when c.due_on < public.today_sp() then 'atrasada'
    else 'em_aberto'
  end as state,
  case when c.status = 'aberta' and c.due_on < public.today_sp() then public.today_sp() - c.due_on else 0 end as days_late,
  p.name as payer_name,
  coalesce((
    select array_agg(s.name order by s.name) from public.charge_students cs join public.students s on s.id = cs.student_id
    where cs.charge_id = c.id
  ), '{}') as student_names,
  coalesce((select array_agg(cs.student_id) from public.charge_students cs where cs.charge_id = c.id), '{}') as student_ids,
  pay.id as payment_id, pay.paid_on, pay.amount_cents as paid_cents, pay.method as payment_method, pay.notes as payment_notes
from public.charges c
join public.payers p on p.id = c.payer_id
left join public.payments pay on pay.charge_id = c.id and pay.reversed_at is null;

-- ── funções ────────────────────────────────────────────────────────────────

-- Cria o contrato de matrícula com os alunos e as cobranças numa transação só. As parcelas vêm calculadas pelo app
-- (packages/core › domain/billing.ts, com testes); aqui valida o que o banco consegue garantir. security invoker:
-- a RLS de admin vale para cada insert.
-- p_contract: { payer_id, plan_id?, billing, starts_on, ends_on, due_day, amount_cents, discount_cents?, enrollment_fee_cents?, notes? }
-- p_charges:  [{ kind, competence?, due_on, amount_cents, description?, installment?, installments_total? }]
create or replace function public.create_contract(p_contract jsonb, p_student_ids uuid[], p_charges jsonb)
returns uuid
language plpgsql
set search_path = ''
as $$
declare
  v_payer public.payers;
  v_id uuid;
  v_charge uuid;
  v_starts date := (p_contract ->> 'starts_on')::date;
  v_ends date := (p_contract ->> 'ends_on')::date;
  c jsonb;
begin
  select * into v_payer from public.payers where id = (p_contract ->> 'payer_id')::uuid;
  if v_payer.id is null or not public.is_academy_admin(v_payer.gym_id) then
    raise exception 'Só o administrador da academia cria contratos.';
  end if;
  if coalesce(array_length(p_student_ids, 1), 0) = 0 then
    raise exception 'Escolha pelo menos um aluno.';
  end if;

  insert into public.contracts (gym_id, payer_id, plan_id, billing, starts_on, ends_on, due_day, amount_cents, discount_cents, enrollment_fee_cents, notes)
  values (
    v_payer.gym_id, v_payer.id, nullif(p_contract ->> 'plan_id', '')::uuid, coalesce(p_contract ->> 'billing', 'mensal'),
    v_starts, v_ends, (p_contract ->> 'due_day')::smallint, (p_contract ->> 'amount_cents')::integer,
    coalesce((p_contract ->> 'discount_cents')::integer, 0), coalesce((p_contract ->> 'enrollment_fee_cents')::integer, 0),
    nullif(trim(p_contract ->> 'notes'), '')
  )
  returning id into v_id;

  insert into public.contract_students (contract_id, student_id) select v_id, unnest(p_student_ids);

  for c in select * from jsonb_array_elements(coalesce(p_charges, '[]'::jsonb)) loop
    if (c ->> 'due_on')::date < v_starts - 31 or (c ->> 'due_on')::date > v_ends + 31 then
      raise exception 'Parcela com vencimento fora da vigência do contrato.';
    end if;
    insert into public.charges (gym_id, contract_id, payer_id, kind, description, competence, due_on, amount_cents, installment, installments_total, source)
    values (
      v_payer.gym_id, v_id, v_payer.id, c ->> 'kind', nullif(c ->> 'description', ''), (c ->> 'competence')::date,
      (c ->> 'due_on')::date, (c ->> 'amount_cents')::integer, (c ->> 'installment')::smallint,
      (c ->> 'installments_total')::smallint, 'contrato'
    )
    returning id into v_charge;
    insert into public.charge_students (charge_id, student_id) select v_charge, unnest(p_student_ids);
  end loop;

  return v_id;
end $$;

-- Cancela o contrato e as cobranças ainda abertas que vencem a partir de p_from (as anteriores continuam devidas).
create or replace function public.cancel_contract(p_contract_id uuid, p_reason text, p_from date default public.today_sp())
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_gym uuid;
  v_count integer;
begin
  select gym_id into v_gym from public.contracts where id = p_contract_id and status <> 'cancelado';
  if v_gym is null or not public.is_academy_admin(v_gym) then
    raise exception 'Contrato não encontrado ou já cancelado.';
  end if;
  if length(trim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Informe o motivo do cancelamento.';
  end if;
  update public.contracts
     set status = 'cancelado', cancelled_at = now(), cancelled_by = (select auth.uid()), cancel_reason = trim(p_reason)
   where id = p_contract_id;
  update public.charges
     set status = 'cancelada', cancelled_at = now(), cancelled_by = (select auth.uid()), cancel_reason = 'Contrato cancelado: ' || trim(p_reason)
   where contract_id = p_contract_id and status = 'aberta' and due_on >= p_from;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

revoke execute on function public.can_admin_contract(uuid), public.can_view_contract(uuid), public.can_admin_charge(uuid) from public, anon;
grant execute on function public.can_admin_contract(uuid), public.can_view_contract(uuid), public.can_admin_charge(uuid) to authenticated;
revoke execute on function public.is_own_payer(uuid), public.can_view_charge(uuid), public.create_contract(jsonb, uuid[], jsonb),
  public.cancel_contract(uuid, text, date) from public, anon;
grant execute on function public.is_own_payer(uuid), public.can_view_charge(uuid), public.create_contract(jsonb, uuid[], jsonb),
  public.cancel_contract(uuid, text, date) to authenticated;
