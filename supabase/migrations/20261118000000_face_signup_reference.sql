-- Foto do cadastro do aluno (student_signup_photo) como primeira referência do reconhecimento facial.
-- O celular do professor baixa a foto do cadastro (que ele já pode ver), calcula o vetor e grava só os números,
-- como nas fotos da turma. Continua valendo: só aluno com consentimento (trigger face_embeddings_check) e
-- retirar o consentimento apaga tudo (students_forget_face).

-- De onde veio a referência: resposta do professor numa foto da turma ou a foto do cadastro.
alter table public.face_embeddings add column source text not null default 'class_photo'
  check (source in ('class_photo', 'signup_photo'));
-- Uma referência da foto do cadastro por aluno.
create unique index face_embeddings_signup_once on public.face_embeddings (student_id) where source = 'signup_photo';

-- Alunos da academia com consentimento e foto de cadastro que ainda não viraram referência.
create or replace function public.face_signup_photos(p_gym_id uuid)
returns table (student_id uuid, photo_path text)
language sql stable security definer
set search_path = ''
as $$
  select s.id, r.photo_path
  from public.students s
  join public.student_signup_requests r on r.profile_id = s.profile_id and r.status = 'approved' and r.photo_path is not null
  where s.gym_id = p_gym_id
    and s.active
    and s.image_consent_at is not null
    and public.is_gym_member(p_gym_id)
    and not exists (select 1 from public.face_embeddings e where e.student_id = s.id and e.source = 'signup_photo')
$$;

-- Grava a referência da foto do cadastro. Idempotente (id do cliente e uma por aluno).
-- security invoker: valem a RLS de face_embeddings (professor da academia) e o trigger de consentimento.
create or replace function public.add_signup_face_reference(p_student_id uuid, p_id uuid, p_embedding jsonb)
returns boolean
language plpgsql
set search_path = ''
as $$
begin
  if jsonb_typeof(p_embedding) <> 'array' or jsonb_array_length(p_embedding) <> 128 then
    raise exception 'Vetor do rosto inválido';
  end if;
  insert into public.face_embeddings (id, student_id, embedding, source)
  values (p_id, p_student_id, (p_embedding::text)::extensions.vector, 'signup_photo')
  on conflict do nothing;
  return found;
end $$;

-- A poda (20 por aluno) passa a valer só para as referências das fotos da turma: a do cadastro fica.
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
      -- clock_timestamp: várias referências no mesmo lote ficam em ordem (a poda mantém as mais novas).
      insert into public.face_embeddings (id, student_id, embedding, source_photo_id, created_at)
      values (
        coalesce(v_embedding_id, gen_random_uuid()),
        v_student,
        (v_item ->> 'embedding')::extensions.vector,
        (v_item ->> 'photo_id')::uuid,
        clock_timestamp()
      )
      on conflict (id) do nothing
      returning id into v_embedding_id;
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

  delete from public.face_embeddings e
  using (
    select id, row_number() over (partition by student_id order by created_at desc, id) as rn
    from public.face_embeddings
    where student_id = any (v_students) and source = 'class_photo'
  ) r
  where e.id = r.id and r.rn > greatest(p_max_refs, 1);

  return v_count;
end $$;

revoke execute on function public.face_signup_photos(uuid) from public, anon;
revoke execute on function public.add_signup_face_reference(uuid, uuid, jsonb) from public, anon;
grant execute on function public.face_signup_photos(uuid) to authenticated;
grant execute on function public.add_signup_face_reference(uuid, uuid, jsonb) to authenticated;
