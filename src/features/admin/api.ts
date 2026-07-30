import { supabase } from "@/integrations/supabase/client";

export const adminKeys = {
  tenants: () => ["admin", "tenants"] as const,
  auditLogs: (organizationId: string | null) => ["admin", "audit-logs", organizationId] as const,
  securityEvents: () => ["admin", "security-events"] as const,
};

export async function listTenants() {
  const { data, error } = await supabase
    .from("organizations")
    .select(
      "id, name, tenant_type, default_currency, timezone, created_at, subscription:organization_subscriptions(status, plan:plans(name))",
    )
    .order("created_at");
  if (error) throw error;
  return data;
}

export async function listAuditLogs(organizationId: string | null) {
  let query = supabase
    .from("audit_logs")
    .select("id, action, entity_type, entity_id, created_at, organization_id, actor_user_id")
    .order("created_at", { ascending: false })
    .limit(100);
  if (organizationId) query = query.eq("organization_id", organizationId);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function listSecurityEvents() {
  const { data, error } = await supabase
    .from("security_events")
    .select("id, event_type, severity, created_at, organization_id, details")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return data;
}
