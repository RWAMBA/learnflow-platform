import { supabase } from "@/integrations/supabase/client";

export const subscriptionKeys = {
  forOrganization: (organizationId: string) => ["subscription", organizationId] as const,
};

export async function getOrganizationSubscription(organizationId: string) {
  const { data, error } = await supabase
    .from("organization_subscriptions")
    .select(
      "id, status, started_at, ended_at, plan:plans(id, code, name, entitlements, price_amount, price_currency, eligible_tenant_types)",
    )
    .eq("organization_id", organizationId)
    .maybeSingle();
  if (error) throw error;
  return data;
}
