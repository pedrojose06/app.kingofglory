-- Desfaz 20261128130000_academy_pay_many.
drop function if exists public.pay_charges(uuid[], date, text, text);
