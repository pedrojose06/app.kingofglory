-- Desfaz 20261129130000_academy_signup_requests (volta às definições anteriores das funções do cadastro).

drop function if exists public.academy_approve_signup_request(uuid, uuid);
drop function if exists public.academy_reject_signup_request(uuid);
drop function if exists public.academy_signup_requests(uuid);
drop function if exists public.set_academy_signup(uuid, text, uuid);
drop function if exists public.academy_signup_settings(uuid);

create or replace function public.can_view_signup_face(p_owner uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.student_signup_requests r
    where r.profile_id = p_owner and public.is_gym_member(r.gym_id)
  )
$$;

create or replace function public.my_signup_request()
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object('status', r.status, 'gym_name', g.name, 'name', r.name, 'created_at', r.created_at,
                            'has_photo', r.photo_path is not null)
  from public.student_signup_requests r
  join public.gyms g on g.id = r.gym_id
  where r.profile_id = (select auth.uid())
$$;

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
  if public.is_instructor() and not exists (
    select 1 from public.gym_instructors gi where gi.gym_id = p_gym_id and gi.profile_id <> v_uid
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

-- Pedidos pendentes: o professor não vê o próprio pedido.
create or replace function public.signup_directory()
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(t.x order by t.x ->> 'name'), '[]'::jsonb)
  from (
    select jsonb_build_object(
             'id', p.id,
             'name', p.name,
             'gyms', jsonb_agg(jsonb_build_object('id', g.id, 'name', g.name) order by g.name)
           ) as x
    from public.profiles p
    join public.gym_instructors gi on gi.profile_id = p.id
    join public.gyms g on g.id = gi.gym_id
    where p.role = 'instructor' and length(trim(p.name)) > 0
    group by p.id, p.name
  ) t
$$;

drop function if exists public.gym_signup_name(public.gyms);
alter table public.gyms drop column if exists signup_contact_id, drop column if exists signup_label;
