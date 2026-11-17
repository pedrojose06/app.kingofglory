-- Fase 4: reconhecimento facial de presença.
-- O reconhecimento roda no celular do professor (YuNet + SFace em onnxruntime-web). O banco guarda só os vetores
-- de referência (embeddings de 128 dimensões, nunca a imagem) e a decisão do professor sobre cada rosto da foto.
-- Dado biométrico (LGPD art. 11): só existe para aluno com students.image_consent_at; retirar o consentimento apaga tudo.

create extension if not exists vector with schema extensions;

-- ── Referências (o que o app "aprendeu" de cada aluno) ───────────────────────────
create table public.face_embeddings (
  id uuid primary key default gen_random_uuid(),
  student_id uuid not null references public.students (id) on delete cascade,
  embedding extensions.vector(128) not null,
  -- Vetores de modelos diferentes não se comparam; trocar o modelo no futuro exige recadastrar.
  model text not null default 'sface-2021dec',
  source_photo_id uuid references public.class_photos (id) on delete set null,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index face_embeddings_student_idx on public.face_embeddings (student_id, created_at desc);
create index face_embeddings_photo_idx on public.face_embeddings (source_photo_id);

-- ── Rostos de cada foto e a decisão do professor ─────────────────────────────────
create type public.face_decision as enum ('confirmed', 'corrected', 'ignored', 'auto');

create table public.face_detections (
  id uuid primary key default gen_random_uuid(),
  photo_id uuid not null references public.class_photos (id) on delete cascade,
  face_index smallint not null check (face_index >= 0),
  -- Caixa do rosto normalizada (0..1) na foto enviada: permite refazer o recorte sem guardar outra imagem.
  bbox jsonb not null,
  -- O que o app sugeriu (null = sem sugestão) e com que confiança (0..1, a mesma % mostrada ao professor).
  suggested_student_id uuid references public.students (id) on delete set null,
  score real check (score between 0 and 1),
  -- Quem o professor disse que é (null = ignorado).
  student_id uuid references public.students (id) on delete cascade,
  decision public.face_decision not null,
  embedding_id uuid references public.face_embeddings (id) on delete set null,
  decided_by uuid default auth.uid() references public.profiles (id) on delete set null,
  decided_at timestamptz not null default now(),
  unique (photo_id, face_index),
  check ((decision = 'ignored') = (student_id is null))
);
create index face_detections_student_idx on public.face_detections (student_id);
create index face_detections_suggested_idx on public.face_detections (suggested_student_id);
create index face_detections_embedding_idx on public.face_detections (embedding_id);

-- Futuro "aprovar automaticamente acima de X%": desligado (null) e sem tela por enquanto.
alter table public.profiles add column face_auto_approve_min real
  check (face_auto_approve_min is null or face_auto_approve_min between 0.5 and 1);

-- ── Consentimento garantido no banco ─────────────────────────────────────────────
create or replace function public.has_image_consent(p_student_id uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (select 1 from public.students s where s.id = p_student_id and s.image_consent_at is not null)
$$;

create or replace function public.face_embeddings_check() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if not public.has_image_consent(new.student_id) then
    raise exception 'Aluno sem consentimento de uso de imagem' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger face_embeddings_check before insert or update on public.face_embeddings
  for each row execute function public.face_embeddings_check();

create or replace function public.face_detections_check() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_gym uuid;
begin
  select c.gym_id into v_gym
  from public.class_photos p join public.classes c on c.id = p.class_id
  where p.id = new.photo_id;

  if new.student_id is not null then
    if not public.has_image_consent(new.student_id) then
      raise exception 'Aluno sem consentimento de uso de imagem' using errcode = 'check_violation';
    end if;
    if not exists (select 1 from public.students s where s.id = new.student_id and s.gym_id = v_gym) then
      raise exception 'Aluno de outra academia' using errcode = 'check_violation';
    end if;
  end if;
  if new.suggested_student_id is not null and not public.has_image_consent(new.suggested_student_id) then
    raise exception 'Aluno sem consentimento de uso de imagem' using errcode = 'check_violation';
  end if;
  return new;
end $$;
create trigger face_detections_check before insert or update on public.face_detections
  for each row execute function public.face_detections_check();

-- Retirar o consentimento apaga os dados faciais do aluno (as presenças continuam).
create or replace function public.students_forget_face() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  delete from public.face_detections where student_id = new.id;
  update public.face_detections set suggested_student_id = null, score = null where suggested_student_id = new.id;
  delete from public.face_embeddings where student_id = new.id;
  return new;
end $$;
create trigger students_forget_face after update of image_consent_at on public.students
  for each row when (old.image_consent_at is not null and new.image_consent_at is null)
  execute function public.students_forget_face();

-- ── RLS: o professor só vê rostos de alunos/fotos das academias em que dá aula ─────
create or replace function public.can_manage_photo(p_photo_id uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.class_photos p
    join public.classes c on c.id = p.class_id
    join public.gym_instructors gi on gi.gym_id = c.gym_id
    where p.id = p_photo_id and gi.profile_id = (select auth.uid())
  )
$$;

alter table public.face_embeddings enable row level security;
alter table public.face_detections enable row level security;

create policy face_embeddings_select on public.face_embeddings for select to authenticated
  using (public.can_manage_student(student_id));
create policy face_embeddings_insert on public.face_embeddings for insert to authenticated
  with check (public.can_manage_student(student_id) and created_by = (select auth.uid()));
create policy face_embeddings_delete on public.face_embeddings for delete to authenticated
  using (public.can_manage_student(student_id));

create policy face_detections_select on public.face_detections for select to authenticated
  using (public.can_manage_photo(photo_id));
create policy face_detections_insert on public.face_detections for insert to authenticated
  with check (
    public.can_manage_photo(photo_id)
    and (student_id is null or public.can_manage_student(student_id))
    and (suggested_student_id is null or public.can_manage_student(suggested_student_id))
  );
create policy face_detections_update on public.face_detections for update to authenticated
  using (public.can_manage_photo(photo_id))
  with check (
    public.can_manage_photo(photo_id)
    and (student_id is null or public.can_manage_student(student_id))
    and (suggested_student_id is null or public.can_manage_student(suggested_student_id))
  );

-- ── Decisões do professor (fila offline) ─────────────────────────────────────────
-- Idempotente: ids gerados no cliente; repetir o envio não duplica. Decidir de novo o mesmo rosto substitui.
-- p_items: [{ "photo_id", "face_index", "bbox", "suggested_student_id"?, "score"?, "student_id"?, "decision",
--             "embedding_id"?, "embedding"? (array de 128 números, só quando vira referência) }]
-- Mantém no máximo p_max_refs referências por aluno (as mais recentes).
create or replace function public.save_face_decisions(p_items jsonb, p_max_refs integer default 20)
returns integer
language plpgsql
set search_path = ''
as $$
declare
  v_item jsonb;
  v_count integer := 0;
  v_students uuid[] := '{}';
  v_student uuid;
  v_embedding_id uuid;
begin
  for v_item in select * from jsonb_array_elements(p_items) loop
    v_student := (v_item ->> 'student_id')::uuid;
    v_embedding_id := (v_item ->> 'embedding_id')::uuid;

    if v_item ? 'embedding' and jsonb_typeof(v_item -> 'embedding') = 'array' and v_student is not null then
      insert into public.face_embeddings (id, student_id, embedding, source_photo_id)
      values (
        coalesce(v_embedding_id, gen_random_uuid()),
        v_student,
        (v_item ->> 'embedding')::extensions.vector,
        (v_item ->> 'photo_id')::uuid
      )
      on conflict (id) do nothing
      returning id into v_embedding_id;
      -- Em reenvio a linha já existe: mantém o id informado.
      v_embedding_id := coalesce(v_embedding_id, (v_item ->> 'embedding_id')::uuid);
      v_students := array_append(v_students, v_student);
    else
      v_embedding_id := null;
    end if;

    insert into public.face_detections
      (photo_id, face_index, bbox, suggested_student_id, score, student_id, decision, embedding_id)
    values (
      (v_item ->> 'photo_id')::uuid,
      (v_item ->> 'face_index')::smallint,
      v_item -> 'bbox',
      (v_item ->> 'suggested_student_id')::uuid,
      (v_item ->> 'score')::real,
      v_student,
      (v_item ->> 'decision')::public.face_decision,
      v_embedding_id
    )
    on conflict (photo_id, face_index) do update set
      bbox = excluded.bbox,
      suggested_student_id = excluded.suggested_student_id,
      score = excluded.score,
      student_id = excluded.student_id,
      decision = excluded.decision,
      embedding_id = coalesce(excluded.embedding_id, public.face_detections.embedding_id),
      decided_by = (select auth.uid()),
      decided_at = now();
    v_count := v_count + 1;
  end loop;

  -- Poda: só as p_max_refs referências mais recentes de cada aluno tocado.
  delete from public.face_embeddings e
  using (
    select id, row_number() over (partition by student_id order by created_at desc, id) as rn
    from public.face_embeddings
    where student_id = any (v_students)
  ) r
  where e.id = r.id and r.rn > greatest(p_max_refs, 1);

  return v_count;
end $$;

-- Referências dos alunos com consentimento de uma academia, para comparar no celular.
create or replace function public.face_references(p_gym_id uuid)
returns table (id uuid, student_id uuid, embedding text, model text, created_at timestamptz)
language sql stable
set search_path = ''
as $$
  select e.id, e.student_id, e.embedding::text, e.model, e.created_at
  from public.face_embeddings e
  join public.students s on s.id = e.student_id
  where s.gym_id = p_gym_id and s.active and s.image_consent_at is not null
  order by e.student_id, e.created_at desc
$$;

revoke execute on function public.has_image_consent(uuid) from public, anon, authenticated;
revoke execute on function public.can_manage_photo(uuid) from public, anon;
revoke execute on function public.save_face_decisions(jsonb, integer) from public, anon;
revoke execute on function public.face_references(uuid) from public, anon;
revoke execute on function public.face_embeddings_check() from public, anon, authenticated;
revoke execute on function public.face_detections_check() from public, anon, authenticated;
revoke execute on function public.students_forget_face() from public, anon, authenticated;
grant execute on function public.can_manage_photo(uuid) to authenticated;
grant execute on function public.save_face_decisions(jsonb, integer) to authenticated;
grant execute on function public.face_references(uuid) to authenticated;
