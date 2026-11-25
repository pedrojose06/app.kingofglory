-- Sistema da academia: apagar uma aula avulsa (fora da grade) que foi lançada e não vai acontecer.
--
-- "Não houve aula" continua sendo o caminho para a aula que estava marcada e ninguém apareceu (fica no histórico).
-- Apagar é para a aula avulsa que a própria academia desmarcou: some do diário com a chamada, as fotos e os rostos dela.
-- Aula da grade não se apaga (seria gerada de novo): nela vale "Não houve aula" ou encerrar o horário.
-- Devolve os caminhos das fotos para o app apagar os arquivos do Storage (bucket `class-photos`).
-- Rollback: supabase/rollback/20261125200903_academy_delete_class.down.sql

create or replace function public.delete_academy_class(p_class_id uuid)
returns text[]
language plpgsql security definer
set search_path = ''
as $$
declare
  v_class public.classes;
  v_paths text[];
begin
  select * into v_class from public.classes where id = p_class_id for update;
  if v_class.id is null or not public.is_academy_staff(v_class.gym_id) then
    raise exception 'Aula não encontrada.';
  end if;
  if v_class.schedule_id is not null then
    raise exception 'Aula da grade não pode ser apagada: marque "Não houve aula" ou encerre o horário na grade.';
  end if;

  select coalesce(array_agg(p.storage_path), '{}') into v_paths from public.class_photos p where p.class_id = p_class_id;

  delete from public.attendance where class_id = p_class_id;
  delete from public.class_photos where class_id = p_class_id; -- leva junto face_detections (cascade)
  delete from public.classes where id = p_class_id;            -- leva junto plano e compartilhamento (cascade)
  return v_paths;
end $$;

revoke execute on function public.delete_academy_class(uuid) from public, anon;
grant execute on function public.delete_academy_class(uuid) to authenticated;
