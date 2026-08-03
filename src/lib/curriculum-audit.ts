/**
 * Shared audit-log writer for curriculum server functions.
 * Kept out of the *.functions.ts modules so those stay thin wrappers.
 */
type AuditSupabase = {
  from: (table: string) => { insert: (values: unknown) => Promise<{ error: unknown }> };
};

export async function writeCurriculumAudit(
  context: { supabase: unknown; userId: string },
  input: {
    organizationId: string | null;
    action: string;
    entityType: string;
    entityId: string;
    afterState?: unknown;
  },
) {
  const supabase = context.supabase as AuditSupabase;
  await supabase.from("audit_logs").insert({
    actor_user_id: context.userId,
    organization_id: input.organizationId,
    action: input.action,
    entity_type: input.entityType,
    entity_id: input.entityId,
    after_state: input.afterState ?? null,
  });
}
