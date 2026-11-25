-- Desfaz 20261126120100_academy_billing.

drop function if exists public.cancel_contract(uuid, text, date);
drop function if exists public.create_contract(jsonb, uuid[], jsonb);
drop view if exists public.charge_overview;
drop table if exists public.payments;
drop table if exists public.charge_students;
drop table if exists public.charges;
drop table if exists public.contract_students;
drop table if exists public.contracts;
drop table if exists public.plans;
drop table if exists public.student_guardians;
drop table if exists public.payers;
drop function if exists public.can_view_charge(uuid);
drop function if exists public.can_admin_charge(uuid);
drop function if exists public.can_view_contract(uuid);
drop function if exists public.can_admin_contract(uuid);
drop function if exists public.is_own_payer(uuid);
drop function if exists public.billing_same_gym();
