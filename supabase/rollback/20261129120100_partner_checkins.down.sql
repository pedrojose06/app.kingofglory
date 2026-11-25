-- Desfaz 20261129120100_partner_checkins.sql. As presenças já criadas pelos check-ins continuam (source gympass/totalpass).
drop function if exists public.partner_checkin_reject(uuid, text);
drop function if exists public.partner_checkin_finish(uuid, text);
drop function if exists public.partner_checkin_prepare(uuid, uuid, uuid);
drop function if exists public.partner_checkin_receive(text, text, text, text, text, timestamptz, text, jsonb);
drop table if exists public.partner_checkins;
drop table if exists public.partner_links;
drop function if exists public.partner_links_same_gym();
drop table if exists public.partner_integrations;
