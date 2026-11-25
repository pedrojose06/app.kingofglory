-- Sistema da academia: prorrogar o contrato de matrícula.
--
-- O admin escolhe a nova data de fim (o app sugere +1 ano). As mensalidades do período novo vêm calculadas pelo app
-- (packages/core › domain/billing.ts › contractExtensionCharges) e as já existentes passam a mostrar o novo total de
-- parcelas (ex.: 12/12 vira 12/24).
-- Rollback: supabase/rollback/20261128120000_academy_extend_contract.down.sql

-- p_charges: [{ kind, competence?, due_on, amount_cents, description?, installment?, installments_total? }]
-- Devolve quantas cobranças foram criadas.
create or replace function public.extend_contract(p_contract_id uuid, p_ends_on date, p_charges jsonb)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_contract public.contracts;
  v_charge uuid;
  v_total smallint;
  v_count integer := 0;
  c jsonb;
begin
  select * into v_contract from public.contracts where id = p_contract_id and status <> 'cancelado';
  if v_contract.id is null or not public.is_academy_admin(v_contract.gym_id) then
    raise exception 'Contrato não encontrado ou cancelado.';
  end if;
  if p_ends_on is null or p_ends_on <= v_contract.ends_on then
    raise exception 'A nova data de fim precisa ser depois do fim atual (%).', to_char(v_contract.ends_on, 'DD/MM/YYYY');
  end if;

  for c in select * from jsonb_array_elements(coalesce(p_charges, '[]'::jsonb)) loop
    if (c ->> 'due_on')::date <= v_contract.ends_on or (c ->> 'due_on')::date > p_ends_on then
      raise exception 'Parcela com vencimento fora do período da prorrogação.';
    end if;
    insert into public.charges (gym_id, contract_id, payer_id, kind, description, competence, due_on, amount_cents, installment, installments_total, source)
    values (
      v_contract.gym_id, v_contract.id, v_contract.payer_id, c ->> 'kind', nullif(c ->> 'description', ''), (c ->> 'competence')::date,
      (c ->> 'due_on')::date, (c ->> 'amount_cents')::integer, (c ->> 'installment')::smallint,
      (c ->> 'installments_total')::smallint, 'contrato'
    )
    returning id into v_charge;
    insert into public.charge_students (charge_id, student_id)
      select v_charge, cs.student_id from public.contract_students cs where cs.contract_id = v_contract.id;
    v_count := v_count + 1;
    v_total := greatest(coalesce(v_total, 0), (c ->> 'installments_total')::smallint);
  end loop;

  if v_total is not null then
    update public.charges
       set installments_total = v_total
     where contract_id = v_contract.id and kind = 'mensalidade' and installments_total is not null and status <> 'cancelada';
  end if;

  update public.contracts set ends_on = p_ends_on where id = v_contract.id;
  return v_count;
end $$;

revoke execute on function public.extend_contract(uuid, date, jsonb) from public, anon;
grant execute on function public.extend_contract(uuid, date, jsonb) to authenticated;
