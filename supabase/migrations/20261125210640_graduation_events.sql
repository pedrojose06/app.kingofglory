-- Graduações (cerimônias) da equipe com reconhecimento facial.
--
-- - A academia com gestão cadastra a data de cada graduação (`graduation_events`) e sobe as fotos dela.
-- - O rosto é lido no navegador (como no diário) e só o vetor vai para `graduation_face_match`, que compara no banco com
--   as referências de TODAS as academias da equipe (King of Glory e parceiras como Neolife e Panobianco): o navegador
--   não recebe os vetores de ninguém, só os 3 alunos mais parecidos de cada rosto.
-- - Cada aluno reconhecido vira um candidato (`graduation_candidates`, pendente) para o próximo grau. Na hora em que vira
--   candidato, o professor responsável (gym_instructors da academia do aluno) recebe um push para aprovar.
-- - O mestre da academia pode aprovar ali mesmo; se pular o rosto, o candidato continua pendente e o professor decide no
--   app dele. Quem decidir primeiro vale; a decisão pode ser refeita (reprovar desfaz a graduação criada por ela).
-- - Aprovado: entra em `student_graduations` com a data da graduação.
-- Rollback: supabase/rollback/20261125210640_graduation_events.down.sql

-- ── tabelas ────────────────────────────────────────────────────────────────
create table public.graduation_events (
  id uuid primary key default gen_random_uuid(),
  gym_id uuid not null references public.gyms (id) on delete restrict,
  held_on date not null,
  track text not null default 'adulto' check (track in ('adulto', 'infantil')),
  title text check (title is null or length(title) <= 120),
  notes text check (notes is null or length(notes) <= 2000),
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index graduation_events_gym_idx on public.graduation_events (gym_id, held_on desc);
comment on table public.graduation_events is 'Graduação (cerimônia) da equipe cadastrada pela academia: data e trilha.';

create table public.graduation_event_photos (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.graduation_events (id) on delete cascade,
  -- Bucket privado `graduation-photos`: {gym_id}/{event_id}/{id}.jpg
  storage_path text not null unique,
  uploaded_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now()
);
create index graduation_event_photos_event_idx on public.graduation_event_photos (event_id, created_at);

create table public.graduation_candidates (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.graduation_events (id) on delete cascade,
  student_id uuid not null references public.students (id) on delete cascade,
  -- Grau do aluno antes da graduação (null = sem graduação) e o grau proposto.
  from_rank_id uuid references public.ranks (id) on delete restrict,
  to_rank_id uuid not null references public.ranks (id) on delete restrict,
  source text not null check (source in ('face', 'manual')),
  photo_id uuid references public.graduation_event_photos (id) on delete set null,
  -- Caixa do rosto normalizada (0..1) na foto enviada, para mostrar o recorte a quem aprova.
  bbox jsonb,
  score real check (score is null or score between 0 and 1),
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  decided_via text check (decided_via in ('academia', 'professor')),
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  -- Graduação criada por esta aprovação (reprovar depois apaga só ela).
  graduation_id uuid references public.student_graduations (id) on delete set null,
  notify_pending boolean not null default false,
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (event_id, student_id)
);
create index graduation_candidates_student_idx on public.graduation_candidates (student_id);
create index graduation_candidates_pending_idx on public.graduation_candidates (status) where status = 'pending';
create index graduation_candidates_notify_idx on public.graduation_candidates (notify_pending) where notify_pending;

-- ── helpers ────────────────────────────────────────────────────────────────
create or replace function public.graduation_event_gym(p_event_id uuid) returns uuid
language sql stable security definer
set search_path = ''
as $$ select e.gym_id from public.graduation_events e where e.id = p_event_id $$;

-- Grau do aluno antes de uma data (o mais alto da trilha dele com graduated_at anterior) e o grau seguinte.
create or replace function public.student_rank_before(p_student_id uuid, p_on date)
returns table (current_rank_id uuid, next_rank_id uuid)
language sql stable security definer
set search_path = ''
as $$
  with s as (select st.track from public.students st where st.id = p_student_id),
  cur as (
    select r.id, r.grade from public.student_graduations sg
    join public.ranks r on r.id = sg.rank_id
    where sg.student_id = p_student_id and sg.graduated_at < p_on and r.track = (select track from s)
    order by r.grade desc limit 1
  )
  select (select id from cur),
         (select r.id from public.ranks r
           where r.track = (select track from s) and r.grade > coalesce((select grade from cur), 0)
           order by r.grade limit 1)
$$;

-- Foto da graduação: a equipe da academia vê; o professor só a foto em que um aluno dele foi reconhecido.
create or replace function public.can_view_graduation_photo(p_name text) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select public.is_academy_staff(public.storage_path_gym(p_name))
      or exists (
        select 1 from public.graduation_event_photos p
        join public.graduation_candidates c on c.photo_id = p.id
        where p.storage_path = p_name and public.can_manage_student(c.student_id)
      )
$$;

-- ── RLS ────────────────────────────────────────────────────────────────────
alter table public.graduation_events enable row level security;
alter table public.graduation_event_photos enable row level security;
alter table public.graduation_candidates enable row level security;

create policy graduation_events_select on public.graduation_events for select to authenticated
  using (public.is_academy_staff(gym_id));
create policy graduation_events_insert on public.graduation_events for insert to authenticated
  with check (public.is_academy_admin(gym_id) and public.gym_has_management(gym_id));
create policy graduation_events_update on public.graduation_events for update to authenticated
  using (public.is_academy_admin(gym_id)) with check (public.is_academy_admin(gym_id));
create policy graduation_events_delete on public.graduation_events for delete to authenticated
  using (public.is_academy_admin(gym_id));

create policy graduation_event_photos_select on public.graduation_event_photos for select to authenticated
  using (public.is_academy_staff(public.graduation_event_gym(event_id)));
create policy graduation_event_photos_insert on public.graduation_event_photos for insert to authenticated
  with check (
    public.is_academy_staff(public.graduation_event_gym(event_id))
    and public.storage_path_gym(storage_path) = public.graduation_event_gym(event_id)
    and split_part(storage_path, '/', 2) = event_id::text
    and uploaded_by = (select auth.uid())
  );
create policy graduation_event_photos_delete on public.graduation_event_photos for delete to authenticated
  using (public.is_academy_staff(public.graduation_event_gym(event_id)));

-- Candidatos: leitura direta (escrita só pelas funções abaixo).
create policy graduation_candidates_select on public.graduation_candidates for select to authenticated
  using (public.is_academy_staff(public.graduation_event_gym(event_id)) or public.can_manage_student(student_id));

-- ── Storage ────────────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('graduation-photos', 'graduation-photos', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

create policy graduation_photos_obj_select on storage.objects for select to authenticated
  using (bucket_id = 'graduation-photos' and public.can_view_graduation_photo(name));
create policy graduation_photos_obj_insert on storage.objects for insert to authenticated
  with check (bucket_id = 'graduation-photos' and public.is_academy_staff(public.storage_path_gym(name)));
create policy graduation_photos_obj_delete on storage.objects for delete to authenticated
  using (bucket_id = 'graduation-photos' and public.is_academy_staff(public.storage_path_gym(name)));

-- ── funções ────────────────────────────────────────────────────────────────

-- Compara os rostos de uma foto da graduação com as referências de todas as academias da equipe.
-- p_faces: [[128 números], ...]. Devolve, por rosto (mesma ordem), até 3 alunos com cosseno ≥ 0,25:
-- [{ face_index, matches: [{ student_id, name, gym_id, gym_name, cosine, current_rank_id, next_rank_id }] }]
-- Entram os alunos ativos da trilha da graduação que podem estar no reconhecimento (consentimento ou contrato da
-- academia com gestão, sem pedido para ficar de fora). Só a equipe da academia da graduação.
create or replace function public.graduation_face_match(p_event_id uuid, p_faces jsonb)
returns jsonb
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_event public.graduation_events;
  v_result jsonb;
begin
  select * into v_event from public.graduation_events where id = p_event_id;
  if v_event.id is null or not public.is_academy_staff(v_event.gym_id) then
    raise exception 'Sem acesso a esta graduação' using errcode = '42501';
  end if;
  if jsonb_typeof(p_faces) <> 'array' or jsonb_array_length(p_faces) > 200 then
    raise exception 'Rostos inválidos' using errcode = '22023';
  end if;

  with faces as (
    select (f.ord - 1)::int as face_index, (f.v::text)::extensions.vector as q
    from jsonb_array_elements(p_faces) with ordinality as f(v, ord)
  ),
  refs as (
    select e.student_id, e.embedding
    from public.face_embeddings e
    join public.students s on s.id = e.student_id
    where e.model = 'sface-2021dec'
      and s.active and s.track = v_event.track and s.face_opt_out_at is null
      and (s.image_consent_at is not null or public.gym_has_management(s.gym_id))
  ),
  sims as (
    select f.face_index, r.student_id, 1 - (r.embedding operator(extensions.<=>) f.q) as c,
           row_number() over (partition by f.face_index, r.student_id order by r.embedding operator(extensions.<=>) f.q) as rn
    from faces f cross join refs r
  ),
  per_student as (
    select face_index, student_id, avg(c) as cosine,
           row_number() over (partition by face_index order by avg(c) desc) as pos
    from sims where rn <= 3
    group by face_index, student_id
    having avg(c) >= 0.25
  )
  select coalesce(jsonb_agg(jsonb_build_object('face_index', f.face_index, 'matches', coalesce(m.list, '[]'::jsonb)) order by f.face_index), '[]'::jsonb)
  into v_result
  from faces f
  left join lateral (
    select jsonb_agg(jsonb_build_object(
             'student_id', s.id, 'name', s.name, 'gym_id', g.id, 'gym_name', g.name,
             'cosine', round(p.cosine::numeric, 4),
             'current_rank_id', rk.current_rank_id, 'next_rank_id', rk.next_rank_id
           ) order by p.pos) as list
    from per_student p
    join public.students s on s.id = p.student_id
    join public.gyms g on g.id = s.gym_id
    cross join lateral public.student_rank_before(s.id, v_event.held_on) rk
    where p.face_index = f.face_index and p.pos <= 3
  ) m on true;

  return v_result;
end $$;

-- Busca de aluno por nome em todas as academias (para incluir na graduação quem o rosto não achou).
create or replace function public.graduation_student_search(p_event_id uuid, p_query text)
returns table (student_id uuid, name text, gym_id uuid, gym_name text, current_rank_id uuid, next_rank_id uuid)
language plpgsql stable security definer
set search_path = ''
as $$
declare
  v_event public.graduation_events;
  v_q text := btrim(coalesce(p_query, ''));
begin
  select * into v_event from public.graduation_events where id = p_event_id;
  if v_event.id is null or not public.is_academy_staff(v_event.gym_id) then
    raise exception 'Sem acesso a esta graduação' using errcode = '42501';
  end if;
  if length(v_q) < 3 then
    return;
  end if;
  return query
    select s.id, s.name, g.id, g.name, rk.current_rank_id, rk.next_rank_id
    from public.students s
    join public.gyms g on g.id = s.gym_id
    cross join lateral public.student_rank_before(s.id, v_event.held_on) rk
    where s.active and s.track = v_event.track
      and translate(lower(s.name), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc')
          like '%' || translate(lower(v_q), 'áàâãäéèêëíìîïóòôõöúùûüç', 'aaaaaeeeeiiiiooooouuuuc') || '%'
    order by s.name
    limit 20;
end $$;

-- Cria (ou atualiza, se ainda pendente) os candidatos de uma graduação. Idempotente por (graduação, aluno).
-- p_items: [{ student_id, to_rank_id?, source: 'face'|'manual', photo_id?, bbox?, score? }]
-- Candidato novo de aluno com professor responsável já agenda o push para ele.
create or replace function public.propose_graduation_candidates(p_event_id uuid, p_items jsonb)
returns setof public.graduation_candidates
language plpgsql security definer
set search_path = ''
as $$
declare
  v_event public.graduation_events;
  v_item jsonb;
  v_student public.students;
  v_rank record;
  v_to uuid;
  v_photo uuid;
  v_notify boolean := false;
  v_row public.graduation_candidates;
begin
  select * into v_event from public.graduation_events where id = p_event_id;
  if v_event.id is null or not public.is_academy_staff(v_event.gym_id) then
    raise exception 'Sem acesso a esta graduação' using errcode = '42501';
  end if;

  for v_item in select * from jsonb_array_elements(p_items) loop
    select * into v_student from public.students where id = (v_item ->> 'student_id')::uuid;
    if v_student.id is null or not v_student.active then
      raise exception 'Aluno não encontrado ou inativo' using errcode = '22023';
    end if;
    if v_student.track <> v_event.track then
      raise exception 'Aluno de outra trilha de graduação' using errcode = '22023';
    end if;

    select * into v_rank from public.student_rank_before(v_student.id, v_event.held_on);
    v_to := coalesce((v_item ->> 'to_rank_id')::uuid, v_rank.next_rank_id);
    if v_to is null or not exists (select 1 from public.ranks r where r.id = v_to and r.track = v_event.track) then
      raise exception 'Grau inválido para a graduação' using errcode = '22023';
    end if;

    v_photo := (v_item ->> 'photo_id')::uuid;
    if v_photo is not null and not exists (
      select 1 from public.graduation_event_photos p where p.id = v_photo and p.event_id = p_event_id
    ) then
      raise exception 'Foto de outra graduação' using errcode = '22023';
    end if;

    insert into public.graduation_candidates
      (event_id, student_id, from_rank_id, to_rank_id, source, photo_id, bbox, score, notify_pending)
    values (
      p_event_id, v_student.id, v_rank.current_rank_id, v_to,
      coalesce(v_item ->> 'source', 'manual'), v_photo, v_item -> 'bbox', (v_item ->> 'score')::real,
      exists (select 1 from public.gym_instructors gi where gi.gym_id = v_student.gym_id)
    )
    on conflict (event_id, student_id) do update set
      to_rank_id = case when public.graduation_candidates.status = 'pending' then excluded.to_rank_id else public.graduation_candidates.to_rank_id end,
      -- Fica a foto com a melhor nota.
      photo_id = case when excluded.photo_id is not null and coalesce(excluded.score, 0) >= coalesce(public.graduation_candidates.score, 0)
                      then excluded.photo_id else public.graduation_candidates.photo_id end,
      bbox = case when excluded.photo_id is not null and coalesce(excluded.score, 0) >= coalesce(public.graduation_candidates.score, 0)
                  then excluded.bbox else public.graduation_candidates.bbox end,
      score = greatest(excluded.score, public.graduation_candidates.score)
    returning * into v_row;

    v_notify := v_notify or v_row.notify_pending;
    return next v_row;
  end loop;

  if v_notify then
    begin
      perform public.wake_push_reminders();
    exception when others then
      null; -- o cron tenta de novo no próximo minuto
    end;
  end if;
end $$;

-- Aprova ou reprova o avanço de grau. Pode decidir o admin da academia da graduação ("academia") ou o professor
-- responsável pelo aluno ("professor"). Aprovar grava a graduação com a data do evento; reprovar depois de aprovar
-- apaga a graduação que a aprovação criou.
create or replace function public.decide_graduation_candidate(p_candidate_id uuid, p_approve boolean, p_to_rank_id uuid default null)
returns public.graduation_candidates
language plpgsql security definer
set search_path = ''
as $$
declare
  v_c public.graduation_candidates;
  v_event public.graduation_events;
  v_via text;
  v_to uuid;
  v_grad uuid;
begin
  select * into v_c from public.graduation_candidates where id = p_candidate_id for update;
  if v_c.id is null then
    raise exception 'Candidato não encontrado' using errcode = 'P0002';
  end if;
  select * into v_event from public.graduation_events where id = v_c.event_id;

  if public.is_academy_admin(v_event.gym_id) then
    v_via := 'academia';
  elsif public.is_instructor() and public.can_manage_student(v_c.student_id) then
    v_via := 'professor';
  else
    raise exception 'Sem permissão para decidir esta graduação' using errcode = '42501';
  end if;

  v_to := coalesce(p_to_rank_id, v_c.to_rank_id);
  if not exists (select 1 from public.ranks r where r.id = v_to and r.track = v_event.track) then
    raise exception 'Grau inválido para a graduação' using errcode = '22023';
  end if;

  -- Refazer a decisão: desfaz a graduação criada pela aprovação anterior.
  if v_c.graduation_id is not null and (not p_approve or v_to <> v_c.to_rank_id) then
    delete from public.student_graduations where id = v_c.graduation_id;
    v_c.graduation_id := null;
  end if;

  if p_approve then
    v_grad := v_c.graduation_id;
    if v_grad is null then
      insert into public.student_graduations (student_id, rank_id, graduated_at, notes, recorded_by)
      values (
        v_c.student_id, v_to, v_event.held_on,
        'Graduação de ' || to_char(v_event.held_on, 'DD/MM/YYYY')
          || case when v_via = 'academia' then ' (aprovada pela academia)' else ' (aprovada pelo professor)' end,
        (select auth.uid())
      )
      on conflict (student_id, rank_id) do nothing
      returning id into v_grad;
      -- Já tinha esse grau (cadastrado à mão): não mexe nele nem o apaga depois.
    end if;
  end if;

  update public.graduation_candidates set
    status = case when p_approve then 'approved' else 'rejected' end,
    to_rank_id = v_to,
    graduation_id = case when p_approve then v_grad else null end,
    decided_via = v_via,
    decided_by = (select auth.uid()),
    decided_at = now(),
    notify_pending = false
  where id = v_c.id
  returning * into v_c;
  return v_c;
end $$;

-- "Não é esta pessoa": tira o candidato da graduação (só a equipe da academia; desfaz a graduação se já aprovada).
create or replace function public.dismiss_graduation_candidate(p_candidate_id uuid)
returns boolean
language plpgsql security definer
set search_path = ''
as $$
declare
  v_c public.graduation_candidates;
begin
  select * into v_c from public.graduation_candidates where id = p_candidate_id;
  if v_c.id is null then
    return false;
  end if;
  if not public.is_academy_staff(public.graduation_event_gym(v_c.event_id)) then
    raise exception 'Sem acesso a esta graduação' using errcode = '42501';
  end if;
  if v_c.graduation_id is not null then
    delete from public.student_graduations where id = v_c.graduation_id;
  end if;
  delete from public.graduation_candidates where id = v_c.id;
  return true;
end $$;

-- Candidatos de uma graduação com nome, academia e foto (a equipe não lê alunos de outras academias pela RLS).
create or replace function public.graduation_event_candidates(p_event_id uuid)
returns table (
  id uuid, student_id uuid, student_name text, gym_id uuid, gym_name text, has_instructor boolean,
  from_rank_id uuid, to_rank_id uuid, source text, photo_id uuid, storage_path text, bbox jsonb, score real,
  status text, decided_via text, decided_at timestamptz, created_at timestamptz
)
language plpgsql stable security definer
set search_path = ''
as $$
begin
  if not public.is_academy_staff(public.graduation_event_gym(p_event_id)) then
    raise exception 'Sem acesso a esta graduação' using errcode = '42501';
  end if;
  return query
    select c.id, s.id, s.name, g.id, g.name,
           exists (select 1 from public.gym_instructors gi where gi.gym_id = s.gym_id),
           c.from_rank_id, c.to_rank_id, c.source, c.photo_id, p.storage_path, c.bbox, c.score,
           c.status, c.decided_via, c.decided_at, c.created_at
    from public.graduation_candidates c
    join public.students s on s.id = c.student_id
    join public.gyms g on g.id = s.gym_id
    left join public.graduation_event_photos p on p.id = c.photo_id
    where c.event_id = p_event_id
    order by c.status = 'pending' desc, s.name;
end $$;

-- Para o professor: candidatos dos alunos das academias em que ele dá aula (pendentes e os decididos nos últimos 30 dias).
create or replace function public.my_graduation_candidates()
returns table (
  id uuid, event_id uuid, held_on date, host_gym_name text, student_id uuid, student_name text, gym_id uuid,
  from_rank_id uuid, to_rank_id uuid, source text, storage_path text, bbox jsonb, score real,
  status text, decided_via text, decided_at timestamptz, created_at timestamptz
)
language sql stable security definer
set search_path = ''
as $$
  select c.id, e.id, e.held_on, hg.name, s.id, s.name, s.gym_id,
         c.from_rank_id, c.to_rank_id, c.source, p.storage_path, c.bbox, c.score,
         c.status, c.decided_via, c.decided_at, c.created_at
  from public.graduation_candidates c
  join public.graduation_events e on e.id = c.event_id
  join public.gyms hg on hg.id = e.gym_id
  join public.students s on s.id = c.student_id
  left join public.graduation_event_photos p on p.id = c.photo_id
  where public.is_instructor()
    and exists (select 1 from public.gym_instructors gi where gi.gym_id = s.gym_id and gi.profile_id = (select auth.uid()))
    and (c.status = 'pending' or c.decided_at > now() - interval '30 days')
  order by c.status = 'pending' desc, e.held_on desc, s.name
$$;

-- ── push para o professor ──────────────────────────────────────────────────
-- Um aviso por professor com os alunos dele reconhecidos desde o último envio.
create or replace function public.claim_graduation_notifications()
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  with claimed as (
    update public.graduation_candidates c
       set notify_pending = false
     where c.notify_pending and c.status = 'pending'
    returning c.id, c.event_id, c.student_id, c.to_rank_id
  ),
  per_instructor as (
    select gi.profile_id,
           jsonb_agg(jsonb_build_object('student', s.name, 'rank', r.name, 'held_on', e.held_on) order by s.name) as students
    from claimed k
    join public.students s on s.id = k.student_id
    join public.ranks r on r.id = k.to_rank_id
    join public.graduation_events e on e.id = k.event_id
    join public.gym_instructors gi on gi.gym_id = s.gym_id
    group by gi.profile_id
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'profile_id', pi.profile_id,
    'students', pi.students,
    'subscriptions', p.subscriptions
  )), '[]'::jsonb)
  into v_result
  from per_instructor pi
  join lateral (
    select jsonb_agg(jsonb_build_object('id', ps.id, 'endpoint', ps.endpoint, 'p256dh', ps.p256dh, 'auth', ps.auth)) as subscriptions
    from public.push_subscriptions ps where ps.profile_id = pi.profile_id
  ) p on p.subscriptions is not null;

  -- Aviso de quem já tinha sido decidido antes do envio: não manda.
  update public.graduation_candidates set notify_pending = false where notify_pending and status <> 'pending';

  return v_result;
end $$;

-- O job do pg_cron acorda a função também quando há aviso de graduação pendente.
create or replace function public.dispatch_attendance_reminders()
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.attendance_reminders r
    where public.attendance_reminder_is_due(r.remind_at, r.last_sent_on)
  ) and not exists (
    select 1 from public.lesson_plan_reminders r
    where public.attendance_reminder_is_due(r.remind_at, r.last_sent_on)
  ) and not exists (
    select 1 from public.lesson_plan_shares s where s.review_notify_pending
  ) and not exists (
    select 1 from public.student_class_reminder_due_profiles()
  ) and not exists (
    select 1 from public.student_signup_requests r where r.approval_notify_pending
  ) and not exists (
    select 1 from public.graduation_candidates c where c.notify_pending
  ) then
    return;
  end if;

  perform public.wake_push_reminders();
end $$;

-- ── permissões ─────────────────────────────────────────────────────────────
revoke execute on function public.graduation_event_gym(uuid) from public, anon;
revoke execute on function public.student_rank_before(uuid, date) from public, anon, authenticated;
revoke execute on function public.can_view_graduation_photo(text) from public, anon;
revoke execute on function public.graduation_face_match(uuid, jsonb) from public, anon;
revoke execute on function public.graduation_student_search(uuid, text) from public, anon;
revoke execute on function public.propose_graduation_candidates(uuid, jsonb) from public, anon;
revoke execute on function public.decide_graduation_candidate(uuid, boolean, uuid) from public, anon;
revoke execute on function public.dismiss_graduation_candidate(uuid) from public, anon;
revoke execute on function public.graduation_event_candidates(uuid) from public, anon;
revoke execute on function public.my_graduation_candidates() from public, anon;
revoke execute on function public.claim_graduation_notifications() from public, anon, authenticated;
revoke execute on function public.dispatch_attendance_reminders() from public, anon, authenticated;

grant execute on function public.graduation_event_gym(uuid) to authenticated;
grant execute on function public.can_view_graduation_photo(text) to authenticated;
grant execute on function public.graduation_face_match(uuid, jsonb) to authenticated;
grant execute on function public.graduation_student_search(uuid, text) to authenticated;
grant execute on function public.propose_graduation_candidates(uuid, jsonb) to authenticated;
grant execute on function public.decide_graduation_candidate(uuid, boolean, uuid) to authenticated;
grant execute on function public.dismiss_graduation_candidate(uuid) to authenticated;
grant execute on function public.graduation_event_candidates(uuid) to authenticated;
grant execute on function public.my_graduation_candidates() to authenticated;
grant execute on function public.claim_graduation_notifications() to service_role;
