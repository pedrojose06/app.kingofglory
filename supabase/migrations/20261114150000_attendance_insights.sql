-- Análise de frequência em Pendências: alunos com faltas seguidas e padrões de lotação das aulas.

-- Limite de faltas seguidas por professor: avisa quando o aluno PASSA desse número.
alter table public.profiles
  add column absence_alert_threshold smallint not null default 5
  check (absence_alert_threshold between 1 and 99);
grant update (absence_alert_threshold) on public.profiles to authenticated;

-- Faltas seguidas de cada aluno ativo: faltas em aulas depois da última presença (presença avulsa também conta
-- como presença). Falta justificada não entra na conta nem zera a sequência. Respeita a RLS de quem consulta.
create view public.student_absence_streaks
with (security_invoker = true) as
select
  s.id as student_id,
  s.gym_id,
  lp.last_present_on,
  (
    select count(*) from public.attendance a
    where a.student_id = s.id
      and a.class_id is not null
      and a.status = 'absent'
      and (lp.last_present_on is null or a.date > lp.last_present_on)
  )::integer as absences_in_row
from public.students s
left join lateral (
  select max(a.date) as last_present_on
  from public.attendance a
  where a.student_id = s.id and a.status in ('present', 'late')
) lp on true
where s.active;

-- Alunos presentes (presença + atraso) por aula concluída: base da análise de padrões.
create view public.class_turnout
with (security_invoker = true) as
select
  c.id as class_id,
  c.gym_id,
  c.date,
  c.start_time,
  (count(a.id) filter (where a.status in ('present', 'late')))::integer as present
from public.classes c
left join public.attendance a on a.class_id = c.id
where c.status = 'done'
group by c.id;
