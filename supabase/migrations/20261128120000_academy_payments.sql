-- Baixa e estorno de cobranças da academia (tela Mensalidades). A tabela payments só aceita gravação por estas
-- funções: a cobrança e o pagamento mudam juntos, numa transação, e só o administrador da academia pode.

-- Dá baixa: registra o pagamento e marca a cobrança como paga. Devolve o id do pagamento.
create or replace function public.pay_charge(
  p_charge_id uuid,
  p_paid_on date,
  p_amount_cents integer,
  p_method text,
  p_notes text default null
) returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_charge public.charges;
  v_id uuid;
begin
  select * into v_charge from public.charges where id = p_charge_id for update;
  if v_charge.id is null or not public.is_academy_admin(v_charge.gym_id) then
    raise exception 'Cobrança não encontrada.';
  end if;
  if v_charge.status <> 'aberta' then
    raise exception 'Esta cobrança não está em aberto.';
  end if;
  if p_paid_on is null or p_paid_on > public.today_sp() then
    raise exception 'Informe a data do pagamento (hoje ou antes).';
  end if;
  if p_amount_cents is null or p_amount_cents < 0 then
    raise exception 'Informe o valor pago.';
  end if;
  insert into public.payments (charge_id, gym_id, paid_on, amount_cents, method, notes, received_by, source)
  values (p_charge_id, v_charge.gym_id, p_paid_on, p_amount_cents, p_method, nullif(trim(coalesce(p_notes, '')), ''), (select auth.uid()), 'manual')
  returning id into v_id;
  update public.charges set status = 'paga' where id = p_charge_id;
  return v_id;
end $$;

-- Desfaz uma baixa feita por engano: o pagamento fica estornado (com o motivo) e a cobrança volta a ficar em aberto.
create or replace function public.reverse_payment(p_charge_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_charge public.charges;
begin
  select * into v_charge from public.charges where id = p_charge_id for update;
  if v_charge.id is null or not public.is_academy_admin(v_charge.gym_id) then
    raise exception 'Cobrança não encontrada.';
  end if;
  if v_charge.status <> 'paga' then
    raise exception 'Esta cobrança não está paga.';
  end if;
  if length(trim(coalesce(p_reason, ''))) = 0 then
    raise exception 'Informe o motivo.';
  end if;
  update public.payments
     set reversed_at = now(), reversed_by = (select auth.uid()), reverse_reason = trim(p_reason)
   where charge_id = p_charge_id and reversed_at is null;
  update public.charges set status = 'aberta' where id = p_charge_id;
end $$;

revoke execute on function public.pay_charge(uuid, date, integer, text, text), public.reverse_payment(uuid, text) from public, anon;
grant execute on function public.pay_charge(uuid, date, integer, text, text), public.reverse_payment(uuid, text) to authenticated;
