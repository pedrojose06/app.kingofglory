-- Sistema da academia, etapa 3 (diários de aula): a equipe da academia lança as aulas por turma, faz a chamada, sobe a
-- foto da turma e confirma a presença pelo rosto, como o professor faz no app dele.
--
-- - Aulas, grade, presenças, fotos e rostos continuam nas mesmas tabelas do app do professor. A academia ganha policies
--   próprias (a equipe da academia, `academy_members`, não é `gym_instructors`), que só valem com o cabeçalho
--   `x-kog-app: academia` (`request_app()`): quem é das duas equipes não passa a ver as aulas da academia no app do professor.
-- - A turma (`class_groups`) entra na grade e na aula: a chamada de uma aula com turma lista os alunos dela.
-- - O reconhecimento facial não muda: o vetor continua só no banco, só de aluno com `image_consent_at`, e retirar o
--   consentimento apaga tudo (triggers de `face_recognition`). Aqui só se libera a equipe da academia.
-- Rollback: supabase/rollback/20261127120000_academy_diary.down.sql

-- ── turma na grade e na aula ───────────────────────────────────────────────
alter table public.class_schedules add column group_id uuid references public.class_groups (id) on delete set null;
alter table public.classes add column group_id uuid references public.class_groups (id) on delete set null;
create index class_schedules_group_idx on public.class_schedules (group_id) where group_id is not null;
create index classes_group_date_idx on public.classes (group_id, date desc) where group_id is not null;

-- A turma é da mesma academia da grade/aula.
create or replace function public.class_group_same_gym() returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.group_id is not null
     and not exists (select 1 from public.class_groups g where g.id = new.group_id and g.gym_id = new.gym_id) then
    raise exception 'Turma de outra academia' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger class_schedules_group_gym before insert or update of group_id, gym_id on public.class_schedules
  for each row execute function public.class_group_same_gym();
create trigger classes_group_gym before insert or update of group_id, gym_id on public.classes
  for each row execute function public.class_group_same_gym();

-- ── helpers de acesso ──────────────────────────────────────────────────────
create or replace function public.can_staff_class(p_class_id uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.classes c where c.id = p_class_id and public.is_academy_staff(c.gym_id))
$$;

create or replace function public.can_staff_photo(p_photo_id uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.class_photos p
    join public.classes c on c.id = p.class_id
    where p.id = p_photo_id and public.is_academy_staff(c.gym_id)
  )
$$;

-- ── grade e aulas ──────────────────────────────────────────────────────────
-- Grade: a equipe vê; só o administrador monta (como as turmas).
create policy class_schedules_select_academy on public.class_schedules for select to authenticated
  using (public.request_app() = 'academia' and public.is_academy_staff(gym_id));
create policy class_schedules_write_academy on public.class_schedules for all to authenticated
  using (public.request_app() = 'academia' and public.is_academy_admin(gym_id))
  with check (public.request_app() = 'academia' and public.is_academy_admin(gym_id));

-- Aulas: a equipe lança e conduz. Sem delete: aula é cancelada, não apagada (preserva presenças).
create policy classes_select_academy on public.classes for select to authenticated
  using (public.request_app() = 'academia' and public.is_academy_staff(gym_id));
create policy classes_insert_academy on public.classes for insert to authenticated
  with check (public.request_app() = 'academia' and public.is_academy_staff(gym_id));
create policy classes_update_academy on public.classes for update to authenticated
  using (public.request_app() = 'academia' and public.is_academy_staff(gym_id))
  with check (public.request_app() = 'academia' and public.is_academy_staff(gym_id));

-- ── presença ───────────────────────────────────────────────────────────────
-- Só presença de aula (a avulsa é do app do professor). Sem delete, como sempre.
create policy attendance_select_academy on public.attendance for select to authenticated
  using (public.request_app() = 'academia' and class_id is not null and public.is_academy_staff(gym_id));
create policy attendance_insert_academy on public.attendance for insert to authenticated
  with check (
    public.request_app() = 'academia' and class_id is not null
    and public.is_academy_staff(gym_id) and marked_by = (select auth.uid())
  );
create policy attendance_update_academy on public.attendance for update to authenticated
  using (public.request_app() = 'academia' and class_id is not null and public.is_academy_staff(gym_id))
  with check (public.request_app() = 'academia' and class_id is not null and public.is_academy_staff(gym_id));

-- ── fotos da turma ─────────────────────────────────────────────────────────
create policy class_photos_select_academy on public.class_photos for select to authenticated
  using (public.request_app() = 'academia' and public.can_staff_class(class_id));
create policy class_photos_insert_academy on public.class_photos for insert to authenticated
  with check (public.request_app() = 'academia' and public.can_staff_class(class_id) and uploaded_by = (select auth.uid()));
create policy class_photos_delete_academy on public.class_photos for delete to authenticated
  using (public.request_app() = 'academia' and public.can_staff_class(class_id));

-- O arquivo (bucket privado `class-photos`, {gym_id}/{class_id}/{photo_id}.jpg). Sem o cabeçalho: o Storage nem sempre
-- repassa cabeçalhos próprios ao banco, e o objeto só se alcança pelo caminho da academia da equipe.
create policy class_photos_obj_select_academy on storage.objects for select to authenticated
  using (bucket_id = 'class-photos' and public.is_academy_staff(public.storage_path_gym(name)));
create policy class_photos_obj_insert_academy on storage.objects for insert to authenticated
  with check (bucket_id = 'class-photos' and public.is_academy_staff(public.storage_path_gym(name)));
create policy class_photos_obj_update_academy on storage.objects for update to authenticated
  using (bucket_id = 'class-photos' and public.is_academy_staff(public.storage_path_gym(name)))
  with check (bucket_id = 'class-photos' and public.is_academy_staff(public.storage_path_gym(name)));
create policy class_photos_obj_delete_academy on storage.objects for delete to authenticated
  using (bucket_id = 'class-photos' and public.is_academy_staff(public.storage_path_gym(name)));

-- ── reconhecimento facial ──────────────────────────────────────────────────
-- Mesmas regras do app do professor (consentimento, mesma academia, vetores só do modelo em uso), agora para a equipe
-- da academia. Os triggers de face_recognition (consentimento e academia) valem igual.
create policy face_embeddings_select_academy on public.face_embeddings for select to authenticated
  using (public.request_app() = 'academia' and public.can_staff_student(student_id));
create policy face_embeddings_insert_academy on public.face_embeddings for insert to authenticated
  with check (public.request_app() = 'academia' and public.can_staff_student(student_id) and created_by = (select auth.uid()));
create policy face_embeddings_delete_academy on public.face_embeddings for delete to authenticated
  using (public.request_app() = 'academia' and public.can_staff_student(student_id));

create policy face_detections_select_academy on public.face_detections for select to authenticated
  using (public.request_app() = 'academia' and public.can_staff_photo(photo_id));
create policy face_detections_insert_academy on public.face_detections for insert to authenticated
  with check (
    public.request_app() = 'academia' and public.can_staff_photo(photo_id)
    and (student_id is null or public.can_staff_student(student_id))
    and (suggested_student_id is null or public.can_staff_student(suggested_student_id))
  );
create policy face_detections_update_academy on public.face_detections for update to authenticated
  using (public.request_app() = 'academia' and public.can_staff_photo(photo_id))
  with check (
    public.request_app() = 'academia' and public.can_staff_photo(photo_id)
    and (student_id is null or public.can_staff_student(student_id))
    and (suggested_student_id is null or public.can_staff_student(suggested_student_id))
  );

-- ── funções ────────────────────────────────────────────────────────────────

-- Gera as aulas da grade da academia entre duas datas (idempotente). Só a equipe da academia; no máximo 92 dias por vez.
-- Security invoker: as policies acima continuam valendo.
create or replace function public.ensure_academy_classes(p_gym_id uuid, p_from date, p_to date)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_count integer;
begin
  if not public.is_academy_staff(p_gym_id) then
    raise exception 'Sem acesso a esta academia' using errcode = 'insufficient_privilege';
  end if;
  if p_to < p_from or p_to - p_from > 92 then
    raise exception 'Período inválido';
  end if;
  insert into public.classes (gym_id, instructor_id, schedule_id, group_id, date, start_time, title)
  select s.gym_id, s.instructor_id, s.id, s.group_id, d::date, s.start_time, s.title
  from public.class_schedules s
  cross join lateral generate_series(
    greatest(s.starts_on, p_from)::timestamp,
    least(coalesce(s.ends_on, p_to), p_to)::timestamp,
    interval '1 day'
  ) as d
  where s.gym_id = p_gym_id
    and s.active
    and extract(dow from d) = s.weekday
  on conflict (schedule_id, date) do nothing;
  get diagnostics v_count = row_count;
  return v_count;
end $$;

-- Conclui a chamada da academia: quem é da turma e não foi marcado vira falta; a aula passa a 'done'.
-- Aula sem turma: todos os alunos ativos da academia (como no app do professor).
create or replace function public.conclude_academy_class(p_class_id uuid)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_gym uuid;
  v_date date;
  v_group uuid;
begin
  select gym_id, date, group_id into v_gym, v_date, v_group from public.classes where id = p_class_id;
  if v_gym is null then
    raise exception 'Aula não encontrada';
  end if;
  if not public.is_academy_staff(v_gym) then
    raise exception 'Sem acesso a esta academia' using errcode = 'insufficient_privilege';
  end if;

  insert into public.attendance (class_id, student_id, gym_id, date, status, marked_by)
  select p_class_id, s.id, s.gym_id, v_date, 'absent', (select auth.uid())
  from public.students s
  where s.gym_id = v_gym
    and s.active
    and (
      v_group is null
      or exists (
        select 1 from public.class_group_members m
        where m.group_id = v_group and m.student_id = s.id
          and m.joined_on <= v_date and (m.left_on is null or m.left_on >= v_date)
      )
    )
  on conflict (class_id, student_id) where class_id is not null do nothing;

  update public.classes set status = 'done' where id = p_class_id;
end $$;

revoke execute on function public.can_staff_class(uuid), public.can_staff_photo(uuid) from public, anon;
revoke execute on function public.ensure_academy_classes(uuid, date, date) from public, anon;
revoke execute on function public.conclude_academy_class(uuid) from public, anon;
revoke execute on function public.class_group_same_gym() from public, anon, authenticated;
grant execute on function public.can_staff_class(uuid), public.can_staff_photo(uuid) to authenticated;
grant execute on function public.ensure_academy_classes(uuid, date, date) to authenticated;
grant execute on function public.conclude_academy_class(uuid) to authenticated;
