import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const joinOrganizationSchema = z.object({
  organizationId: z.string().uuid(),
  roleCodes: z
    .array(z.enum(["parent_guardian", "teacher", "tutor", "org_admin"]))
    .min(1, "Select at least one role"),
});

/**
 * Multi-step: creates the organization membership and the role assignments
 * together. RLS still applies — the middleware client acts as the caller.
 */
export const joinOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => joinOrganizationSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    const { error: membershipError } = await supabase
      .from("organization_memberships")
      .upsert(
        { organization_id: data.organizationId, user_id: userId, status: "active", created_by: userId },
        { onConflict: "user_id,organization_id" },
      );
    if (membershipError) throw new Error(membershipError.message);

    const { data: roles, error: rolesError } = await supabase
      .from("roles")
      .select("id, code")
      .in("code", data.roleCodes);
    if (rolesError) throw new Error(rolesError.message);

    const rows = (roles ?? []).map((role) => ({
      organization_id: data.organizationId,
      user_id: userId,
      role_id: role.id,
      status: "active" as const,
      created_by: userId,
    }));

    if (rows.length > 0) {
      const { error: userRolesError } = await supabase
        .from("user_roles")
        .upsert(rows, { onConflict: "user_id,organization_id,role_id" });
      if (userRolesError) throw new Error(userRolesError.message);
    }

    await supabase.from("audit_logs").insert({
      actor_user_id: userId,
      organization_id: data.organizationId,
      action: "organization.joined",
      entity_type: "organization_memberships",
      after_state: { roles: data.roleCodes },
    });

    return { ok: true };
  });

/**
 * Onboarding-only lookup: a brand new user has no membership yet, so RLS hides
 * every organization from them. Reads a minimal, non-sensitive projection with
 * elevated access after confirming the caller is authenticated.
 */
export const listJoinableOrganizations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async () => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("organizations")
      .select("id, name, tenant_type")
      .order("created_at")
      .limit(25);
    if (error) throw new Error(error.message);
    return data ?? [];
  });
