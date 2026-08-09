import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const joinOrganizationSchema = z
  .object({
    organizationId: z.string().uuid(),
  })
  .strict();

/**
 * Multi-step: creates the organization membership and the role assignments
 * together. RLS still applies — the middleware client acts as the caller.
 */
export const joinOrganization = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => joinOrganizationSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Never use an upsert here. An existing suspended/ended membership
    // must not be reactivated by repeating onboarding.
    const { data: existingMembership, error: membershipLookupError } = await supabase
      .from("organization_memberships")
      .select("id, status")
      .eq("organization_id", data.organizationId)
      .eq("user_id", userId)
      .maybeSingle();

    if (membershipLookupError) {
      throw new Error(membershipLookupError.message);
    }

    if (existingMembership && existingMembership.status !== "active") {
      throw new Error("Your organization membership requires administrator review.");
    }

    if (!existingMembership) {
      const { error: membershipError } = await supabase.from("organization_memberships").insert({
        organization_id: data.organizationId,
        user_id: userId,
        status: "active",
        created_by: userId,
      });

      if (membershipError) {
        throw new Error(membershipError.message);
      }
    }

    // Self-service onboarding grants exactly one role.
    // Privileged roles must be granted through an authorized admin flow.
    const { data: parentRole, error: parentRoleError } = await supabase
      .from("roles")
      .select("id")
      .eq("code", "parent_guardian")
      .single();

    if (parentRoleError) {
      throw new Error(parentRoleError.message);
    }

    const { data: existingRole, error: roleLookupError } = await supabase
      .from("user_roles")
      .select("id, status")
      .eq("organization_id", data.organizationId)
      .eq("user_id", userId)
      .eq("role_id", parentRole.id)
      .maybeSingle();

    if (roleLookupError) {
      throw new Error(roleLookupError.message);
    }

    if (existingRole && existingRole.status !== "active") {
      throw new Error("Your organization role requires administrator review.");
    }

    if (!existingRole) {
      const { error: roleInsertError } = await supabase.from("user_roles").insert({
        organization_id: data.organizationId,
        user_id: userId,
        role_id: parentRole.id,
        status: "active",
        created_by: userId,
      });

      if (roleInsertError) {
        throw new Error(roleInsertError.message);
      }
    }

    await supabase.from("audit_logs").insert({
      actor_user_id: userId,
      organization_id: data.organizationId,
      action: "organization.joined",
      entity_type: "organization_memberships",
      after_state: { roles: ["parent_guardian"] },
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
    const { assertSupabaseEnv } = await import("./env-preflight.server");
    assertSupabaseEnv(["admin"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("organizations")
      .select("id, name, tenant_type")
      .eq("open_enrollment", true)
      .order("created_at")
      .limit(25);
    if (error) throw new Error(error.message);
    return data ?? [];
  });
