-- Graduação infantil por idade: o requisito é a idade que a criança completa no ano da graduação.
-- Ex.: completa 11 no ano → Branco; 12 → Amarelo. Editável em Mais › Graus.
-- Regras no app: Branco não pode ser pulado; os demais podem (vai direto ao grau da idade);
-- uma graduação infantil por ano.

alter table public.ranks
  add column min_age smallint check (min_age between 0 and 99);
comment on column public.ranks.min_age is
  'Graduação infantil: idade que o aluno completa no ano para poder fazer este grau.';

update public.ranks set min_age = v.age
from (values (1, 11), (2, 12), (3, 13), (4, 14)) as v (grade, age)
where ranks.track = 'infantil' and ranks.grade = v.grade;
