-- Desde quando o professor dá aula na academia. Fica na ligação professor–academia e não depende da grade:
-- trocar ou encerrar um horário não muda essa data, e cada professor da academia tem a sua.

alter table public.gym_instructors add column if not exists started_on date;
comment on column public.gym_instructors.started_on is
  'Data em que o professor começou a dar aula nesta academia. Independe dos horários da grade.';

-- Valor inicial: a primeira aula registrada do professor na academia.
update public.gym_instructors gi
   set started_on = (select min(c.date) from public.classes c where c.gym_id = gi.gym_id and c.instructor_id = gi.profile_id)
 where gi.started_on is null;
