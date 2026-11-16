-- Conta do aluno e link temporário.
--
-- 1. O link da área do aluno expira (padrão: 24 h). Links que já existiam passam a valer 24 h a partir daqui.
-- 2. O aluno pode criar uma conta. A conta é ligada ao aluno pelo link (quem tem o link válido prova que é o
--    aluno); o papel 'student' é dado só por essa função, nunca por metadados do cliente.
-- 3. Com conta, o acesso exige o aceite de uso de imagem (LGPD) dado pelo próprio aluno. Sem aceite, a conta
--    não vê nada e o aluno continua dependendo do link do professor.

-- ── link com validade ───────────────────────────────────────────────────────
alter table public.student_access add column expires_at timestamptz;
update public.student_access set expires_at = now() + interval '24 hours';
alter table public.student_access
  alter column expires_at set not null,
  alter column expires_at set default now() + interval '24 hours';

drop function public.rotate_student_access(uuid);

-- Gera (ou troca) o link do aluno, válido por p_hours (1 h a 30 dias). security invoker: vale a RLS.
create function public.rotate_student_access(p_student_id uuid, p_hours integer default 24)
returns text
language sql
set search_path = ''
as $$
  insert into public.student_access (student_id, expires_at)
  values (p_student_id, now() + make_interval(hours => greatest(1, least(coalesce(p_hours, 24), 720))))
  on conflict (student_id) do update
    set token = replace(gen_random_uuid()::text, '-', ''),
        created_by = (select auth.uid()),
        created_at = now(),
        last_seen_at = null,
        expires_at = excluded.expires_at
  returning token
$$;

revoke execute on function public.rotate_student_access(uuid, integer) from public, anon;
grant execute on function public.rotate_student_access(uuid, integer) to authenticated;

-- ── aceite do aluno ─────────────────────────────────────────────────────────
alter table public.students add column account_consent_at timestamptz;
comment on column public.students.account_consent_at is
  'Quando o próprio aluno, na conta dele, aceitou o uso de imagem (LGPD). Sem isso a conta não acessa nada.';

-- Aluno só "é dono" dos próprios dados com o aceite dele e o consentimento de imagem em vigor.
-- (Se o professor retirar o consentimento, a conta perde o acesso até o aluno aceitar de novo.)
create or replace function public.is_own_student(p_student_id uuid) returns boolean
language sql stable security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.students s
    where s.id = p_student_id
      and s.profile_id = (select auth.uid())
      and s.account_consent_at is not null
      and s.image_consent_at is not null
  )
$$;

-- O aluno não lê a própria linha de students direto (tem telefone e observações do professor);
-- usa as funções abaixo.
drop policy students_select on public.students;
create policy students_select on public.students for select to authenticated
  using (public.is_gym_member(gym_id));

-- ── dados da área do aluno ──────────────────────────────────────────────────
-- Montagem única, usada pelo link e pela conta. Não é chamável direto.
create or replace function public.portal_payload(p_student_id uuid)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
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
    'next_graduation_on', (select gs.next_on from public.graduation_schedule gs where gs.track = s.track),
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
               'location_label', a.location_label,
               'credits', a.credits
             ) order by a.date desc, c.start_time desc nulls last)
      from public.attendance a
      left join public.classes c on c.id = a.class_id
      where a.student_id = s.id
    ), '[]'::jsonb)
  )
  from public.students s
  join public.gyms g on g.id = s.gym_id
  where s.id = p_student_id
$$;

revoke execute on function public.portal_payload(uuid) from public, anon, authenticated;

-- Pelo link: token válido e dentro da validade. Inclui `access` (validade e se o aluno já tem conta).
create or replace function public.student_portal(p_token text)
returns jsonb
language plpgsql security definer
set search_path = ''
as $$
declare
  v_access public.student_access;
  v_has_account boolean;
begin
  if p_token is null or length(p_token) < 32 then
    return null;
  end if;

  select * into v_access from public.student_access sa where sa.token = p_token and sa.expires_at > now();
  if v_access.student_id is null then
    return null;
  end if;

  if v_access.last_seen_at is null or v_access.last_seen_at < now() - interval '1 hour' then
    update public.student_access set last_seen_at = now() where student_id = v_access.student_id;
  end if;

  select s.profile_id is not null into v_has_account from public.students s where s.id = v_access.student_id;

  return public.portal_payload(v_access.student_id)
    || jsonb_build_object('access', jsonb_build_object('expires_at', v_access.expires_at, 'has_account', v_has_account));
end $$;

revoke execute on function public.student_portal(text) from public;
grant execute on function public.student_portal(text) to anon, authenticated;

-- ── conta do aluno ──────────────────────────────────────────────────────────
-- Liga a conta logada ao aluno do link. Conta de professor (com academia) não pode virar aluno.
create or replace function public.claim_student_account(p_token text)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_student_id uuid;
  v_owner uuid;
begin
  if v_uid is null then
    raise exception 'Entre na sua conta primeiro.';
  end if;

  select sa.student_id into v_student_id
    from public.student_access sa
   where sa.token = p_token and sa.expires_at > now();
  if v_student_id is null then
    raise exception 'O link expirou ou foi desativado. Peça um novo link ao professor.';
  end if;

  if exists (select 1 from public.gym_instructors gi where gi.profile_id = v_uid)
     or exists (select 1 from public.gyms g where g.created_by = v_uid) then
    raise exception 'Esta é uma conta de professor e não pode ser ligada a um aluno.';
  end if;

  if exists (select 1 from public.students s where s.profile_id = v_uid and s.id <> v_student_id) then
    raise exception 'Esta conta já está ligada a outro aluno.';
  end if;

  select s.profile_id into v_owner from public.students s where s.id = v_student_id for update;
  if v_owner is not null and v_owner <> v_uid then
    raise exception 'Este aluno já tem uma conta. Entre com ela ou peça ao professor para desvincular.';
  end if;

  update public.students set profile_id = v_uid where id = v_student_id;
  update public.profiles set role = 'student' where id = v_uid;
end $$;

-- Situação da conta logada: aluno ligado e aceite. null = conta sem aluno.
create or replace function public.my_student_account()
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'student_id', s.id,
    'name', s.name,
    'gym_name', g.name,
    'account_consent_at', s.account_consent_at,
    'image_consent_at', s.image_consent_at
  )
  from public.students s
  join public.gyms g on g.id = s.gym_id
  where s.profile_id = (select auth.uid())
$$;

-- Aceite de uso de imagem dado pelo próprio aluno, na conta dele.
create or replace function public.accept_image_consent()
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  update public.students
     set account_consent_at = now(), image_consent_at = now()
   where profile_id = (select auth.uid());
  if not found then
    raise exception 'Conta sem aluno ligado.';
  end if;
end $$;

-- Área do aluno pela conta (sem link). Sem aceite → null.
create or replace function public.my_student_portal()
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select public.portal_payload(s.id)
  from public.students s
  where s.profile_id = (select auth.uid())
    and s.account_consent_at is not null
    and s.image_consent_at is not null
$$;

revoke execute on function public.claim_student_account(text) from public, anon;
revoke execute on function public.my_student_account() from public, anon;
revoke execute on function public.accept_image_consent() from public, anon;
revoke execute on function public.my_student_portal() from public, anon;
grant execute on function public.claim_student_account(text) to authenticated;
grant execute on function public.my_student_account() to authenticated;
grant execute on function public.accept_image_consent() to authenticated;
grant execute on function public.my_student_portal() to authenticated;
