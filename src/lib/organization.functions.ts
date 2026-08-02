import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  grantRoleSchema,
  memberRoleStatusSchema,
  organizationSettingsSchema,
} from "./organization.schemas";

export const updateOrganizationSettings = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => organizationSettingsSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("organizations")
      .update({
        name: data.name,
        timezone: data.timezone,
        default_currency: data.defaultCurrency,
        default_locale: data.defaultLocale,
        open_enrollment: data.openEnrollment,
        younger_student_independent_login: data.youngerStudentIndependentLogin,
      })
      .eq("id", data.organizationId);
    if (error) throw new Error(error.message);

    await supabase.from("audit_logs").insert({
      actor_user_id: userId,
      organization_id: data.organizationId,
      action: "organization.settings_updated",
      entity_type: "organizations",
      entity_id: data.organizationId,
      after_state: {
        name: data.name,
        timezone: data.timezone,
        open_enrollment: data.openEnrollment,
      },
    });

    return { ok: true };
  });

export const setMemberRoleStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => memberRoleStatusSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase
      .from("user_roles")
      .update({ status: data.status })
      .eq("id", data.userRoleId)
      .eq("organization_id", data.organizationId);
    if (error) throw new Error(error.message);

    await supabase.from("audit_logs").insert({
      actor_user_id: userId,
      organization_id: data.organizationId,
      action: "organization.member_status_changed",
      entity_type: "user_roles",
      entity_id: data.userRoleId,
      after_state: { status: data.status },
    });

    return { ok: true };
  });

export const grantOrganizationRole = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => grantRoleSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { error } = await supabase.from("user_roles").insert({
      organization_id: data.organizationId,
      user_id: data.userId,
      role_id: data.roleId,
      status: "active",
      created_by: userId,
    });
    if (error) throw new Error(error.message);

    await supabase.from("audit_logs").insert({
      actor_user_id: userId,
      organization_id: data.organizationId,
      action: "organization.role_granted",
      entity_type: "user_roles",
      entity_id: data.userId,
      after_state: { role_id: data.roleId },
    });

    return { ok: true };
  });
