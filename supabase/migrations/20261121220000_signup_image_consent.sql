-- Autorização de uso de imagem já no cadastro do aluno sem link (junto com os outros dados).
--
-- O aluno maior de idade marca a autorização no cadastro; ela fica no pedido (`image_consent_at`) e, quando o
-- professor aprova, vai para o aluno (`students.image_consent_at` e `account_consent_at`): ele entra direto na conta,
-- sem a tela de aceite. Menor de idade não autoriza no cadastro: vale o termo do responsável.

alter table public.student_signup_requests add column image_consent_at timestamptz;

-- Cadastro sem sessão: a autorização vem nos metadados do signUp (`student_image_consent` = 'true').
create or replace function public.signup_request_image_consent() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from auth.users u
    where u.id = new.profile_id and u.raw_user_meta_data ->> 'student_image_consent' = 'true'
  ) and not public.is_minor(new.birth_date, public.today_sp()) then
    new.image_consent_at := coalesce(new.image_consent_at, now());
  end if;
  return new;
end $$;
create trigger student_signup_requests_image_consent before insert on public.student_signup_requests
  for each row execute function public.signup_request_image_consent();

-- Cadastro com a conta já logada (request_student_access): o app registra a autorização logo depois do pedido.
create or replace function public.set_my_signup_image_consent()
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  update public.student_signup_requests r
     set image_consent_at = now()
   where r.profile_id = (select auth.uid())
     and r.status = 'pending'
     and not public.is_minor(r.birth_date, public.today_sp());
end $$;

-- Aprovado: a autorização do pedido vai para o aluno (sem apagar uma que ele já tivesse).
create or replace function public.signup_request_apply_consent() returns trigger
language plpgsql security definer
set search_path = ''
as $$
begin
  update public.students s
     set image_consent_at = coalesce(s.image_consent_at, new.image_consent_at),
         account_consent_at = coalesce(s.account_consent_at, new.image_consent_at)
   where s.id = new.student_id
     and s.profile_id = new.profile_id
     and not public.is_minor(s.birth_date, public.today_sp());
  return new;
end $$;
create trigger student_signup_requests_apply_consent
  after update of status on public.student_signup_requests
  for each row when (new.status = 'approved' and old.status is distinct from 'approved'
                     and new.student_id is not null and new.image_consent_at is not null)
  execute function public.signup_request_apply_consent();

revoke execute on function public.signup_request_image_consent() from public, anon, authenticated;
revoke execute on function public.signup_request_apply_consent() from public, anon, authenticated;
revoke execute on function public.set_my_signup_image_consent() from public, anon;
grant execute on function public.set_my_signup_image_consent() to authenticated;
