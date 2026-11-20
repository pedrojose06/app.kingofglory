-- Professor que também é aluno, com o mesmo e-mail.
--
-- A conta de professor pode pedir acesso de aluno pelo cadastro (escolhendo professor e academia). O pedido só
-- pode ser aprovado por OUTRO professor: quem pediu não vê o próprio pedido nem consegue aprová-lo. Aprovado, a
-- conta continua professor (o papel não cai para 'student') e passa a ter também a área do aluno, pela ligação
-- students.profile_id. O link do aluno continua não ligando conta de professor (o professor geraria o link
-- para si mesmo e se aprovaria).

-- Pedido pela conta logada: conta de professor também pode pedir.
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
           'photo_path', r.photo_path,
           'rank_id', r.rank_id,
           'rank_name', k.name,
           'rank_grade', k.grade,
           'rank_track', k.track,
           'graduated_at', r.graduated_at,
           'birth_date', r.birth_date,
           'created_at', r.created_at
         ) order by r.created_at), '[]'::jsonb)
  from public.student_signup_requests r
  join auth.users u on u.id = r.profile_id
  left join public.ranks k on k.id = r.rank_id
  where r.status = 'pending'
    and r.photo_path is not null
    and r.profile_id <> (select auth.uid())
    and public.is_gym_member(r.gym_id)
    and not exists (select 1 from public.students s where s.profile_id = r.profile_id)
$$;

-- Recusar: nunca o próprio pedido.
create or replace function public.reject_student_request(p_request_id uuid)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_req public.student_signup_requests;
begin
  select * into v_req from public.student_signup_requests where id = p_request_id and status = 'pending';
  if v_req.id is null then
    raise exception 'Pedido não encontrado ou já decidido.';
  end if;
  if v_req.profile_id = (select auth.uid()) then
    raise exception 'O seu pedido precisa ser decidido por outro professor.';
  end if;
  if not public.is_gym_member(v_req.gym_id) then
    raise exception 'Você não dá aula nesta academia.';
  end if;
  update public.student_signup_requests
     set status = 'rejected', decided_by = (select auth.uid()), decided_at = now()
   where id = p_request_id;
end $$;

-- Aprovar: pedido de professor é aceito, mas nunca pelo próprio; o papel de professor é mantido.
create or replace function public.approve_student_request(p_request_id uuid, p_student_id uuid default null)
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
  if v_req.id is null or v_req.status <> 'pending' then
    raise exception 'Pedido não encontrado ou já decidido.';
  end if;
  if v_req.photo_path is null then
    raise exception 'O aluno ainda não enviou a foto de rosto.';
  end if;
  if not public.is_gym_member(v_req.gym_id) then
    raise exception 'Você não dá aula nesta academia.';
  end if;
  if exists (select 1 from public.students s where s.profile_id = v_req.profile_id) then
    raise exception 'Esta conta já está ligada a um aluno.';
  end if;
  if v_req.profile_id = (select auth.uid()) then
    raise exception 'O seu pedido precisa ser aprovado por outro professor.';
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
  -- Professor continua professor; a área do aluno vem da ligação acima.
  update public.profiles set role = 'student' where id = v_req.profile_id and role <> 'instructor';
  update public.student_signup_requests
     set status = 'approved', student_id = v_student_id, decided_by = (select auth.uid()), decided_at = now(),
         approval_notify_pending = true
   where id = p_request_id;

  -- Avisa o aluno (push + e-mail) na hora. Falha ao acordar a função não desfaz a aprovação: o cron tenta de novo.
  begin
    perform public.wake_push_reminders();
  exception when others then
    null;
  end;
  return v_student_id;
end $$;
