-- Convite de professor.
--
-- Conta nova começa sem acesso (papel 'student' sem aluno ligado = nada). Vira aluno pelo link do aluno
-- (claim_student_account) ou professor pelo convite que qualquer professor gera. O convite só libera o acesso
-- de professor: depois ele cadastra a própria academia, alunos e grade, e não vê as academias de quem convidou.
-- Vale para uma pessoa e expira em 7 dias.

alter table public.profiles alter column role set default 'student';
comment on column public.profiles.role is
  'instructor: professor (só por convite). student: aluno quando há students.profile_id; sem isso, conta sem acesso.';

create table public.instructor_invites (
  token text primary key default replace(gen_random_uuid()::text, '-', ''),
  created_by uuid not null default auth.uid() references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '7 days',
  used_by uuid references public.profiles (id) on delete set null,
  used_at timestamptz
);
create index instructor_invites_creator_idx on public.instructor_invites (created_by);

alter table public.instructor_invites enable row level security;
-- Quem criou vê os próprios convites e cancela os ainda não usados.
create policy instructor_invites_select on public.instructor_invites for select to authenticated
  using (created_by = (select auth.uid()));
create policy instructor_invites_delete on public.instructor_invites for delete to authenticated
  using (created_by = (select auth.uid()) and used_by is null);

-- Gera um convite. Só professor.
create or replace function public.create_instructor_invite()
returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  v_token text;
begin
  if not public.is_instructor() then
    raise exception 'Só professores podem convidar.';
  end if;
  insert into public.instructor_invites default values returning token into v_token;
  return v_token;
end $$;

-- O que a página do convite mostra antes do login. Chamável sem login; null se inválido, usado ou vencido.
create or replace function public.instructor_invite_info(p_token text)
returns jsonb
language sql stable security definer
set search_path = ''
as $$
  select jsonb_build_object('invited_by', nullif(p.name, ''), 'expires_at', i.expires_at)
  from public.instructor_invites i
  join public.profiles p on p.id = i.created_by
  where i.token = p_token and i.used_by is null and i.expires_at > now()
$$;

-- Aceita o convite com a conta logada: a conta vira professor.
create or replace function public.accept_instructor_invite(p_token text)
returns void
language plpgsql security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_invite public.instructor_invites;
begin
  if v_uid is null then
    raise exception 'Entre na sua conta primeiro.';
  end if;

  select * into v_invite from public.instructor_invites i where i.token = p_token for update;
  if v_invite.token is null or v_invite.expires_at <= now() then
    raise exception 'Convite vencido ou inválido. Peça um novo convite.';
  end if;
  if v_invite.used_by is not null and v_invite.used_by <> v_uid then
    raise exception 'Este convite já foi usado. Peça um novo convite.';
  end if;
  if exists (select 1 from public.students s where s.profile_id = v_uid) then
    raise exception 'Esta conta é de aluno. Crie outra conta, com outro e-mail, para ser professor.';
  end if;

  update public.profiles set role = 'instructor' where id = v_uid;
  update public.instructor_invites set used_by = v_uid, used_at = coalesce(used_at, now()) where token = p_token;
end $$;

-- Conta de professor não vira aluno (nem sem academia ainda).
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

  if public.is_instructor()
     or exists (select 1 from public.gym_instructors gi where gi.profile_id = v_uid)
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

revoke execute on function public.create_instructor_invite() from public, anon;
revoke execute on function public.instructor_invite_info(text) from public;
revoke execute on function public.accept_instructor_invite(text) from public, anon;
grant execute on function public.create_instructor_invite() to authenticated;
grant execute on function public.instructor_invite_info(text) to anon, authenticated;
grant execute on function public.accept_instructor_invite(text) to authenticated;
