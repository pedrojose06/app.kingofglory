-- Compartilhar o plano de aula (como o "Compartilhar" do Notion): o professor gera um link secreto da aula e manda
-- para o mestre, que abre sem login, lê o plano e aprova ou pede ajustes. Gerar de novo invalida o link anterior
-- (e zera a revisão); desativar apaga. O token tem 122 bits aleatórios (uuid v4 sem hífens).

create table public.lesson_plan_shares (
  class_id uuid primary key references public.classes (id) on delete cascade,
  token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz, -- último acesso pelo link (atualizado no máximo 1x a cada 10 min)
  -- Revisão do mestre: null = ainda não revisou.
  review_status text check (review_status in ('approved', 'changes_requested')),
  review_note text check (length(review_note) <= 2000),
  reviewer_name text check (length(reviewer_name) <= 80),
  reviewed_at timestamptz
);

alter table public.lesson_plan_shares enable row level security;
create policy lesson_plan_shares_select on public.lesson_plan_shares for select to authenticated
  using (public.can_manage_class(class_id));
create policy lesson_plan_shares_insert on public.lesson_plan_shares for insert to authenticated
  with check (public.can_manage_class(class_id));
create policy lesson_plan_shares_update on public.lesson_plan_shares for update to authenticated
  using (public.can_manage_class(class_id)) with check (public.can_manage_class(class_id));
create policy lesson_plan_shares_delete on public.lesson_plan_shares for delete to authenticated
  using (public.can_manage_class(class_id));

-- Gera (ou troca) o link do plano. security invoker: a RLS acima vale.
create or replace function public.rotate_lesson_plan_share(p_class_id uuid)
returns text
language sql
set search_path = ''
as $$
  insert into public.lesson_plan_shares (class_id) values (p_class_id)
  on conflict (class_id) do update
    set token = replace(gen_random_uuid()::text, '-', ''),
        created_by = (select auth.uid()),
        created_at = now(),
        last_seen_at = null,
        review_status = null,
        review_note = null,
        reviewer_name = null,
        reviewed_at = null
  returning token
$$;

-- Plano compartilhado a partir do token. Chamável sem login (anon): o token é a credencial.
-- Devolve só a aula, o plano e a revisão; nada de alunos ou presenças. Token inválido ou desativado → null.
create or replace function public.shared_lesson_plan(p_token text)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_class_id uuid;
  v_result jsonb;
begin
  if p_token is null or length(p_token) < 32 then
    return null;
  end if;

  update public.lesson_plan_shares s
     set last_seen_at = now()
   where s.token = p_token
     and (s.last_seen_at is null or s.last_seen_at < now() - interval '10 minutes');

  select s.class_id into v_class_id from public.lesson_plan_shares s where s.token = p_token;
  if v_class_id is null then
    return null;
  end if;

  select jsonb_build_object(
    'class', jsonb_build_object('date', c.date, 'start_time', c.start_time, 'title', c.title, 'status', c.status),
    'gym_name', g.name,
    'instructor_name', coalesce(nullif(p.name, ''), (select nullif(pc.name, '') from public.profiles pc where pc.id = s.created_by)),
    'content', lp.content,
    'updated_at', lp.updated_at,
    'review', case when s.review_status is null then null else jsonb_build_object(
      'status', s.review_status,
      'note', s.review_note,
      'reviewer_name', s.reviewer_name,
      'reviewed_at', s.reviewed_at
    ) end
  )
  into v_result
  from public.lesson_plan_shares s
  join public.classes c on c.id = s.class_id
  join public.gyms g on g.id = c.gym_id
  left join public.profiles p on p.id = c.instructor_id
  left join public.lesson_plans lp on lp.class_id = c.id
  where s.class_id = v_class_id;

  return v_result;
end $$;

-- Revisão do mestre pelo link. Chamável sem login; só altera a revisão do plano daquele token.
-- Devolve false se o link não existe mais.
create or replace function public.review_shared_lesson_plan(p_token text, p_status text, p_note text default null, p_reviewer_name text default null)
returns boolean
language plpgsql security definer
set search_path = ''
as $$
begin
  if p_token is null or length(p_token) < 32 then
    return false;
  end if;
  if p_status not in ('approved', 'changes_requested') then
    raise exception 'Revisão inválida' using errcode = '22023';
  end if;

  update public.lesson_plan_shares s
     set review_status = p_status,
         review_note = nullif(left(btrim(coalesce(p_note, '')), 2000), ''),
         reviewer_name = nullif(left(btrim(coalesce(p_reviewer_name, '')), 80), ''),
         reviewed_at = now()
   where s.token = p_token;

  return found;
end $$;

revoke execute on function public.shared_lesson_plan(text) from public;
grant execute on function public.shared_lesson_plan(text) to anon, authenticated;

revoke execute on function public.review_shared_lesson_plan(text, text, text, text) from public;
grant execute on function public.review_shared_lesson_plan(text, text, text, text) to anon, authenticated;

revoke execute on function public.rotate_lesson_plan_share(uuid) from public, anon;
grant execute on function public.rotate_lesson_plan_share(uuid) to authenticated;
