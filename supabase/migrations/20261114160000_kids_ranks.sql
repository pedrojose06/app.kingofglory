-- Graduação infantil: trilha própria de graus (Branco → Amarelo → Laranja → Verde).
--
-- ranks.track separa as trilhas; o número do grau (grade) passa a ser único dentro da trilha.
-- students.track diz qual trilha o aluno segue: o próximo grau sugerido sai dela.
-- Pular graus continua permitido ao registrar a graduação.

alter table public.ranks
  add column track text not null default 'adulto' check (track in ('adulto', 'infantil'));
comment on column public.ranks.track is 'Trilha de graduação: adulto ou infantil.';

alter table public.ranks drop constraint ranks_grade_key;
alter table public.ranks add constraint ranks_track_grade_key unique (track, grade);

insert into public.ranks (track, grade, name, level, colors) values
  ('infantil', 1, 'Branco',  'Infantil', '{#ffffff}'),
  ('infantil', 2, 'Amarelo', 'Infantil', '{#facc15}'),
  ('infantil', 3, 'Laranja', 'Infantil', '{#f97316}'),
  ('infantil', 4, 'Verde',   'Infantil', '{#16a34a}');

alter table public.students
  add column track text not null default 'adulto' check (track in ('adulto', 'infantil'));
comment on column public.students.track is 'Trilha de graduação que o aluno segue: adulto ou infantil.';
