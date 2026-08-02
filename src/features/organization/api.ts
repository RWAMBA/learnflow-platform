import { supabase } from "@/integrations/supabase/client";

export const organizationKeys = {
  detail: (organizationId: string) => ["organization", organizationId] as const,
  members: (organizationId: string) => ["organization", "members", organizationId] as const,
  roles: () => ["roles", "all"] as const,
  plans: () => ["plans", "active"] as const,
  usage: (organizationId: string) => ["organization", "usage", organizationId] as const,
};

export async function getOrganization(organizationId: string) {
  const { data, error } = await supabase
    .from("organizations")
    .select(
      "id, name, tenant_type, default_currency, default_locale, timezone, open_enrollment, younger_student_independent_login, created_at",
    )
    .eq("id", organizationId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listOrganizationMembers(organizationId: string) {
  const { data, error } = await supabase
    .from("user_roles")
    .select(
      "id, user_id, status, created_at, role:roles(id, code, name), profile:profiles!user_roles_user_id_fkey(full_name)",
    )
    .eq("organization_id", organizationId)
    .order("created_at");
  if (error) throw error;
  return data ?? [];
}

export async function listRoles() {
  const { data, error } = await supabase.from("roles").select("id, code, name").order("name");
  if (error) throw error;
  return data ?? [];
}

export async function listActivePlans() {
  const { data, error } = await supabase
    .from("plans")
    .select("id, code, name, entitlements, price_amount, price_currency, eligible_tenant_types")
    .eq("is_active", true)
    .order("price_amount");
  if (error) throw error;
  return data ?? [];
}

/** Seat and content usage counters shown on the billing page. */
export async function getOrganizationUsage(organizationId: string) {
  const [members, students, lessons] = await Promise.all([
    supabase
      .from("user_roles")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("status", "active"),
    supabase
      .from("students")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId),
    supabase
      .from("lessons")
      .select("id", { count: "exact", head: true })
      .eq("authoring_organization_id", organizationId),
  ]);
  for (const result of [members, students, lessons]) if (result.error) throw result.error;
  return {
    members: members.count ?? 0,
    students: students.count ?? 0,
    lessons: lessons.count ?? 0,
  };
}
