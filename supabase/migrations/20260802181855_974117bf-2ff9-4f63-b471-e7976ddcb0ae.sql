DROP POLICY IF EXISTS assignments_insert ON public.assignments;

CREATE POLICY assignments_insert ON public.assignments
FOR INSERT TO authenticated
WITH CHECK (
  created_by_user_role_id IN (SELECT app_private.auth_user_role_ids())
  AND (
    app_private.can_view_student(student_id)
    OR EXISTS (SELECT 1 FROM public.teacher_student_relationships r WHERE r.student_id = assignments.student_id AND r.status = 'active' AND r.teacher_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.tutor_student_relationships r WHERE r.student_id = assignments.student_id AND r.status = 'active' AND r.tutor_id = auth.uid())
    OR EXISTS (SELECT 1 FROM public.parent_student_relationships r WHERE r.student_id = assignments.student_id AND r.status = 'active' AND r.parent_id = auth.uid())
    OR app_private.has_org_role((SELECT s.organization_id FROM public.students s WHERE s.id = assignments.student_id), 'org_admin')
  )
);