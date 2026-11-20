-- Desde quando o professor dá aula na academia. Fica na ligação professor–academia e não depende da grade:
-- trocar ou encerrar um horário não muda essa data, e cada professor da academia tem a sua.

alter table public.gym_instructors add column if not exists started_on date;
comment on column public.gym_instructors.started_on is
  'Data em que o professor começou a dar aula nesta academia. Independe dos horários da grade.';

-- Valor inicial: a primeira aula registrada do professor na academia.
update public.gym_instructors gi
   set started_on = (select min(c.date) from public.classes c where c.gym_id = gi.gym_id and c.instructor_id = gi.profile_id)
 where gi.started_on is null;

-- Cada professor corrige a própria data, seja dono ou não (a policy de update da tabela é só do dono,
-- e liberar o update inteiro deixaria o instrutor mudar o próprio papel).
create or replace function public.set_my_gym_start(p_gym_id uuid, p_started_on date)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if p_started_on is not null and (p_started_on < '2000-01-01' or p_started_on > public.today_sp()) then
    raise exception 'Data inválida: use uma data entre 2000 e hoje.';
  end if;
  update public.gym_instructors
     set started_on = p_started_on
   where gym_id = p_gym_id and profile_id = (select auth.uid());
  if not found then
    raise exception 'Você não dá aula nesta academia.';
  end if;
end $$;

revoke execute on function public.set_my_gym_start(uuid, date) from public, anon;
grant execute on function public.set_my_gym_start(uuid, date) to authenticated;
