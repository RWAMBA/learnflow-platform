DROP POLICY IF EXISTS conversation_participants_insert ON public.conversation_participants;

CREATE POLICY conversation_participants_insert ON public.conversation_participants
  FOR INSERT TO authenticated
  WITH CHECK (
    -- caller must belong to the conversation's organization
    EXISTS (
      SELECT 1 FROM public.conversations c
      WHERE c.id = conversation_participants.conversation_id
        AND c.organization_id IN (SELECT app_private.auth_organization_ids())
    )
    AND EXISTS (
      SELECT 1
      FROM public.user_roles target
      JOIN public.roles ro ON ro.id = target.role_id
      JOIN public.conversations c ON c.id = conversation_participants.conversation_id
      WHERE target.id = conversation_participants.user_role_id
        AND target.status = 'active'
        AND target.organization_id = c.organization_id
        AND (
          -- adding yourself
          target.user_id = auth.uid()
          -- org admin of the same organization
          OR ro.code = 'org_admin'
          -- someone with an active relationship in this organization
          OR EXISTS (
            SELECT 1 FROM public.parent_student_relationships r
            WHERE r.status = 'active' AND r.organization_id = c.organization_id
              AND (r.parent_id = target.user_id
                   OR r.student_id IN (SELECT s.id FROM public.students s WHERE s.user_role_id = target.id))
          )
          OR EXISTS (
            SELECT 1 FROM public.teacher_student_relationships r
            WHERE r.status = 'active' AND r.organization_id = c.organization_id
              AND (r.teacher_id = target.user_id
                   OR r.student_id IN (SELECT s.id FROM public.students s WHERE s.user_role_id = target.id))
          )
          OR EXISTS (
            SELECT 1 FROM public.tutor_student_relationships r
            WHERE r.status = 'active' AND r.organization_id = c.organization_id
              AND (r.tutor_id = target.user_id
                   OR r.student_id IN (SELECT s.id FROM public.students s WHERE s.user_role_id = target.id))
          )
        )
    )
  );