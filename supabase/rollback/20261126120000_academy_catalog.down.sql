-- Desfaz 20261126120000_academy_catalog.

drop table if exists public.student_belts;
drop table if exists public.belt_ranks;
drop table if exists public.class_group_members;
drop table if exists public.class_groups;
drop table if exists public.modalities;
drop function if exists public.class_group_check();
drop table if exists public.student_details;
drop function if exists public.student_details_fill();

drop policy if exists graduations_delete_academy on public.student_graduations;
drop policy if exists graduations_update_academy on public.student_graduations;
drop policy if exists graduations_insert_academy on public.student_graduations;
drop policy if exists graduations_select_academy on public.student_graduations;
drop policy if exists students_update_academy on public.students;
drop policy if exists students_insert_academy on public.students;
drop policy if exists students_select_academy on public.students;

drop function if exists public.can_staff_student(uuid);
drop function if exists public.can_admin_student(uuid);
