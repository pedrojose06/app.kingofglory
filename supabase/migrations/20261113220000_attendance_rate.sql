-- Graduação por taxa de presença e data de início do aluno.
--
-- Antes: "aulas no período" era um número fixo configurado no grau e a presença exigida era um % dele.
-- Agora: o % mínimo vale sobre as aulas que o aluno de fato teve desde a última graduação
-- (presenças + faltas, incluindo o saldo importado). required_classes passa a ser um mínimo
-- absoluto de presenças, opcional.
--
-- Aluno sem graduação registrada não é mais tratado como Branco: o primeiro grau pode ser
-- Branco ou direto Vermelho e Branco.

alter table public.students add column started_on date;
update public.students set started_on = (created_at at time zone 'America/Sao_Paulo')::date;
alter table public.students
  alter column started_on set not null,
  alter column started_on set default public.today_sp();
comment on column public.students.started_on is
  'Início do aluno: base do intervalo mínimo enquanto ele não tem graduação registrada.';

comment on column public.ranks.required_classes is
  'Mínimo de presenças desde a graduação anterior (opcional).';
comment on column public.ranks.min_percent is
  'Presença mínima (%) sobre as aulas que o aluno teve desde a graduação anterior (presenças + faltas).';

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
  ) as last_attendance_on,
  -- Aulas do período: presenças + faltas não justificadas desde a última graduação, mais o saldo.
  (
    (
      select count(*) from public.attendance a
      where a.student_id = s.id
        and a.status in ('present', 'late', 'absent')
        and (g.graduated_at is null or a.date > g.graduated_at)
    )
    + case when g.graduated_at is null or s.opening_until > g.graduated_at
        then s.opening_present + s.opening_absent else 0 end
  )::integer as classes_since
from public.students s
left join lateral (
  select sg.rank_id, sg.graduated_at
  from public.student_graduations sg
  where sg.student_id = s.id
  order by sg.graduated_at desc, sg.created_at desc
  limit 1
) g on true;
