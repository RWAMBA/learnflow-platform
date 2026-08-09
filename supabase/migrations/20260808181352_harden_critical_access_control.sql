BEGIN;

-- Critical access-control remediation
--
-- SEC-001: Prevent arbitrary self-assignment of privileged organization roles.
-- SEC-002: Prevent users from modifying/reactivating their own memberships.
-- SEC-003: Ensure organization roles are authoritative only while the
--          corresponding organization membership is active.

-- ---------------------------------------------------------------------------
-- 1. Role helpers must require BOTH:
--      - an active user_role
--      - an active organization membership
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION app_private.has_org_role(
  p_org_id uuid,
  p_role_code text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles ur
    JOIN public.roles r
      ON r.id = ur.role_id
    JOIN public.organization_memberships om
      ON om.user_id = ur.user_id
     AND om.organization_id = ur.organization_id
    WHERE ur.user_id = auth.uid()
      AND ur.organization_id = p_org_id
      AND ur.status = 'active'
      AND om.status = 'active'
      AND r.code = p_role_code
  );
$$;


CREATE OR REPLACE FUNCTION app_private.auth_user_role_ids(
  p_role_code text DEFAULT NULL
)
RETURNS SETOF uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT ur.id
  FROM public.user_roles ur
  JOIN public.roles r
    ON r.id = ur.role_id
  JOIN public.organization_memberships om
    ON om.user_id = ur.user_id
   AND om.organization_id = ur.organization_id
  WHERE ur.user_id = auth.uid()
    AND ur.status = 'active'
    AND om.status = 'active'
    AND (p_role_code IS NULL OR r.code = p_role_code);
$$;


-- ---------------------------------------------------------------------------
-- 2. Self-service organization joining
--
-- A caller may create ONLY their own ACTIVE membership in an
-- open-enrollment organization.
--
-- Organization administrators and platform administrators retain their
-- controlled membership-management authority.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS membership_self_join
ON public.organization_memberships;

CREATE POLICY membership_self_join
ON public.organization_memberships
FOR INSERT
TO authenticated
WITH CHECK (
  app_private.has_org_role(organization_id, 'org_admin')
  OR app_private.is_platform_admin()
  OR (
    user_id = auth.uid()
    AND status = 'active'
    AND created_by = auth.uid()
    AND (updated_by IS NULL OR updated_by = auth.uid())
    AND app_private.is_open_enrollment(organization_id)
  )
);


-- ---------------------------------------------------------------------------
-- 3. Remove self-service membership UPDATE entirely.
--
-- Existing membership_admin_update remains responsible for controlled
-- organization-admin/platform-admin updates.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS membership_self_update
ON public.organization_memberships;


-- ---------------------------------------------------------------------------
-- 4. Self-service role assignment
--
-- A normal user may self-assign ONLY parent_guardian and only when:
--   - assigning the role to themselves
--   - their organization membership is active
--   - the organization is open enrollment
--   - the role row itself is active
--
-- teacher, tutor and org_admin must be granted by an organization
-- administrator or platform administrator.
-- ---------------------------------------------------------------------------

DROP POLICY IF EXISTS user_role_insert
ON public.user_roles;

CREATE POLICY user_role_insert
ON public.user_roles
FOR INSERT
TO authenticated
WITH CHECK (
  app_private.is_platform_admin()
  OR app_private.has_org_role(organization_id, 'org_admin')
  OR (
    user_id = auth.uid()
    AND status = 'active'
    AND created_by = auth.uid()
    AND (updated_by IS NULL OR updated_by = auth.uid())
    AND app_private.is_open_enrollment(organization_id)
    AND organization_id IN (
      SELECT app_private.auth_organization_ids()
    )
    AND EXISTS (
      SELECT 1
      FROM public.roles r
      WHERE r.id = role_id
        AND r.code = 'parent_guardian'
    )
  )
);

COMMIT;
