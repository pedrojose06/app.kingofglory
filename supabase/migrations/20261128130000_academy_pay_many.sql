-- Baixa em lote (ex.: o aluno quita vários meses atrasados de uma vez): mesma regra de pay_charge, cada cobrança
-- pelo valor dela, tudo numa transação — se uma falhar, nenhuma é baixada. Devolve quantas foram baixadas.
create or replace function public.pay_charges(
  p_charge_ids uuid[],
  p_paid_on date,
  p_method text,
  p_notes text default null
) returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
  v_amount integer;
  v_count integer := 0;
begin
  if coalesce(cardinality(p_charge_ids), 0) = 0 then
    raise exception 'Escolha ao menos uma cobrança.';
  end if;
  foreach v_id in array (select array_agg(distinct x) from unnest(p_charge_ids) x) loop
    select amount_cents into v_amount from public.charges where id = v_id;
    perform public.pay_charge(v_id, p_paid_on, coalesce(v_amount, 0), p_method, p_notes);
    v_count := v_count + 1;
  end loop;
  return v_count;
end $$;

revoke execute on function public.pay_charges(uuid[], date, text, text) from public, anon;
grant execute on function public.pay_charges(uuid[], date, text, text) to authenticated;
