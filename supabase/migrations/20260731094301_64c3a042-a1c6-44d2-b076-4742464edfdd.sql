-- 1. Fix stale references and scope student visibility to real relationships
CREATE OR REPLACE FUNCTION app_private.can_view_student(p_student_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  select app_private.is_platform_admin()
      or exists (
        select 1 from public.students s
        where s.id = p_student_id
          and app_private.has_org_role(s.organization_id, 'org_admin')
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
$function$;

CREATE OR REPLACE FUNCTION app_private.can_manage_student(p_student_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  select app_private.is_platform_admin()
      or exists (
        select 1 from public.students s
        where s.id = p_student_id
          and app_private.has_org_role(s.organization_id, 'org_admin')
      )
      or exists (
        select 1 from public.parent_student_relationships r
        where r.student_id = p_student_id and r.parent_id = auth.uid()
          and r.status = 'active' and r.permission_level in ('full', 'manage')
      )
      or exists (
        select 1 from public.students s
        where s.id = p_student_id and s.created_by = auth.uid()
      );
$function$;

DROP POLICY IF EXISTS students_tenant_isolation ON public.students;
CREATE POLICY students_tenant_isolation ON public.students
  FOR SELECT TO authenticated
  USING (app_private.can_view_student(id));

-- 2. Self-join only into open-enrollment organizations
ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS open_enrollment boolean NOT NULL DEFAULT false;

UPDATE public.organizations SET open_enrollment = true WHERE tenant_type = 'family';

DROP POLICY IF EXISTS membership_self_join ON public.organization_memberships;
CREATE POLICY membership_self_join ON public.organization_memberships
  FOR INSERT TO authenticated
  WITH CHECK (
    app_private.has_org_role(organization_id, 'org_admin')
    OR app_private.is_platform_admin()
    OR (
      user_id = auth.uid()
      AND EXISTS (
        SELECT 1 FROM public.organizations o
        WHERE o.id = organization_id AND o.open_enrollment
      )
    )
  );

-- 3. Conversation participants: org_admin must match the conversation's organization
DROP POLICY IF EXISTS conversation_participants_insert ON public.conversation_participants;
CREATE POLICY conversation_participants_insert ON public.conversation_participants
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.parent_student_relationships r
      WHERE r.status = 'active'
        AND (r.parent_id = (SELECT ur.user_id FROM public.user_roles ur WHERE ur.id = user_role_id)
             OR r.student_id IN (SELECT s.id FROM public.students s WHERE s.user_role_id = user_role_id))
    )
    OR EXISTS (
      SELECT 1 FROM public.teacher_student_relationships r
      WHERE r.status = 'active'
        AND (r.teacher_id = (SELECT ur.user_id FROM public.user_roles ur WHERE ur.id = user_role_id)
             OR r.student_id IN (SELECT s.id FROM public.students s WHERE s.user_role_id = user_role_id))
    )
    OR EXISTS (
      SELECT 1 FROM public.tutor_student_relationships r
      WHERE r.status = 'active'
        AND (r.tutor_id = (SELECT ur.user_id FROM public.user_roles ur WHERE ur.id = user_role_id)
             OR r.student_id IN (SELECT s.id FROM public.students s WHERE s.user_role_id = user_role_id))
    )
    OR EXISTS (
      SELECT 1
      FROM public.user_roles ur
      JOIN public.roles ro ON ro.id = ur.role_id
      JOIN public.conversations c ON c.id = conversation_id
      WHERE ur.id = user_role_id
        AND ro.code = 'org_admin'
        AND ur.status = 'active'
        AND ur.organization_id = c.organization_id
    )
  );

-- 4. Audit logs must be tagged with an organization the actor belongs to
DROP POLICY IF EXISTS audit_logs_insert ON public.audit_logs;
CREATE POLICY audit_logs_insert ON public.audit_logs
  FOR INSERT TO authenticated
  WITH CHECK (
    actor_user_id = auth.uid()
    AND (
      organization_id IS NULL
      OR organization_id IN (SELECT app_private.auth_organization_ids())
    )
  );