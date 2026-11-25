-- Aluno menor: a autorização do responsável no termo aprovado já vale para a conta do aluno no app.
--
-- Antes, depois de o professor aprovar o termo com "autorizou", o aluno ainda via a tela de aceite de uso de imagem
-- (accept_image_consent) ao entrar. Para menor de idade quem autoriza é o responsável (LGPD art. 14), então a
-- aprovação do termo com uso de imagem marca também students.account_consent_at e a conta abre direto.
-- Termo aprovado sem uso de imagem continua sem conta (o aluno vê o aviso de sempre).

create or replace function public.review_guardian_consent(
  p_student_id uuid, p_approve boolean, p_image_consent boolean default false, p_reason text default null
)
returns text
language plpgsql security definer
set search_path = ''
as $$
declare
  v_status text;
  v_path text;
  v_signed timestamptz;
  v_image boolean;
  v_face boolean;
begin
  if not public.can_manage_student(p_student_id) then
    raise exception 'Aluno não encontrado.';
  end if;
  select c.status, c.file_path, c.signed_at, c.image_authorized, c.face_authorized
    into v_status, v_path, v_signed, v_image, v_face
    from public.student_guardian_consents c where c.student_id = p_student_id for update;
  if v_status is distinct from 'em_analise' then
    raise exception 'Não há termo aguardando conferência.';
  end if;

  if p_approve then
    if p_image_consent and v_signed is not null and not (coalesce(v_image, false) and coalesce(v_face, false)) then
      raise exception 'O responsável não autorizou uso de imagem e reconhecimento facial no termo assinado.';
    end if;
    update public.student_guardian_consents
       set status = 'enviado', reviewed_at = now(), reviewed_by = (select auth.uid()),
           rejected_reason = null, rejected_at = null, updated_at = now()
     where student_id = p_student_id;
    update public.students
       set image_consent_at = case when p_image_consent then coalesce(image_consent_at, now()) else null end,
           -- A autorização do responsável vale como o aceite da conta do aluno menor.
           account_consent_at = case
             when p_image_consent and profile_id is not null then coalesce(account_consent_at, now())
             else account_consent_at
           end
     where id = p_student_id;
    return null;
  end if;

  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'Diga ao aluno o que corrigir no termo.';
  end if;
  update public.student_guardian_consents
     set status = 'pendente', file_path = null, uploaded_at = null, uploaded_by = null,
         reviewed_at = now(), reviewed_by = (select auth.uid()),
         rejected_reason = left(trim(p_reason), 500), rejected_at = now(), updated_at = now()
   where student_id = p_student_id;
  return v_path;
end $$;

revoke execute on function public.review_guardian_consent(uuid, boolean, boolean, text) from public, anon;
grant execute on function public.review_guardian_consent(uuid, boolean, boolean, text) to authenticated;

-- Quem já teve o termo aprovado com uso de imagem e ainda está parado na tela de aceite.
update public.students s
   set account_consent_at = s.image_consent_at
 where s.profile_id is not null
   and s.account_consent_at is null
   and s.image_consent_at is not null
   and exists (select 1 from public.student_guardian_consents c where c.student_id = s.id and c.status = 'enviado');
