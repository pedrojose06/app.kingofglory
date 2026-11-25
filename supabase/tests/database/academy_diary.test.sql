-- Diários de aula da academia: quem lança aula, chama, sobe foto e confirma rosto; isolamento do app do professor.
-- Rodar com: supabase test db
begin;
select plan(35);

-- Pessoas: ADM (admin da academia), PRO (professor da academia), MEM (membro), OUT (professor de outra academia).
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

-- Alunos da academia: 1 e 3 na turma (1 com consentimento de imagem), 2 fora da turma; 4 da parceira.
insert into public.students (id, gym_id, name, birth_date, image_consent_at) values
  ('5a000000-0000-0000-0000-000000000001', 'ac000000-0000-0000-0000-0000000000ac', 'Aluno Um', '2000-01-01', now()),
  ('5a000000-0000-0000-0000-000000000002', 'ac000000-0000-0000-0000-0000000000ac', 'Aluno Dois', '1999-05-05', null),
  ('5a000000-0000-0000-0000-000000000003', 'ac000000-0000-0000-0000-0000000000ac', 'Aluno Três', '1995-03-03', null),
  ('5b000000-0000-0000-0000-000000000001', 'ba000000-0000-0000-0000-0000000000ba', 'Aluno Parceira', '1990-01-01', now());

insert into public.modalities (id, gym_id, name, belt_system) values
  ('30000000-0000-0000-0000-000000000001', 'ac000000-0000-0000-0000-0000000000ac', 'Muay Thai', 'muay_thai'),
  ('30000000-0000-0000-0000-000000000002', 'ba000000-0000-0000-0000-0000000000ba', 'Muay Thai Parceira', 'muay_thai');
insert into public.class_groups (id, gym_id, modality_id, name) values
  ('31000000-0000-0000-0000-000000000001', 'ac000000-0000-0000-0000-0000000000ac', '30000000-0000-0000-0000-000000000001', 'Muay Thai Adulto'),
  ('31000000-0000-0000-0000-000000000002', 'ba000000-0000-0000-0000-0000000000ba', '30000000-0000-0000-0000-000000000002', 'Turma da Parceira');
insert into public.class_group_members (group_id, student_id, joined_on) values
  ('31000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000001', '2026-01-01'),
  ('31000000-0000-0000-0000-000000000001', '5a000000-0000-0000-0000-000000000003', '2026-01-01');

-- Grade: segunda às 19h, desde 01/03/2026.
insert into public.class_schedules (id, gym_id, instructor_id, group_id, weekday, start_time, title, starts_on) values
  ('51000000-0000-0000-0000-000000000001', 'ac000000-0000-0000-0000-0000000000ac', 'a2000000-0000-0000-0000-000000000002',
   '31000000-0000-0000-0000-000000000001', 1, '19:00', 'Muay Thai Adulto', '2026-03-01');

create temp table t (k text primary key, v text);
grant all on t to authenticated;

-- ── coerência (como postgres) ──
select throws_like($$ insert into public.classes (gym_id, instructor_id, group_id, date)
  values ('ac000000-0000-0000-0000-0000000000ac', 'a2000000-0000-0000-0000-000000000002', '31000000-0000-0000-0000-000000000002', '2026-03-03') $$,
  '%Turma de outra academia%', 'a aula não aponta para turma de outra academia');
select throws_like($$ update public.class_schedules set group_id = '31000000-0000-0000-0000-000000000002' $$,
  '%Turma de outra academia%', 'a grade não aponta para turma de outra academia');

-- ── sem o cabeçalho do app da academia (= app do professor) ──
set local role authenticated;
set local request.jwt.claims = '{"sub":"a1000000-0000-0000-0000-000000000001"}';
select is(public.ensure_academy_classes('ac000000-0000-0000-0000-0000000000ac', '2026-03-02', '2026-03-15'), 0,
  'sem o cabeçalho da academia a grade fica invisível e nada é gerado');
select is((select count(*)::int from public.class_schedules), 0, 'no app do professor a grade da academia não aparece');

-- ── admin: grade e aulas ──
set local request.headers = '{"x-kog-app":"academia"}';
select is((select count(*)::int from public.class_schedules), 1, 'admin vê a grade da academia');
select is(public.ensure_academy_classes('ac000000-0000-0000-0000-0000000000ac', '2026-03-02', '2026-03-15'), 2,
  'gera as duas segundas do período');
select is(public.ensure_academy_classes('ac000000-0000-0000-0000-0000000000ac', '2026-03-02', '2026-03-15'), 0, 'gerar de novo não duplica');
select is((select count(*)::int from public.classes where group_id = '31000000-0000-0000-0000-000000000001'), 2, 'as aulas nascem com a turma da grade');
select is((select start_time::text from public.classes where date = '2026-03-09'), '19:00:00', 'a aula leva o horário da grade');
select throws_like($$ select public.ensure_academy_classes('ac000000-0000-0000-0000-0000000000ac', '2026-03-01', '2026-09-01') $$,
  '%Período inválido%', 'período grande demais é recusado');
select throws_like($$ select public.ensure_academy_classes('ba000000-0000-0000-0000-0000000000ba', '2026-03-02', '2026-03-15') $$,
  '%Sem acesso%', 'não gera aulas de outra academia');
select lives_ok($$ insert into public.classes (id, gym_id, group_id, date, start_time, title)
  values ('c1000000-0000-0000-0000-000000000001', 'ac000000-0000-0000-0000-0000000000ac', null, '2026-03-04', '10:00', 'Aulão') $$,
  'admin lança uma aula extra');
insert into t select 'monday', id::text from public.classes where date = '2026-03-02';

-- ── professor da academia ──
set local request.jwt.claims = '{"sub":"a2000000-0000-0000-0000-000000000002"}';
select is((select count(*)::int from public.classes), 3, 'professor vê as aulas da academia');
select lives_ok($$ insert into public.classes (gym_id, date, start_time, title)
  values ('ac000000-0000-0000-0000-0000000000ac', '2026-03-05', '20:00', 'Extra') $$, 'professor lança aula');
select throws_like($$ insert into public.class_schedules (gym_id, weekday, start_time) values ('ac000000-0000-0000-0000-0000000000ac', 2, '18:00') $$,
  '%row-level security%', 'professor não monta a grade');

select is(public.mark_attendance_batch(('[{"class_id":"' || (select v from t where k = 'monday') ||
  '","student_id":"5a000000-0000-0000-0000-000000000001","status":"present","source":"face"}]')::jsonb), 1, 'professor marca presença pelo lote');
select is((select source::text from public.attendance where student_id = '5a000000-0000-0000-0000-000000000001'), 'face', 'a origem da presença fica registrada');
select is(public.mark_attendance_batch(('[{"class_id":"' || (select v from t where k = 'monday') ||
  '","student_id":"5b000000-0000-0000-0000-000000000001","status":"present"}]')::jsonb), 0, 'aluno de outra academia não entra na chamada');

-- Concluir: só quem é da turma e não foi marcado vira falta (o Aluno Dois, fora da turma, não).
select lives_ok($$ select public.conclude_academy_class((select v::uuid from t where k = 'monday')) $$, 'professor conclui a chamada');
select is((select status::text from public.classes where id = (select v::uuid from t where k = 'monday')), 'done', 'a aula fica concluída');
select is((select count(*)::int from public.attendance where class_id = (select v::uuid from t where k = 'monday')), 2,
  'só os alunos da turma entram (presente + falta)');
select is((select status::text from public.attendance where student_id = '5a000000-0000-0000-0000-000000000003'), 'absent', 'quem da turma não veio vira falta');
select is((select status::text from public.attendance where student_id = '5a000000-0000-0000-0000-000000000001'), 'present', 'a presença marcada é mantida');

-- Aula sem turma: todos os alunos ativos da academia.
select lives_ok($$ select public.conclude_academy_class('c1000000-0000-0000-0000-000000000001') $$, 'conclui a aula sem turma');
select is((select count(*)::int from public.attendance where class_id = 'c1000000-0000-0000-0000-000000000001'), 3, 'aula sem turma cobra todos os alunos da academia');

-- ── fotos e rostos ──
insert into public.class_photos (id, class_id, storage_path)
  values ('f0000000-0000-0000-0000-000000000001', (select v::uuid from t where k = 'monday'),
    'ac000000-0000-0000-0000-0000000000ac/' || (select v from t where k = 'monday') || '/f0000000-0000-0000-0000-000000000001.jpg');
select is((select count(*)::int from public.class_photos), 1, 'professor sobe e vê a foto da aula');
select lives_ok($$ insert into storage.objects (bucket_id, name) values ('class-photos', 'ac000000-0000-0000-0000-0000000000ac/x/foto.jpg') $$,
  'professor envia o arquivo da foto');
select throws_like($$ insert into storage.objects (bucket_id, name) values ('class-photos', 'ba000000-0000-0000-0000-0000000000ba/x/foto.jpg') $$,
  '%row-level security%', 'não envia arquivo para a pasta de outra academia');

select lives_ok($$ select public.save_face_decisions(('[{"photo_id":"f0000000-0000-0000-0000-000000000001","face_index":0,
  "bbox":{"x":0.1,"y":0.1,"w":0.2,"h":0.2},"student_id":"5a000000-0000-0000-0000-000000000001","decision":"corrected",
  "embedding_id":"e0000000-0000-0000-0000-000000000001","embedding":[' || array_to_string(array_fill(0.088::numeric, array[128]), ',') || ']}]')::jsonb) $$,
  'professor confirma um rosto e a referência é guardada');
select is((select count(*)::int from public.face_references('ac000000-0000-0000-0000-0000000000ac')), 1, 'a referência volta para o reconhecimento');
select throws_like($$ select public.save_face_decisions('[{"photo_id":"f0000000-0000-0000-0000-000000000001","face_index":1,
  "bbox":{"x":0.5,"y":0.1,"w":0.2,"h":0.2},"student_id":"5a000000-0000-0000-0000-000000000002","decision":"corrected"}]'::jsonb) $$,
  '%consentimento%', 'aluno sem consentimento de imagem não é reconhecido');

-- ── professor de outra academia e membro ──
set local request.jwt.claims = '{"sub":"a4000000-0000-0000-0000-000000000004"}';
select is((select count(*)::int from public.classes where gym_id = 'ac000000-0000-0000-0000-0000000000ac'), 0, 'professor de fora não vê as aulas da academia');
select throws_like($$ insert into public.class_photos (class_id, storage_path) values ((select v::uuid from t where k = 'monday'), 'x') $$,
  '%row-level security%', 'professor de fora não sobe foto na aula da academia');

set local request.jwt.claims = '{"sub":"a3000000-0000-0000-0000-000000000003"}';
select is((select count(*)::int from public.classes), 0, 'membro não vê as aulas');
select is((select count(*)::int from public.face_embeddings), 0, 'membro não vê os vetores de rosto');

select * from finish();
rollback;
