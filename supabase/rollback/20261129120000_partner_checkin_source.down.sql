-- Desfaz 20261129120000_partner_checkin_source.sql.
-- O Postgres não remove valor de enum: as presenças com essas origens passam a 'manual' e os valores ficam sem uso
-- (inofensivos; a migration usa "add value if not exists" e volta a aplicar sem erro).
update public.attendance set source = 'manual' where source::text in ('gympass', 'totalpass');
