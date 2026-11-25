-- Parte do saldo importado (sem datas) que é posterior à última graduação, informada pelo professor.
-- Usada quando a graduação caiu dentro do período do saldo: aí o saldo inteiro não conta para o
-- próximo grau, mas esta parte sim. Não muda o total do aluno (já está em opening_present).

alter table public.students
  add column opening_after_grad integer check (opening_after_grad >= 0);
comment on column public.students.opening_after_grad is
  'Presenças do saldo importado posteriores à última graduação (informadas manualmente).';

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
    + case when o.counts then s.opening_present else least(coalesce(s.opening_after_grad, 0), s.opening_present) end
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
    + case when o.counts then s.opening_present + s.opening_absent
        else least(coalesce(s.opening_after_grad, 0), s.opening_present) end
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
  select g.graduated_at is null
    or g.graduated_at < coalesce(s.opening_from, s.opening_until) as counts
) o;
