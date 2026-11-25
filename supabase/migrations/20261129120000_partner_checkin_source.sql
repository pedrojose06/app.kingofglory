-- Origem das presenças vindas de check-in nos apps parceiros (Gympass/Wellhub e TotalPass).
-- Fica numa migration própria: um valor novo de enum só pode ser usado depois que a transação que o criou termina.
-- Rollback: supabase/rollback/20261129120000_partner_checkin_source.down.sql
alter type public.attendance_source add value if not exists 'gympass';
alter type public.attendance_source add value if not exists 'totalpass';
