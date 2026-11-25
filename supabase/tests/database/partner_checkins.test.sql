-- Check-ins Gympass/TotalPass: regras da aprovação automática, aprovação/recusa manual e quem vê o quê.
begin;
select plan(32);

-- ADM (admin), PRO (professor), MEM (membro) da academia AC; OUT (admin de outra academia, OA).
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'adm@pgtap.invalid', '', now(), '{}', '{"name":"Adm"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a2000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'pro@pgtap.invalid', '', now(), '{}', '{"name":"Pro"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a3000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'mem@pgtap.invalid', '', now(), '{}', '{"name":"Mem"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'out@pgtap.invalid', '', now(), '{}', '{"name":"Out"}', now(), now());
update public.profiles set role = 'instructor'
 where id in ('a1000000-0000-0000-0000-000000000001', 'a2000000-0000-0000-0000-000000000002', 'a4000000-0000-0000-0000-000000000004');

insert into public.gyms (id, name, created_by, management_enabled) values
  ('ac000000-0000-0000-0000-0000000000ac', 'Academia PgTap', 'a1000000-0000-0000-0000-000000000001', true),
  ('0a000000-0000-0000-0000-0000000000a0', 'Outra PgTap', 'a4000000-0000-0000-0000-000000000004', true);
insert into public.academy_members (gym_id, profile_id, role) values
  ('ac000000-0000-0000-0000-0000000000ac', 'a1000000-0000-0000-0000-000000000001', 'admin'),
  ('ac000000-0000-0000-0000-0000000000ac', 'a2000000-0000-0000-0000-000000000002', 'professor'),
  ('ac000000-0000-0000-0000-0000000000ac', 'a3000000-0000-0000-0000-000000000003', 'membro'),
  ('0a000000-0000-0000-0000-0000000000a0', 'a4000000-0000-0000-0000-000000000004', 'admin');

insert into public.students (id, gym_id, name, birth_date, active) values
  ('5a000000-0000-0000-0000-000000000001', 'ac000000-0000-0000-0000-0000000000ac', 'Aluno Gympass', '1995-01-01', true),
  ('5a000000-0000-0000-0000-000000000002', 'ac000000-0000-0000-0000-0000000000ac', 'Aluno Inativo', '1995-01-01', false),
  ('5b000000-0000-0000-0000-000000000001', '0a000000-0000-0000-0000-0000000000a0', 'Aluno Outra', '1995-01-01', true);
insert into public.student_details (student_id, email) values ('5a000000-0000-0000-0000-000000000001', 'aluno@pgtap.invalid');

-- Grade: segundas às 19h (30/11/2026 e 07/12/2026 são segundas).
insert into public.class_schedules (gym_id, instructor_id, weekday, start_time, title, starts_on) values
  ('ac000000-0000-0000-0000-0000000000ac', 'a2000000-0000-0000-0000-000000000002', 1, '19:00', 'Muay Thai', '2026-01-01');

insert into public.partner_integrations (gym_id, provider, external_gym_id) values
  ('ac000000-0000-0000-0000-0000000000ac', 'gympass', '1234');

create temp table t (k text primary key, v jsonb);
grant all on t to authenticated, service_role;

-- ── recebimento (service role) ──
set local role service_role;
select is((public.partner_checkin_receive('gympass', '9999', 'u1', 'X', null, '2026-11-30 19:05-03', 'e0') ->> 'ignored')::boolean, true,
  'academia não configurada: ignora');

insert into t values ('c1', public.partner_checkin_receive('gympass', '1234', 'u1', 'Fulano', 'Aluno@PgTap.invalid', '2026-11-30 18:40-03', 'e1', '{"a":1}'));
select is((select v ->> 'approve' from t where k = 'c1'), 'false', 'usuário sem vínculo não é aprovado sozinho');
select is((select v ->> 'reason' from t where k = 'c1'), 'Usuário ainda não vinculado a um aluno', 'motivo: sem vínculo');
select is((select suggested_student_id from public.partner_checkins where id = (select (v ->> 'id')::uuid from t where k = 'c1')),
  '5a000000-0000-0000-0000-000000000001'::uuid, 'sugere o aluno com o mesmo e-mail');
select isnt((select class_id from public.partner_checkins where id = (select (v ->> 'id')::uuid from t where k = 'c1')), null,
  'acha a aula das 19h (gerada da grade) para check-in às 18h40');
select is((public.partner_checkin_receive('gympass', '1234', 'u1', 'Fulano', null, '2026-11-30 18:40-03', 'e1') ->> 'duplicate')::boolean, true,
  'mesmo evento de novo: não duplica');
select is((select count(*)::int from public.partner_checkins), 1, 'um check-in gravado');

-- ── aprovação manual (professor) ──
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"a2000000-0000-0000-0000-000000000002"}';
select is((select count(*)::int from public.partner_checkins), 1, 'professor vê o check-in');
select throws_like($$ select public.partner_checkin_prepare((select (v ->> 'id')::uuid from t where k = 'c1'), '5b000000-0000-0000-0000-000000000001') $$,
  '%aluno da academia%', 'não vincula aluno de outra academia');
select is((public.partner_checkin_prepare((select (v ->> 'id')::uuid from t where k = 'c1'), '5a000000-0000-0000-0000-000000000001',
  (select class_id from public.partner_checkins where id = (select (v ->> 'id')::uuid from t where k = 'c1'))) ->> 'external_gym_id'), '1234',
  'professor prepara a aprovação');
select is((select student_id from public.partner_links where external_id = 'u1'), '5a000000-0000-0000-0000-000000000001'::uuid, 'vínculo criado');
select throws_like($$ select public.partner_checkin_finish((select (v ->> 'id')::uuid from t where k = 'c1')) $$,
  '%permission denied%', 'app não conclui a aprovação (só a Edge Function)');
select throws_like($$ select public.partner_checkin_receive('gympass', '1234', 'u9', 'X', null, now(), 'e9') $$,
  '%permission denied%', 'app não injeta check-in');

reset role;
set local role service_role;
select isnt(public.partner_checkin_finish((select (v ->> 'id')::uuid from t where k = 'c1')), null, 'validado: grava a presença');
select is((select status from public.partner_checkins where id = (select (v ->> 'id')::uuid from t where k = 'c1')), 'aprovado', 'check-in aprovado');
select is((select source::text || '/' || status::text || '/' || marked_by::text from public.attendance where student_id = '5a000000-0000-0000-0000-000000000001'),
  'gympass/present/a2000000-0000-0000-0000-000000000002', 'presença na aula, origem gympass, marcada por quem aprovou');

-- ── automático ──
insert into t values ('c2', public.partner_checkin_receive('gympass', '1234', 'u1', 'Fulano', null, '2026-11-30 19:20-03', 'e2'));
select is((select v ->> 'reason' from t where k = 'c2'), 'Limite de check-ins do dia atingido', 'segundo check-in no dia fica pendente');

insert into t values ('c3', public.partner_checkin_receive('gympass', '1234', 'u1', 'Fulano', null, '2026-12-07 19:10-03', 'e3'));
select is((select v ->> 'approve' from t where k = 'c3'), 'true', 'aluno vinculado, na janela da aula: aprovação automática');
select lives_ok($$ select public.partner_checkin_finish((select (v ->> 'id')::uuid from t where k = 'c3')) $$, 'conclui o automático');
select is((select a.marked_by from public.attendance a join public.partner_checkins pc on pc.attendance_id = a.id where pc.id = (select (v ->> 'id')::uuid from t where k = 'c3')),
  'a2000000-0000-0000-0000-000000000002'::uuid, 'automático: marcada pelo professor da aula');

insert into t values ('c4', public.partner_checkin_receive('gympass', '1234', 'u1', 'Fulano', null, '2026-12-08 15:00-03', 'e4'));
select is((select v ->> 'reason' from t where k = 'c4'), 'Nenhuma aula da grade perto deste horário', 'sem aula no horário: pendente');

update public.partner_integrations set require_class = false where gym_id = 'ac000000-0000-0000-0000-0000000000ac';
insert into t values ('c5', public.partner_checkin_receive('gympass', '1234', 'u1', 'Fulano', null, '2026-12-09 15:00-03', 'e5'));
select is((select v ->> 'approve' from t where k = 'c5'), 'true', 'sem exigir aula: aprova');
select isnt(public.partner_checkin_finish((select (v ->> 'id')::uuid from t where k = 'c5')), null, 'conclui sem aula');
select is((select location_label from public.attendance a join public.partner_checkins pc on pc.attendance_id = a.id where pc.id = (select (v ->> 'id')::uuid from t where k = 'c5')),
  'Gympass', 'sem aula: presença avulsa "Gympass"');

select public.partner_checkin_finish((select (v ->> 'id')::uuid from t where k = 'c4'), 'Check-in expirado');
select is((select status || ':' || reason from public.partner_checkins where id = (select (v ->> 'id')::uuid from t where k = 'c4')),
  'erro:Check-in expirado', 'parceiro recusou a validação: erro com o motivo');

update public.partner_integrations set auto_approve = false where gym_id = 'ac000000-0000-0000-0000-0000000000ac';
select is(public.partner_checkin_receive('gympass', '1234', 'u1', 'Fulano', null, '2026-12-14 19:00-03', 'e6') ->> 'reason',
  'Aprovação automática desligada', 'aprovação automática desligada');

-- ── recusa e acesso ──
reset role;
set local role authenticated;
set local request.jwt.claims = '{"sub":"a1000000-0000-0000-0000-000000000001"}';
select lives_ok($$ select public.partner_checkin_reject((select (v ->> 'id')::uuid from t where k = 'c2'), 'Duplicado') $$, 'admin recusa');
select throws_like($$ select public.partner_checkin_reject((select (v ->> 'id')::uuid from t where k = 'c2'), 'De novo') $$,
  '%já foi resolvido%', 'não recusa duas vezes');

set local request.jwt.claims = '{"sub":"a3000000-0000-0000-0000-000000000003"}';
select is((select count(*)::int from public.partner_checkins), 0, 'membro não vê os check-ins');
select throws_like($$ select public.partner_checkin_prepare((select (v ->> 'id')::uuid from t where k = 'c4'), '5a000000-0000-0000-0000-000000000001') $$,
  '%não encontrado%', 'membro não aprova');

set local request.jwt.claims = '{"sub":"a4000000-0000-0000-0000-000000000004"}';
select is((select count(*)::int from public.partner_checkins) + (select count(*)::int from public.partner_integrations), 0,
  'admin de outra academia não vê nada');

reset role;
set local role service_role;
select throws_like($$ select public.partner_checkin_finish((select (v ->> 'id')::uuid from t where k = 'c2')) $$,
  '%recusado%', 'check-in recusado não vira presença');

select * from finish();
rollback;
