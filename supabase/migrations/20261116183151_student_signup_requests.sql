-- Cadastro do aluno sem link: ele escolhe o professor e a academia, cria a conta e fica aguardando. O professor
-- (de qualquer academia em que dá aula) aprova dizendo qual aluno cadastrado é aquele login, ou cria um aluno novo,
-- ou recusa. Aprovado, a conta vira aluno e passa pelo aceite LGPD no primeiro acesso, como no fluxo do link.

create table public.student_signup_requests (
  id uuid primary key default gen_random_uuid(),
  profile_id uuid not null unique references public.profiles (id) on delete cascade,
  gym_id uuid not null references public.gyms (id) on delete cascade,
  name text not null check (length(trim(name)) > 0),
  phone text,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  student_id uuid references public.students (id) on delete set null,
  decided_by uuid references public.profiles (id) on delete set null,
  decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index student_signup_requests_gym_idx on public.student_signup_requests (gym_id, status);

-- Sem policies: tudo pelas funções abaixo.
alter table public.student_signup_requests enable row level security;

-- Pedido já no cadastro (metadados do signUp), para funcionar mesmo com confirmação de e-mail em outro navegador.
-- Metadado do cliente só cria um pedido pendente; nunca dá papel nem acesso.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer
set search_path = ''
as $$
declare
  v_gym uuid;
begin
  insert into public.profiles (id, name)
  values (new.id, coalesce(new.raw_user_meta_data ->> 'name', split_part(new.email, '@', 1), ''))
  on conflict (id) do nothing;

  if new.raw_user_meta_data ? 'student_gym_id' then
    begin
      v_gym := (new.raw_user_meta_data ->> 'student_gym_id')::uuid;
      insert into public.student_signup_requests (profile_id, gym_id, name, phone)
      select new.id, g.id,
             coalesce(nullif(trim(new.raw_user_meta_data ->> 'name'), ''), split_part(new.email, '@', 1)),
             nullif(trim(new.raw_user_meta_data ->> 'student_phone'), '')
        from public.gyms g where g.id = v_gym
      on conflict (profile_id) do nothing;
    exception when others then
      null; -- metadado inválido nunca impede o cadastro
    end;
  end if;
  return new;
end $$;

-- Professores (com nome) e as academias em que dão aula, para o aluno escolher. Chamável sem login.
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

-- Pedido (ou troca de academia) pela conta logada.
create or replace function public.request_student_access(p_gym_id uuid, p_name text, p_phone text default null)
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
  if public.is_instructor() then
    raise exception 'Esta é uma conta de professor.';
  end if;
  if exists (select 1 from public.students s where s.profile_id = v_uid) then
    raise exception 'Sua conta já está ligada a um aluno.';
  end if;
  if not exists (select 1 from public.gyms g where g.id = p_gym_id) then
    raise exception 'Academia não encontrada.';
  end if;
  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'Informe seu nome.';
  end if;

  insert into public.student_signup_requests (profile_id, gym_id, name, phone)
  values (v_uid, p_gym_id, trim(p_name), nullif(trim(p_phone), ''))
  on conflict (profile_id) do update
    set gym_id = excluded.gym_id,
        name = excluded.name,
        phone = excluded.phone,
        status = 'pending',
        student_id = null,
        decided_by = null,
        decided_at = null,
        created_at = now();
end $$;

-- Situação do pedido da conta logada. null = sem pedido.
create or replace function public.my_signup_request()
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object('status', r.status, 'gym_name', g.name, 'name', r.name, 'created_at', r.created_at)
  from public.student_signup_requests r
  join public.gyms g on g.id = r.gym_id
  where r.profile_id = (select auth.uid())
$$;

-- Pedidos pendentes das academias do professor, com o e-mail da conta.
create or replace function public.list_student_requests()
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
           'created_at', r.created_at
         ) order by r.created_at), '[]'::jsonb)
  from public.student_signup_requests r
  join auth.users u on u.id = r.profile_id
  where r.status = 'pending'
    and public.is_gym_member(r.gym_id)
    and not exists (select 1 from public.students s where s.profile_id = r.profile_id)
$$;

-- Aprova: liga a conta ao aluno escolhido (da mesma academia, sem conta) ou cria um aluno novo. Devolve o aluno.
create or replace function public.approve_student_request(p_request_id uuid, p_student_id uuid default null)
returns uuid
language plpgsql security definer
set search_path = ''
as $$
declare
  v_req public.student_signup_requests;
  v_student_id uuid;
  v_owner uuid;
begin
  select * into v_req from public.student_signup_requests where id = p_request_id for update;
  if v_req.id is null or v_req.status <> 'pending' then
    raise exception 'Pedido não encontrado ou já decidido.';
  end if;
  if not public.is_gym_member(v_req.gym_id) then
    raise exception 'Você não dá aula nesta academia.';
  end if;
  if exists (select 1 from public.students s where s.profile_id = v_req.profile_id) then
    raise exception 'Esta conta já está ligada a um aluno.';
  end if;
  if exists (select 1 from public.profiles p where p.id = v_req.profile_id and p.role = 'instructor') then
    raise exception 'Esta conta é de professor.';
  end if;

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
    insert into public.students (gym_id, name, phone)
    values (v_req.gym_id, v_req.name, v_req.phone)
    returning id into v_student_id;
  end if;

  update public.students set profile_id = v_req.profile_id where id = v_student_id;
  update public.profiles set role = 'student' where id = v_req.profile_id;
  update public.student_signup_requests
     set status = 'approved', student_id = v_student_id, decided_by = (select auth.uid()), decided_at = now()
   where id = p_request_id;
  return v_student_id;
end $$;

create or replace function public.reject_student_request(p_request_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_gym uuid;
begin
  select gym_id into v_gym from public.student_signup_requests where id = p_request_id and status = 'pending';
  if v_gym is null then
    raise exception 'Pedido não encontrado ou já decidido.';
  end if;
  if not public.is_gym_member(v_gym) then
    raise exception 'Você não dá aula nesta academia.';
  end if;
  update public.student_signup_requests
     set status = 'rejected', decided_by = (select auth.uid()), decided_at = now()
   where id = p_request_id;
end $$;

revoke execute on function public.signup_directory() from public;
revoke execute on function public.request_student_access(uuid, text, text) from public, anon;
revoke execute on function public.my_signup_request() from public, anon;
revoke execute on function public.list_student_requests() from public, anon;
revoke execute on function public.approve_student_request(uuid, uuid) from public, anon;
revoke execute on function public.reject_student_request(uuid) from public, anon;
grant execute on function public.signup_directory() to anon, authenticated;
grant execute on function public.request_student_access(uuid, text, text) to authenticated;
grant execute on function public.my_signup_request() to authenticated;
grant execute on function public.list_student_requests() to authenticated;
grant execute on function public.approve_student_request(uuid, uuid) to authenticated;
grant execute on function public.reject_student_request(uuid) to authenticated;
