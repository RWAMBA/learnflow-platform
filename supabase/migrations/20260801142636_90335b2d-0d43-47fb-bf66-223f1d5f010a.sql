CREATE OR REPLACE FUNCTION app_private.is_open_enrollment(_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app_private
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organizations o
    WHERE o.id = _organization_id AND o.open_enrollment
  );
$$;

REVOKE EXECUTE ON FUNCTION app_private.is_open_enrollment(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION app_private.is_open_enrollment(uuid) TO authenticated, service_role;

DROP POLICY IF EXISTS membership_self_join ON public.organization_memberships;
CREATE POLICY membership_self_join
ON public.organization_memberships
FOR INSERT TO authenticated
WITH CHECK (
  app_private.has_org_role(organization_id, 'org_admin')
  OR app_private.is_platform_admin()
  OR (user_id = auth.uid() AND app_private.is_open_enrollment(organization_id))
);

DROP POLICY IF EXISTS membership_self_update ON public.organization_memberships;
CREATE POLICY membership_self_update
ON public.organization_memberships
FOR UPDATE TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());
