-- Área do aluno: cada aluno pode ter um link secreto para ver as próprias presenças e a graduação, sem login.
-- O professor gera o link na tela do aluno e manda (WhatsApp); gerar de novo invalida o anterior; revogar apaga.
-- O token tem 122 bits aleatórios (uuid v4 sem hífens). Quem não tem o link não consegue chegar aos dados.

create table public.student_access (
  student_id uuid primary key references public.students (id) on delete cascade,
  token text not null unique default replace(gen_random_uuid()::text, '-', ''),
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  last_seen_at timestamptz -- último acesso do aluno (atualizado no máximo 1x por hora)
);

alter table public.student_access enable row level security;
create policy student_access_select on public.student_access for select to authenticated
  using (public.can_manage_student(student_id));
create policy student_access_insert on public.student_access for insert to authenticated
  with check (public.can_manage_student(student_id));
create policy student_access_update on public.student_access for update to authenticated
  using (public.can_manage_student(student_id)) with check (public.can_manage_student(student_id));
create policy student_access_delete on public.student_access for delete to authenticated
  using (public.can_manage_student(student_id));

-- Gera (ou troca) o link do aluno. security invoker: a RLS acima vale.
create or replace function public.rotate_student_access(p_student_id uuid)
returns text
language sql
set search_path = ''
as $$
  insert into public.student_access (student_id) values (p_student_id)
  on conflict (student_id) do update
    set token = replace(gen_random_uuid()::text, '-', ''),
        created_by = (select auth.uid()),
        created_at = now(),
        last_seen_at = null
  returning token
$$;

-- Dados da área do aluno a partir do token. Chamável sem login (anon): o token é a credencial.
-- Devolve só o que é do próprio aluno; telefone e observações do professor ficam de fora.
-- Token inválido ou revogado → null.
create or replace function public.student_portal(p_token text)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_student_id uuid;
  v_result jsonb;
begin
  if p_token is null or length(p_token) < 32 then
    return null;
  end if;

  update public.student_access sa
     set last_seen_at = now()
   where sa.token = p_token
     and (sa.last_seen_at is null or sa.last_seen_at < now() - interval '1 hour');

  select sa.student_id into v_student_id from public.student_access sa where sa.token = p_token;
  if v_student_id is null then
    return null;
  end if;

  select jsonb_build_object(
    'student', jsonb_build_object(
      'id', s.id,
      'name', s.name,
      'active', s.active,
      'track', s.track,
      'birth_date', s.birth_date,
      'started_on', s.started_on,
      'created_at', s.created_at,
      'opening_present', s.opening_present,
      'opening_absent', s.opening_absent,
      'opening_from', s.opening_from,
      'opening_until', s.opening_until,
      'opening_after_grad', s.opening_after_grad
    ),
    'gym_name', g.name,
    'progress', (
      select to_jsonb(p) from public.student_progress p where p.student_id = s.id
    ),
    'graduations', coalesce((
      select jsonb_agg(jsonb_build_object('rank_id', sg.rank_id, 'graduated_at', sg.graduated_at)
                       order by sg.graduated_at desc, sg.created_at desc)
      from public.student_graduations sg where sg.student_id = s.id
    ), '[]'::jsonb),
    'ranks', coalesce((
      select jsonb_agg(to_jsonb(r) order by r.grade) from public.ranks r where r.track = s.track
    ), '[]'::jsonb),
    'attendance', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', a.id,
               'date', a.date,
               'status', a.status,
               'class_id', a.class_id,
               'title', c.title,
               'start_time', c.start_time,
               'location_label', a.location_label
             ) order by a.date desc, c.start_time desc nulls last)
      from public.attendance a
      left join public.classes c on c.id = a.class_id
      where a.student_id = s.id
    ), '[]'::jsonb)
  )
  into v_result
  from public.students s
  join public.gyms g on g.id = s.gym_id
  where s.id = v_student_id;

  return v_result;
end $$;

revoke execute on function public.student_portal(text) from public;
grant execute on function public.student_portal(text) to anon, authenticated;

revoke execute on function public.rotate_student_access(uuid) from public, anon;
grant execute on function public.rotate_student_access(uuid) to authenticated;
