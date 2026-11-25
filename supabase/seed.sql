-- Seed de desenvolvimento local (roda em `supabase db reset`). NÃO aplicar em produção.
-- Login: professor@example.com / senha123

insert into auth.users (
  instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  confirmation_token, recovery_token, email_change, email_change_token_new
) values (
  '00000000-0000-0000-0000-000000000000', '11111111-1111-1111-1111-111111111111',
  'authenticated', 'authenticated', 'professor@example.com',
  extensions.crypt('senha123', extensions.gen_salt('bf')), now(),
  '{"provider":"email","providers":["email"]}', '{"name":"Professor Exemplo"}', now(), now(),
  '', '', '', ''
);
insert into auth.identities (id, user_id, provider_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
values (
  gen_random_uuid(), '11111111-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111',
  '{"sub":"11111111-1111-1111-1111-111111111111","email":"professor@example.com"}', 'email', now(), now(), now()
);

-- Conta nova começa como aluno (instructor_invites); o professor de exemplo é promovido aqui.
update public.profiles set role = 'instructor' where id = '11111111-1111-1111-1111-111111111111';

insert into public.gyms (id, name, address, created_by) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Academia Centro', 'Rua Exemplo, 100 — Bauru', '11111111-1111-1111-1111-111111111111'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'Academia Jardim', 'Av. Exemplo, 200 — Bauru', '11111111-1111-1111-1111-111111111111');

-- Terças e quintas nas duas academias, começando 3 semanas atrás (gera pendências de exemplo).
insert into public.class_schedules (gym_id, instructor_id, weekday, start_time, title, starts_on)
select g.id, '11111111-1111-1111-1111-111111111111', d.weekday, g.t, 'Muay Thai', public.today_sp() - 21
from (values
  ('aaaaaaaa-0000-0000-0000-000000000001'::uuid, '19:00'::time),
  ('aaaaaaaa-0000-0000-0000-000000000002'::uuid, '20:30'::time)
) as g (id, t)
cross join (values (2), (4)) as d (weekday);

insert into public.students (gym_id, name, phone) values
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Ana Souza', '14999990001'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Bruno Lima', '14999990002'),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Carla Mendes', null),
  ('aaaaaaaa-0000-0000-0000-000000000001', 'Diego Alves', null),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'Eduarda Rocha', '14999990005'),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'Felipe Castro', null),
  ('aaaaaaaa-0000-0000-0000-000000000002', 'Gabriela Nunes', null);

-- Requisitos de exemplo para os primeiros graus (ajuste pelo app em Mais › Graus).
update public.ranks set required_classes = 48, min_percent = 75 where grade between 2 and 5;

insert into public.student_graduations (student_id, rank_id, graduated_at, recorded_by)
select s.id, r.id, public.today_sp() - 200, '11111111-1111-1111-1111-111111111111'
from public.students s, public.ranks r
where s.name in ('Ana Souza', 'Eduarda Rocha') and r.grade = 2;
