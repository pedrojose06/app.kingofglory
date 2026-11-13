-- Saldo inicial de presenças: totais trazidos de outro sistema (ex.: relatório do InClass, que só
-- exporta o total por aluno, sem datas). Conta para a graduação sem inventar aulas no histórico.
alter table public.students
  add column opening_present integer not null default 0 check (opening_present >= 0),
  add column opening_absent integer not null default 0 check (opening_absent >= 0),
  add column opening_until date;

comment on column public.students.opening_present is 'Presenças anteriores ao uso do app (saldo importado).';
comment on column public.students.opening_absent is 'Faltas anteriores ao uso do app (saldo importado).';
comment on column public.students.opening_until is 'Data até a qual o saldo importado vale.';

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
    -- O saldo só entra se for posterior à última graduação (ou se não houver graduação).
    + case when g.graduated_at is null or s.opening_until > g.graduated_at then s.opening_present else 0 end
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
  ) as last_attendance_on
from public.students s
left join lateral (
  select sg.rank_id, sg.graduated_at
  from public.student_graduations sg
  where sg.student_id = s.id
  order by sg.graduated_at desc, sg.created_at desc
  limit 1
) g on true;
