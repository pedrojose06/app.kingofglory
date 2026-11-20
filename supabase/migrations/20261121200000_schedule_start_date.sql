-- Corrigir a data de início ("a partir de") de um horário da grade.
--
-- * Data mais cedo: as aulas desde a nova data passam a ser geradas (ensure_classes) e entram em Pendências.
-- * Data mais tarde: as aulas antes da nova data que foram geradas por engano somem, desde que estejam vazias
--   (não concluídas, sem presença, sem foto e sem plano de aula). Aula com algum registro é mantida.
-- Feito por função (security definer) porque o professor não apaga aulas pela API (não há policy de delete).

create or replace function public.set_schedule_start(p_schedule_id uuid, p_starts_on date)
returns integer
language plpgsql security definer
set search_path = ''
as $$
declare
  v_schedule public.class_schedules;
  v_removed integer;
begin
  select * into v_schedule from public.class_schedules where id = p_schedule_id for update;
  if v_schedule.id is null or not public.is_gym_member(v_schedule.gym_id) then
    raise exception 'Horário não encontrado.';
  end if;
  if p_starts_on is null or p_starts_on < '2000-01-01' then
    raise exception 'Data de início inválida.';
  end if;
  if v_schedule.ends_on is not null and p_starts_on > v_schedule.ends_on then
    raise exception 'A data de início não pode ser depois do encerramento do horário (%).', to_char(v_schedule.ends_on, 'DD/MM/YYYY');
  end if;

  update public.class_schedules set starts_on = p_starts_on where id = p_schedule_id;

  delete from public.classes c
   where c.schedule_id = p_schedule_id
     and c.date < p_starts_on
     and c.status <> 'done'
     and not exists (select 1 from public.attendance a where a.class_id = c.id)
     and not exists (select 1 from public.class_photos p where p.class_id = c.id)
     and not exists (select 1 from public.lesson_plans l where l.class_id = c.id);
  get diagnostics v_removed = row_count;
  return v_removed;
end $$;

revoke execute on function public.set_schedule_start(uuid, date) from public, anon;
grant execute on function public.set_schedule_start(uuid, date) to authenticated;
