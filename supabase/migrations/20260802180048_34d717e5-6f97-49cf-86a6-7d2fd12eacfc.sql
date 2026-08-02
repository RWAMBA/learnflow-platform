create or replace function app_private.can_view_student(p_student_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select app_private.is_platform_admin()
      or exists (
        select 1 from public.students s
        where s.id = p_student_id
          and app_private.has_org_role(s.organization_id, 'org_admin')
      )
      or exists (
        select 1 from public.students s
        where s.id = p_student_id and s.created_by = auth.uid()
      )
      or exists (
        select 1 from public.students s
        join public.user_roles ur on ur.id = s.user_role_id
        where s.id = p_student_id and ur.user_id = auth.uid() and ur.status = 'active'
      )
      or exists (
        select 1 from public.parent_student_relationships r
        where r.student_id = p_student_id and r.parent_id = auth.uid() and r.status = 'active'
      )
      or exists (
        select 1 from public.teacher_student_relationships r
        where r.student_id = p_student_id and r.teacher_id = auth.uid() and r.status = 'active'
      )
      or exists (
        select 1 from public.tutor_student_relationships r
        where r.student_id = p_student_id and r.tutor_id = auth.uid() and r.status = 'active'
      );
$$;