import { supabase } from "@/integrations/supabase/client";
import type { ActiveRole, RoleCode, TenantType, ViewerContext } from "./types";

/**
 * Thin data-access layer for the signed-in user's identity and role
 * assignments. RLS restricts every row returned here.
 */
export async function fetchViewerContext(userId: string): Promise<ViewerContext> {
  const [profileResult, rolesResult, platformAdminResult] = await Promise.all([
    supabase.from("profiles").select("id, full_name").eq("id", userId).maybeSingle(),
    supabase
      .from("user_roles")
      .select(
        "id, organization_id, status, role:roles(code, name), organization:organizations(id, name, tenant_type)",
      )
      .eq("user_id", userId)
      .eq("status", "active"),
    supabase.rpc("is_platform_admin"),
  ]);

  if (profileResult.error) throw profileResult.error;
  if (rolesResult.error) throw rolesResult.error;
  if (platformAdminResult.error) throw platformAdminResult.error;

  const roles: ActiveRole[] = (rolesResult.data ?? [])
    .filter((row) => row.role && row.organization)
    .map((row) => ({
      userRoleId: row.id,
      roleCode: row.role!.code as RoleCode,
      roleName: row.role!.name,
      organizationId: row.organization_id,
      organizationName: row.organization!.name,
      tenantType: row.organization!.tenant_type as TenantType,
    }));

  return {
    userId,
    fullName: profileResult.data?.full_name ?? "",
    isPlatformAdmin: Boolean(platformAdminResult.data),
    roles,
  };
}

export const viewerContextQueryKey = (userId: string) => ["viewer-context", userId] as const;
