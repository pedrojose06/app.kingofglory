-- Requisitos de graduação voltam a ser uma quantidade fixa de treinos desde a graduação anterior
-- (tabela da equipe; nos graus com * basta min_percent% dessa quantidade).
--
-- Saldo importado: o InClass só dá o total do período, sem datas. Se o aluno se graduou DENTRO do
-- período do saldo, não dá para saber quantos treinos foram depois da graduação, então o saldo não
-- conta para o próximo grau (o contador recomeça do zero). Continua contando no total do aluno.

alter table public.students add column opening_from date;
comment on column public.students.opening_from is 'Data a partir da qual o saldo importado vale.';
update public.students set opening_from = started_on where opening_until is not null;

comment on column public.ranks.required_classes is
  'Treinos exigidos desde a graduação anterior para chegar a este grau.';
comment on column public.ranks.min_percent is
  'Porcentagem mínima de required_classes (ex.: 80). Vazio = 100%.';

create or replace view public.student_progress
with (security_invoker = true) as
select
  s.id as student_id,
  s.gym_id,
  g.rank_id as current_rank_id,
  g.graduated_at as last_graduated_at,
  (
    (
      select count(*) from public.attendance a
      where a.student_id = s.id
        and a.status in ('present', 'late')
        and (g.graduated_at is null or a.date > g.graduated_at)
    )
    + case when o.counts then s.opening_present else 0 end
  )::integer as attendance_since,
  (
    (
      select count(*) from public.attendance a
      where a.student_id = s.id and a.status in ('present', 'late')
    ) + s.opening_present
  )::integer as attendance_total,
  (
    select max(a.date) from public.attendance a
    where a.student_id = s.id and a.status in ('present', 'late')
  ) as last_attendance_on,
  (
    (
      select count(*) from public.attendance a
      where a.student_id = s.id
        and a.status in ('present', 'late', 'absent')
        and (g.graduated_at is null or a.date > g.graduated_at)
    )
    + case when o.counts then s.opening_present + s.opening_absent else 0 end
  )::integer as classes_since
from public.students s
left join lateral (
  select sg.rank_id, sg.graduated_at
  from public.student_graduations sg
  where sg.student_id = s.id
  order by sg.graduated_at desc, sg.created_at desc
  limit 1
) g on true
cross join lateral (
  -- O saldo só conta para o próximo grau se o período inteiro for posterior à última graduação.
  select g.graduated_at is null
    or g.graduated_at < coalesce(s.opening_from, s.opening_until) as counts
) o;
