-- Acesso ao sistema da academia: criação, convite por e-mail confirmado, papéis e isolamento do app do professor.
-- Rodar com: supabase test db
begin;
select plan(22);

-- Contas de teste: A (professor, e-mail confirmado), B (convidado), C (outra pessoa), U (professor sem e-mail confirmado).
insert into auth.users (instance_id, id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('00000000-0000-0000-0000-000000000000', 'a0000000-0000-0000-0000-00000000000a', 'authenticated', 'authenticated', 'a@pgtap.invalid', '', now(), '{}', '{"name":"Admin A"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'b0000000-0000-0000-0000-00000000000b', 'authenticated', 'authenticated', 'mestre@pgtap.invalid', '', null, '{}', '{"name":"Mestre B"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'c0000000-0000-0000-0000-00000000000c', 'authenticated', 'authenticated', 'c@pgtap.invalid', '', now(), '{}', '{"name":"Outro C"}', now(), now()),
  ('00000000-0000-0000-0000-000000000000', 'd0000000-0000-0000-0000-00000000000d', 'authenticated', 'authenticated', 'u@pgtap.invalid', '', null, '{}', '{"name":"Sem confirmar"}', now(), now());
update public.profiles set role = 'instructor'
 where id in ('a0000000-0000-0000-0000-00000000000a', 'd0000000-0000-0000-0000-00000000000d');

create temp table t (k text primary key, v text);
grant all on t to authenticated, anon;

-- ── criar academia ──
set local role authenticated;
set local request.jwt.claims = '{"sub":"d0000000-0000-0000-0000-00000000000d"}';
select throws_like($$ select public.create_academy('Academia X') $$, '%Confirme o seu e-mail%', 'sem e-mail confirmado não cria academia');

set local request.jwt.claims = '{"sub":"c0000000-0000-0000-0000-00000000000c"}';
select throws_like($$ select public.create_academy('Academia X') $$, '%Só professores%', 'conta sem acesso de professor não cria academia');

set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-00000000000a"}';
insert into t values ('gym', public.create_academy('  King of Glory Academy ', 'Rua Teste, 1'));
select is((select count(*)::int from public.my_academies()), 1, 'quem cria vê a academia');
select is((select role from public.my_academies()), 'admin', 'quem cria vira admin');
select is((select name from public.my_academies()), 'King of Glory Academy', 'nome sem espaços nas pontas');
select is((select count(*)::int from public.gyms where id = (select v::uuid from t where k = 'gym')), 0,
  'academia com gestão não aparece no app do professor de quem não dá aula nela');
select is((select count(*)::int from public.gym_instructors where gym_id = (select v::uuid from t where k = 'gym')), 0,
  'quem cria não entra na equipe do app do professor');

-- Academia comum (parceira) continua aparecendo para quem cria, como antes.
insert into public.gyms (name) values ('Parceira');
select is((select count(*)::int from public.gyms where name = 'Parceira'), 1, 'academia parceira continua visível no app do professor');

-- ── alterar dados ──
select lives_ok($$ select public.update_academy((select v::uuid from t where k = 'gym'), 'KOG Academy', null) $$, 'admin renomeia a academia');
select is((select name from public.my_academies()), 'KOG Academy', 'nome alterado');

-- ── convite ──
insert into t values ('token', public.create_academy_invite((select v::uuid from t where k = 'gym'), ' Mestre@PgTap.invalid ', 'admin'));
select is((select count(*)::int from public.academy_invites where email = 'mestre@pgtap.invalid' and token_sha256 <> (select v from t where k = 'token')), 1,
  'convite guardado com e-mail normalizado e só o hash do token');

set local role anon;
select is((select status from public.academy_invite_info((select v from t where k = 'token'))), 'aberto', 'convite legível sem login pelo token');
set local role authenticated;

set local request.jwt.claims = '{"sub":"c0000000-0000-0000-0000-00000000000c"}';
select throws_like($$ select public.accept_academy_invite((select v from t where k = 'token')) $$, '%Este convite é para mestre@pgtap.invalid%',
  'outra conta não aceita o convite');

set local request.jwt.claims = '{"sub":"b0000000-0000-0000-0000-00000000000b"}';
select throws_like($$ select public.accept_academy_invite((select v from t where k = 'token')) $$, '%Confirme o seu e-mail%',
  'convidado sem e-mail confirmado não aceita');
select is((select count(*)::int from public.my_academies()), 0, 'sem e-mail confirmado não tem acesso');

reset role;
update auth.users set email_confirmed_at = now() where id = 'b0000000-0000-0000-0000-00000000000b';
set local role authenticated;
set local request.jwt.claims = '{"sub":"b0000000-0000-0000-0000-00000000000b"}';
select is(public.accept_academy_invite((select v from t where k = 'token')), (select v::uuid from t where k = 'gym'), 'convidado confirmado aceita');
select is((select role from public.my_academies()), 'admin', 'convidado entra com o papel do convite');

-- ── papéis ──
set local request.jwt.claims = '{"sub":"a0000000-0000-0000-0000-00000000000a"}';
select lives_ok($$ select public.set_academy_member_role((select v::uuid from t where k = 'gym'), 'a0000000-0000-0000-0000-00000000000a', 'membro') $$,
  'admin pode deixar de ser admin quando há outro');
select throws_like($$ select public.create_academy_invite((select v::uuid from t where k = 'gym'), 'x@pgtap.invalid', 'membro') $$, '%Só o administrador%',
  'membro não convida');
select is((select count(*)::int from public.academy_invites where gym_id = (select v::uuid from t where k = 'gym')), 0, 'membro não lê os convites');

set local request.jwt.claims = '{"sub":"b0000000-0000-0000-0000-00000000000b"}';
select throws_like($$ select public.set_academy_member_role((select v::uuid from t where k = 'gym'), 'b0000000-0000-0000-0000-00000000000b', null) $$,
  '%pelo menos um administrador%', 'o último admin não sai');
select is((select count(*)::int from public.academy_members where gym_id = (select v::uuid from t where k = 'gym')), 2, 'admin vê todos os membros');

select * from finish();
rollback;
