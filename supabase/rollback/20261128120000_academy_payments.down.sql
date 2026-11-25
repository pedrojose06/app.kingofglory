-- Desfaz 20261128120000_academy_payments: as funções de baixa e estorno (os pagamentos gravados continuam).
drop function if exists public.reverse_payment(uuid, text);
drop function if exists public.pay_charge(uuid, date, integer, text, text);
