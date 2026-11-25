-- Cadastros e financeiro da academia: quem vê o quê, coerência entre academias, contrato com parcelas e atraso.
begin;
select plan(33);

-- Pessoas: ADM (admin da academia), PRO (professor da academia), MEM (membro/pagador), OUT (professor de outra academia).
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'a1000000-0000-0000-0000-000000000001', 'authenticated', 'authenticated', 'adm@pgtap.invalid', '', now(), '{}', '{"name":"Adm"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a2000000-0000-0000-0000-000000000002', 'authenticated', 'authenticated', 'pro@pgtap.invalid', '', now(), '{}', '{"name":"Pro"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a3000000-0000-0000-0000-000000000003', 'authenticated', 'authenticated', 'mem@pgtap.invalid', '', now(), '{}', '{"name":"Mem"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'a4000000-0000-0000-0000-000000000004', 'authenticated', 'authenticated', 'out@pgtap.invalid', '', now(), '{}', '{"name":"Out"}', now(), now());
update public.profiles set role = 'instructor'
 where id in ('a1000000-0000-0000-0000-000000000001', 'a4000000-0000-0000-0000-000000000004');

-- Academia com gestão (AC) e academia parceira (PA, do OUT).
insert into public.gyms (id, name, created_by, management_enabled) values
  ('ac000000-0000-0000-0000-0000000000ac', 'Academia PgTap', 'a1000000-0000-0000-0000-000000000001', true),
  ('ba000000-0000-0000-0000-0000000000ba', 'Parceira PgTap', 'a4000000-0000-0000-0000-000000000004', false);
delete from public.gym_instructors where gym_id = 'ac000000-0000-0000-0000-0000000000ac';
insert into public.academy_members (gym_id, profile_id, role) values
  ('ac000000-0000-0000-0000-0000000000ac', 'a1000000-0000-0000-0000-000000000001', 'admin'),
  ('ac000000-0000-0000-0000-0000000000ac', 'a2000000-0000-0000-0000-000000000002', 'professor'),
  ('ac000000-0000-0000-0000-0000000000ac', 'a3000000-0000-0000-0000-000000000003', 'membro');

insert into public.students (id, gym_id, name, birth_date) values
  ('5a000000-0000-0000-0000-000000000001', 'ac000000-0000-0000-0000-0000000000ac', 'Aluno Um', '2000-01-01'),
  ('5a000000-0000-0000-0000-000000000002', 'ac000000-0000-0000-0000-0000000000ac', 'Aluno Dois', '2015-05-05'),
  ('5b000000-0000-0000-0000-000000000001', 'ba000000-0000-0000-0000-0000000000ba', 'Aluno Parceira', '1990-01-01');
insert into public.student_details (student_id, cpf, city) values ('5a000000-0000-0000-0000-000000000001', '52998224725', 'Bauru');

insert into public.modalities (id, gym_id, name, belt_system) values
  ('30000000-0000-0000-0000-000000000001', 'ac000000-0000-0000-0000-0000000000ac', 'Muay Thai', 'muay_thai');
insert into public.class_groups (id, gym_id, modality_id, name) values
  ('31000000-0000-0000-0000-000000000001', 'ac000000-0000-0000-0000-0000000000ac', '30000000-0000-0000-0000-000000000001', 'Muay Thai Adulto');

-- Pagador: o membro (conta MEM) responsável pelo Aluno Dois.
insert into public.payers (id, gym_id, name, profile_id) values
  ('9a000000-0000-0000-0000-000000000001', 'ac000000-0000-0000-0000-0000000000ac', 'Responsável', 'a3000000-0000-0000-0000-000000000003'),
  ('9a000000-0000-0000-0000-000000000002', 'ac000000-0000-0000-0000-0000000000ac', 'Aluno Um', null);
update public.payers set student_id = '5a000000-0000-0000-0000-000000000001' where id = '9a000000-0000-0000-0000-000000000002';

create temp table t (k text primary key, v text);
grant all on t to authenticated;

-- ── coerência (como postgres) ──
select throws_like($$ insert into public.student_details (student_id, cpf) values ('5a000000-0000-0000-0000-000000000002', '12345678900') $$,
  '%student_details_cpf_check%', 'CPF inválido é recusado');
select throws_like($$ insert into public.class_group_members (group_id, student_id) values ('31000000-0000-0000-0000-000000000001', '5b000000-0000-0000-0000-000000000001') $$,
  '%não pertence à academia da turma%', 'aluno de outra academia não entra na turma');
select throws_like($$ insert into public.payers (gym_id, name, student_id) values ('ac000000-0000-0000-0000-0000000000ac', 'X', '5b000000-0000-0000-0000-000000000001') $$,
  '%outra academia%', 'pagador não aponta para aluno de outra academia');
select is((select gym_id from public.student_details where student_id = '5a000000-0000-0000-0000-000000000001'),
  'ac000000-0000-0000-0000-0000000000ac'::uuid, 'ficha recebe a academia do aluno');

-- ── admin ──
set local role authenticated;
set local request.jwt.claims = '{"sub":"a1000000-0000-0000-0000-000000000001"}';
select is((select count(*)::int from public.students where gym_id = 'ac000000-0000-0000-0000-0000000000ac'), 2, 'admin vê os alunos da academia');
select is((select count(*)::int from public.students where id = '5b000000-0000-0000-0000-000000000001'), 0, 'admin não vê aluno da parceira');
select is((select count(*)::int from public.student_details), 1, 'admin vê a ficha completa');
select lives_ok($$ insert into public.class_group_members (group_id, student_id) values ('31000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000001') $$,
  'admin coloca aluno na turma');
select lives_ok($$ insert into public.student_belts (student_id, belt_rank_id, degrees, graduated_at)
  select '5a000000-0000-0000-0000-000000000001', id, 2, '2026-01-10' from public.belt_ranks where belt_system = 'jiu_jitsu' and track = 'adulto' and name = 'Azul' $$,
  'admin registra faixa de jiu-jitsu');
select is((select count(*)::int from public.ranks where name = 'Azul'), 0, 'faixas do jiu-jitsu não aparecem nos graus do muay thai');

-- Contrato do Aluno Dois, pago pelo responsável: 2 mensalidades (uma já vencida) + matrícula.
insert into t values ('contract', public.create_contract(
  '{"payer_id":"9a000000-0000-0000-0000-000000000001","billing":"mensal","starts_on":"2026-01-01","ends_on":"2030-12-31","due_day":10,"amount_cents":9590,"enrollment_fee_cents":5000}',
  array['5a000000-0000-0000-0000-000000000002']::uuid[],
  ('[{"kind":"matricula","due_on":"2026-01-10","amount_cents":5000},' ||
   '{"kind":"mensalidade","competence":"2026-01-01","due_on":"2026-01-10","amount_cents":9590,"installment":1,"installments_total":2},' ||
   '{"kind":"mensalidade","competence":"2099-12-01","due_on":"2030-12-10","amount_cents":9590,"installment":2,"installments_total":2}]')::jsonb
)::text);
select is((select count(*)::int from public.charges where contract_id = (select v::uuid from t where k = 'contract')), 3, 'contrato cria as cobranças');
select is((select count(*)::int from public.charge_students cs join public.charges c on c.id = cs.charge_id
  where c.contract_id = (select v::uuid from t where k = 'contract') and cs.student_id = '5a000000-0000-0000-0000-000000000002'), 3,
  'cada cobrança leva o aluno');
select is((select state from public.charge_overview where kind = 'mensalidade' and due_on = '2026-01-10'), 'atrasada', 'aberta e vencida = atrasada');
select is((select state from public.charge_overview where due_on = '2030-12-10'), 'em_aberto', 'aberta a vencer = em aberto');
select ok((select days_late from public.charge_overview where kind = 'mensalidade' and due_on = '2026-01-10') > 0, 'dias de atraso calculados');
select is((select payer_name from public.charge_overview where due_on = '2030-12-10'), 'Responsável', 'visão traz o pagador');
select throws_like($$ insert into public.charges (gym_id, payer_id, kind, due_on, amount_cents, competence, contract_id)
  select gym_id, payer_id, 'mensalidade', '2026-01-15', 100, '2026-01-01', id from public.contracts where id = (select v::uuid from t where k = 'contract') $$,
  '%charges_contract_month_uq%', 'não duplica mensalidade do mesmo mês no contrato');
select throws_like($$ insert into public.payments (charge_id, paid_on, amount_cents, method)
  select id, '2026-01-10', 9590, 'pix' from public.charges limit 1 $$, '%row-level security%', 'pagamento não é gravado direto na tabela');
select throws_like($$ select public.create_contract('{"payer_id":"9a000000-0000-0000-0000-000000000001","starts_on":"2026-01-01","ends_on":"2026-12-31","due_day":10,"amount_cents":100,"discount_cents":200}',
  array['5a000000-0000-0000-0000-000000000002']::uuid[], '[]') $$, '%contracts_check%', 'desconto maior que o valor é recusado');
select throws_like($$ select public.create_contract('{"payer_id":"9a000000-0000-0000-0000-000000000001","starts_on":"2026-01-01","ends_on":"2026-12-31","due_day":32,"amount_cents":100}',
  array['5a000000-0000-0000-0000-000000000002']::uuid[], '[]') $$, '%due_day_check%', 'dia de vencimento fora de 1 a 31 é recusado');

-- ── membro (responsável com conta) ──
set local request.jwt.claims = '{"sub":"a3000000-0000-0000-0000-000000000003"}';
select is((select count(*)::int from public.charges), 3, 'responsável vê as próprias cobranças');
select is((select count(*)::int from public.contracts), 1, 'responsável vê o próprio contrato');
select is((select count(*)::int from public.students), 0, 'membro não vê a lista de alunos');
select is((select count(*)::int from public.payers), 1, 'membro vê só o próprio cadastro de pagador');
select is((select count(*)::int from public.student_details), 0, 'membro não vê fichas de outros');

-- ── professor da academia ──
set local request.jwt.claims = '{"sub":"a2000000-0000-0000-0000-000000000002"}';
select is((select count(*)::int from public.students where gym_id = 'ac000000-0000-0000-0000-0000000000ac'), 2, 'professor vê os alunos');
select is((select count(*)::int from public.student_details), 0, 'professor não vê CPF/endereço');
select is((select count(*)::int from public.charges), 0, 'professor não vê o financeiro');
update public.students set name = 'X' where id = '5a000000-0000-0000-0000-000000000001';
select is((select name from public.students where id = '5a000000-0000-0000-0000-000000000001'), 'Aluno Um', 'professor não edita aluno');
select is((select count(*)::int from public.class_group_members), 1, 'professor vê quem está em cada turma');

-- ── professor de outra academia ──
set local request.jwt.claims = '{"sub":"a4000000-0000-0000-0000-000000000004"}';
select is((select count(*)::int from public.students where gym_id = 'ac000000-0000-0000-0000-0000000000ac'), 0, 'professor de fora não vê alunos da academia');

-- ── cancelamento ──
set local request.jwt.claims = '{"sub":"a1000000-0000-0000-0000-000000000001"}';
select is(public.cancel_contract((select v::uuid from t where k = 'contract'), 'Mudou de cidade', '2026-02-01'), 1,
  'cancelar o contrato cancela só as abertas a partir da data');
select is((select state from public.charge_overview where kind = 'mensalidade' and due_on = '2026-01-10'), 'atrasada', 'a vencida antes continua devida');

select * from finish();
rollback;
