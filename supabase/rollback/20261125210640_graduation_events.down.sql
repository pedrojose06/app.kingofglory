-- Desfaz 20261125210640_graduation_events. As graduações já aprovadas continuam em student_graduations.

-- dispatch_attendance_reminders volta à versão de student_approval_notify.
create or replace function public.dispatch_attendance_reminders()
returns void
language plpgsql security definer
set search_path = ''
as $$
begin
  if not exists (
    select 1 from public.attendance_reminders r
    where public.attendance_reminder_is_due(r.remind_at, r.last_sent_on)
  ) and not exists (
    select 1 from public.lesson_plan_reminders r
    where public.attendance_reminder_is_due(r.remind_at, r.last_sent_on)
  ) and not exists (
    select 1 from public.lesson_plan_shares s where s.review_notify_pending
  ) and not exists (
    select 1 from public.student_class_reminder_due_profiles()
  ) and not exists (
    select 1 from public.student_signup_requests r where r.approval_notify_pending
  ) then
    return;
  end if;

  perform public.wake_push_reminders();
end $$;
revoke execute on function public.dispatch_attendance_reminders() from public, anon, authenticated;

drop function if exists public.claim_graduation_notifications();
drop function if exists public.my_graduation_candidates();
drop function if exists public.graduation_event_candidates(uuid);
drop function if exists public.dismiss_graduation_candidate(uuid);
drop function if exists public.decide_graduation_candidate(uuid, boolean, uuid);
drop function if exists public.propose_graduation_candidates(uuid, jsonb);
drop function if exists public.graduation_student_search(uuid, text);
drop function if exists public.graduation_face_match(uuid, jsonb);

drop policy if exists graduation_photos_obj_select on storage.objects;
drop policy if exists graduation_photos_obj_insert on storage.objects;
drop policy if exists graduation_photos_obj_delete on storage.objects;
-- O bucket só some se estiver vazio (apague as fotos pelo painel do Storage antes).
delete from storage.buckets where id = 'graduation-photos'
  and not exists (select 1 from storage.objects o where o.bucket_id = 'graduation-photos');

drop table if exists public.graduation_candidates;
drop table if exists public.graduation_event_photos;
drop table if exists public.graduation_events;

drop function if exists public.can_view_graduation_photo(text);
drop function if exists public.student_rank_before(uuid, date);
drop function if exists public.graduation_event_gym(uuid);
