-- Cadastro de aluno (app do professor, /cadastro-aluno) chegando na academia com gestão.
--
-- A academia com gestão não tem professores em `gym_instructors`, então não aparecia no cadastro do aluno. Agora o
-- admin escolhe, nas configurações, o nome que aparece no cadastro (`gyms.signup_label`, ex.: "King of Glory – Matriz")
-- e quem aparece como professor (`gyms.signup_contact_id`, um admin ou professor da academia). Os pedidos dessa
-- academia são decididos pelos administradores no sistema da academia (`academy_signup_requests`,
-- `academy_approve_signup_request`, `academy_reject_signup_request`), com as mesmas regras do app do professor:
-- ninguém decide o próprio pedido e a aprovação liga a conta a um aluno já cadastrado ou cria um aluno novo.
-- Rollback: supabase/rollback/20261129130000_academy_signup_requests.down.sql

alter table public.gyms
  add column signup_label text check (signup_label is null or length(trim(signup_label)) between 1 and 80),
  add column signup_contact_id uuid references public.profiles (id) on delete set null;

-- Nome da academia no cadastro do aluno.
create or replace function public.gym_signup_name(p_gym public.gyms) returns text
language sql stable
set search_path = ''
as $$ select coalesce(nullif(trim(p_gym.signup_label), ''), p_gym.name) $$;

-- Configuração do cadastro (só o admin).
create or replace function public.academy_signup_settings(p_gym_id uuid)
returns table (signup_label text, signup_contact_id uuid)
language sql stable security definer
set search_path = ''
as $$
  select g.signup_label, g.signup_contact_id from public.gyms g
  where g.id = p_gym_id and public.is_academy_admin(p_gym_id)
$$;

create or replace function public.set_academy_signup(p_gym_id uuid, p_label text, p_contact_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not public.is_academy_admin(p_gym_id) then
    raise exception 'Só o administrador da academia pode alterar o cadastro de alunos.';
  end if;
  if p_contact_id is not null and not exists (
    select 1 from public.academy_members am
    where am.gym_id = p_gym_id and am.profile_id = p_contact_id and am.role in ('admin', 'professor')
  ) then
    raise exception 'Escolha um administrador ou professor da academia.';
  end if;
  if length(trim(coalesce(p_label, ''))) > 80 then
    raise exception 'Nome muito longo (até 80 caracteres).';
  end if;
  update public.gyms
     set signup_label = nullif(trim(p_label), ''), signup_contact_id = p_contact_id
   where id = p_gym_id;
end $$;

-- Professores e academias do cadastro: os do app do professor e as academias com gestão que têm um contato.
create or replace function public.signup_directory()
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(t.x order by t.x ->> 'name'), '[]'::jsonb)
  from (
    select jsonb_build_object(
             'id', e.profile_id,
             'name', e.profile_name,
             'gyms', jsonb_agg(jsonb_build_object('id', e.gym_id, 'name', e.gym_name) order by e.gym_name)
           ) as x
    from (
      select p.id as profile_id, p.name as profile_name, g.id as gym_id, public.gym_signup_name(g) as gym_name
        from public.profiles p
        join public.gym_instructors gi on gi.profile_id = p.id
        join public.gyms g on g.id = gi.gym_id
       where p.role = 'instructor' and length(trim(p.name)) > 0
      union
      select p.id, p.name, g.id, public.gym_signup_name(g)
        from public.gyms g
        join public.profiles p on p.id = g.signup_contact_id
       where g.management_enabled and length(trim(p.name)) > 0
         and exists (
           select 1 from public.academy_members am
           where am.gym_id = g.id and am.profile_id = p.id and am.role in ('admin', 'professor')
         )
    ) e
    group by e.profile_id, e.profile_name
  ) t
$$;

-- Situação do pedido com o nome da academia do cadastro.
create or replace function public.my_signup_request()
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object('status', r.status, 'gym_name', public.gym_signup_name(g), 'name', r.name, 'created_at', r.created_at,
                            'has_photo', r.photo_path is not null)
  from public.student_signup_requests r
  join public.gyms g on g.id = r.gym_id
  where r.profile_id = (select auth.uid())
$$;

-- Pedido pela conta logada: conta de professor também pode pedir, desde que outra pessoa possa decidir
-- (outro professor da academia no app do professor ou outro admin da academia com gestão).
create or replace function public.request_student_access(
  p_gym_id uuid, p_name text, p_phone text default null, p_rank_id uuid default null, p_graduated_at date default null,
  p_birth_date date default null
)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if v_uid is null then
    raise exception 'Entre na sua conta primeiro.';
  end if;
  if exists (select 1 from public.students s where s.profile_id = v_uid) then
    raise exception 'Sua conta já está ligada a um aluno.';
  end if;
  if not exists (select 1 from public.gyms g where g.id = p_gym_id) then
    raise exception 'Academia não encontrada.';
  end if;
  if public.is_instructor()
     and not exists (select 1 from public.gym_instructors gi where gi.gym_id = p_gym_id and gi.profile_id <> v_uid)
     and not exists (
       select 1 from public.academy_members am join public.gyms g on g.id = am.gym_id and g.management_enabled
       where am.gym_id = p_gym_id and am.profile_id <> v_uid and am.role = 'admin'
     ) then
    raise exception 'Seu pedido precisa ser aprovado por outro professor, e esta academia não tem outro professor.';
  end if;
  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'Informe seu nome.';
  end if;
  if p_rank_id is not null then
    if not exists (select 1 from public.ranks r where r.id = p_rank_id) then
      raise exception 'Graduação não encontrada.';
    end if;
    if p_graduated_at is null then
      raise exception 'Informe a data da última graduação.';
    end if;
    if p_graduated_at > current_date then
      raise exception 'A data da última graduação não pode ser no futuro.';
    end if;
  end if;
  if p_birth_date is not null and (p_birth_date < '1900-01-01' or p_birth_date > current_date) then
    raise exception 'Data de nascimento inválida.';
  end if;

  insert into public.student_signup_requests (profile_id, gym_id, name, phone, rank_id, graduated_at, birth_date)
  values (v_uid, p_gym_id, trim(p_name), nullif(trim(p_phone), ''), p_rank_id,
          case when p_rank_id is null then null else p_graduated_at end, p_birth_date)
  on conflict (profile_id) do update
    set gym_id = excluded.gym_id,
        name = excluded.name,
        phone = excluded.phone,
        rank_id = excluded.rank_id,
        graduated_at = excluded.graduated_at,
        birth_date = excluded.birth_date,
        status = 'pending',
        student_id = null,
        decided_by = null,
        decided_at = null,
        created_at = now();
end $$;

-- Foto do cadastro: também o admin da academia com gestão do pedido.
create or replace function public.can_view_signup_face(p_owner uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.student_signup_requests r
    where r.profile_id = p_owner and (public.is_gym_member(r.gym_id) or public.is_academy_admin(r.gym_id))
  )
$$;

-- ── pedidos no sistema da academia (só admin) ─────────────────────────────
create or replace function public.academy_signup_requests(p_gym_id uuid)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', r.id,
           'name', r.name,
           'phone', r.phone,
           'email', u.email,
           'gym_id', r.gym_id,
           'photo_path', r.photo_path,
           'rank_id', r.rank_id,
           'rank_name', k.name,
           'rank_grade', k.grade,
           'rank_track', k.track,
           'graduated_at', r.graduated_at,
           'birth_date', r.birth_date,
           'created_at', r.created_at,
           'minor', public.is_minor(r.birth_date, public.today_sp()),
           'guardian_term', case when r.guardian_esign is not null then 'esign' when r.guardian_file_path is not null then 'file' end,
           'guardian_file_path', r.guardian_file_path
         ) order by r.created_at), '[]'::jsonb)
  from public.student_signup_requests r
  join auth.users u on u.id = r.profile_id
  left join public.ranks k on k.id = r.rank_id
  where r.gym_id = p_gym_id
    and public.is_academy_admin(p_gym_id)
    and r.status = 'pending'
    and r.photo_path is not null
    and r.profile_id <> (select auth.uid())
    and not exists (select 1 from public.students s where s.profile_id = r.profile_id)
$$;

create or replace function public.academy_reject_signup_request(p_request_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_req public.student_signup_requests;
begin
  select * into v_req from public.student_signup_requests where id = p_request_id and status = 'pending';
  if v_req.id is null or not public.is_academy_admin(v_req.gym_id) then
    raise exception 'Pedido não encontrado ou já decidido.';
  end if;
  if v_req.profile_id = (select auth.uid()) then
    raise exception 'O seu pedido precisa ser decidido por outro administrador.';
  end if;
  update public.student_signup_requests
     set status = 'rejected', decided_by = (select auth.uid()), decided_at = now()
   where id = p_request_id;
end $$;

-- Aprovar: liga a conta ao aluno `p_student_id` (da academia, sem conta) ou cria um aluno novo. Mesmas regras de
-- approve_student_request (app do professor), com a permissão do admin da academia.
create or replace function public.academy_approve_signup_request(p_request_id uuid, p_student_id uuid default null)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_req public.student_signup_requests;
  v_student_id uuid;
  v_owner uuid;
  v_track text;
begin
  select * into v_req from public.student_signup_requests where id = p_request_id for update;
  if v_req.id is null or v_req.status <> 'pending' or not public.is_academy_admin(v_req.gym_id) then
    raise exception 'Pedido não encontrado ou já decidido.';
  end if;
  if v_req.photo_path is null then
    raise exception 'O aluno ainda não enviou a foto de rosto.';
  end if;
  if exists (select 1 from public.students s where s.profile_id = v_req.profile_id) then
    raise exception 'Esta conta já está ligada a um aluno.';
  end if;
  if v_req.profile_id = (select auth.uid()) then
    raise exception 'O seu pedido precisa ser aprovado por outro administrador.';
  end if;

  select r.track into v_track from public.ranks r where r.id = v_req.rank_id;

  if p_student_id is not null then
    select s.id, s.profile_id into v_student_id, v_owner
      from public.students s where s.id = p_student_id and s.gym_id = v_req.gym_id for update;
    if v_student_id is null then
      raise exception 'Aluno não encontrado nesta academia.';
    end if;
    if v_owner is not null then
      raise exception 'Este aluno já tem uma conta.';
    end if;
  else
    insert into public.students (gym_id, name, phone, track, birth_date)
    values (v_req.gym_id, v_req.name, v_req.phone, coalesce(v_track, 'adulto'), v_req.birth_date)
    returning id into v_student_id;
  end if;

  if v_req.rank_id is not null and v_req.graduated_at is not null
     and not exists (select 1 from public.student_graduations g where g.student_id = v_student_id) then
    insert into public.student_graduations (student_id, rank_id, graduated_at)
    values (v_student_id, v_req.rank_id, v_req.graduated_at)
    on conflict (student_id, rank_id) do nothing;
  end if;

  update public.students
     set profile_id = v_req.profile_id,
         birth_date = coalesce(birth_date, v_req.birth_date)
   where id = v_student_id;
  update public.profiles set role = 'student' where id = v_req.profile_id and role <> 'instructor';
  update public.student_signup_requests
     set status = 'approved', student_id = v_student_id, decided_by = (select auth.uid()), decided_at = now(),
         approval_notify_pending = true
   where id = p_request_id;

  begin
    perform public.wake_push_reminders();
  exception when others then
    null;
  end;
  return v_student_id;
end $$;

revoke execute on function public.gym_signup_name(public.gyms) from public, anon;
grant execute on function public.gym_signup_name(public.gyms) to authenticated;
revoke execute on function public.academy_signup_settings(uuid), public.set_academy_signup(uuid, text, uuid),
  public.academy_signup_requests(uuid), public.academy_reject_signup_request(uuid),
  public.academy_approve_signup_request(uuid, uuid) from public, anon;
grant execute on function public.academy_signup_settings(uuid), public.set_academy_signup(uuid, text, uuid),
  public.academy_signup_requests(uuid), public.academy_reject_signup_request(uuid),
  public.academy_approve_signup_request(uuid, uuid) to authenticated;
