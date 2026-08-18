/**
 * Phase 10 Stage 1A — server-side rights and provenance writes.
 *
 * Every helper runs with the caller's Supabase session, so the Platform
 * Administrator RLS policies on the rights tables remain the authoritative
 * boundary. The explicit platform-admin assertion below is a fail-closed
 * pre-check, not a substitute for those policies.
 */
import type { z } from "zod";
import type {
  importBatchSchema,
  levelAvailabilitySchema,
  rightsGrantSchema,
  sourceArtifactSchema,
  sourceLinkSchema,
  stageAvailabilitySchema,
  versionGovernanceSchema,
} from "./curriculum-rights.schemas";

type Ctx = { supabase: any; userId: string };

/** Fail-closed pre-check mirroring the database policies. */
export async function assertPlatformAdmin(context: Ctx) {
  const { data, error } = await context.supabase
    .from("platform_admins")
    .select("id")
    .eq("user_id", context.userId)
    .maybeSingle();
  if (error) throw new Error("Unable to verify platform administrator authorization");
  if (!data) throw new Error("Only platform administrators may manage curriculum rights");
}

const nullable = (value: string | null | undefined) => (value?.length ? value : null);

export async function upsertSourceArtifact(
  context: Ctx,
  input: z.infer<typeof sourceArtifactSchema>,
) {
  await assertPlatformAdmin(context);
  const row = {
    rights_holder: input.rightsHolder,
    source_title: input.sourceTitle,
    source_type: input.sourceType,
    authoritative_url: nullable(input.authoritativeUrl),
    document_date: nullable(input.documentDate),
    jurisdiction: nullable(input.jurisdiction),
    acquisition_method: input.acquisitionMethod,
    edition: nullable(input.edition),
    checksum: nullable(input.checksum),
    original_artifact_path: nullable(input.originalArtifactPath),
    verification_status: input.verificationStatus,
    notes: nullable(input.notes),
    created_by: context.userId,
  };
  const query = input.id
    ? context.supabase.from("source_artifacts").update(row).eq("id", input.id).select("id").single()
    : context.supabase.from("source_artifacts").insert(row).select("id").single();
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return { id: data.id as string };
}

export async function upsertRightsGrant(context: Ctx, input: z.infer<typeof rightsGrantSchema>) {
  await assertPlatformAdmin(context);
  const row = {
    source_artifact_id: input.sourceArtifactId,
    grant_type: input.grantType,
    grant_reference: nullable(input.grantReference),
    evidence_storage_path: nullable(input.evidenceStoragePath),
    effective_date: nullable(input.effectiveDate),
    expiry_date: nullable(input.expiryDate),
    territory: nullable(input.territory),
    attribution_text: nullable(input.attributionText),
    restrictions: nullable(input.restrictions),
    // A rights review is always attributed to the acting administrator and
    // timestamped by the server — never supplied by the client.
    reviewer_id: input.markReviewed ? context.userId : null,
    reviewed_at: input.markReviewed ? new Date().toISOString() : null,
    permits_commercial_use: input.permitsCommercialUse,
    permits_storage: input.permitsStorage,
    permits_transformation: input.permitsTransformation,
    permits_authenticated_display: input.permitsAuthenticatedDisplay,
    permits_public_display: input.permitsPublicDisplay,
    permits_download: input.permitsDownload,
    permits_translation: input.permitsTranslation,
    permits_derivative_works: input.permitsDerivativeWorks,
    permits_sublicensing: input.permitsSublicensing,
  };
  const query = input.id
    ? context.supabase.from("rights_grants").update(row).eq("id", input.id).select("id").single()
    : context.supabase.from("rights_grants").insert(row).select("id").single();
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return { id: data.id as string };
}

export async function createSourceLink(context: Ctx, input: z.infer<typeof sourceLinkSchema>) {
  await assertPlatformAdmin(context);
  const { error } = await context.supabase.from("source_artifact_links").insert({
    source_artifact_id: input.sourceArtifactId,
    entity_type: input.entityType,
    entity_id: input.entityId,
    note: nullable(input.note),
  });
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function removeSourceLink(context: Ctx, id: string) {
  await assertPlatformAdmin(context);
  const { error } = await context.supabase.from("source_artifact_links").delete().eq("id", id);
  if (error) throw new Error(error.message);
  return { ok: true };
}

/**
 * Records a rights / readiness / activation decision. The database refuses
 * `authorized` without a qualifying reviewed grant and refuses `active`
 * without authorized rights and complete content, so an invalid combination
 * surfaces as an error rather than a silent downgrade.
 */
export async function setVersionGovernance(
  context: Ctx,
  input: z.infer<typeof versionGovernanceSchema>,
) {
  await assertPlatformAdmin(context);
  const reviewed = input.rightsStatus === "authorized";
  const { error } = await context.supabase
    .from("curriculum_versions")
    .update({
      content_readiness: input.contentReadiness,
      rights_status: input.rightsStatus,
      activation_status: input.activationStatus,
      availability_note: nullable(input.availabilityNote),
      rights_reviewed_at: reviewed ? new Date().toISOString() : null,
      rights_reviewed_by: reviewed ? context.userId : null,
    })
    .eq("id", input.versionId);
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function setStageAvailability(
  context: Ctx,
  input: z.infer<typeof stageAvailabilitySchema>,
) {
  await assertPlatformAdmin(context);
  const { error } = await context.supabase
    .from("education_stages")
    .update({
      is_available: input.isAvailable,
      unavailable_reason: input.isAvailable ? null : nullable(input.unavailableReason),
    })
    .eq("id", input.stageId);
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function setLevelAvailability(
  context: Ctx,
  input: z.infer<typeof levelAvailabilitySchema>,
) {
  await assertPlatformAdmin(context);
  const { error } = await context.supabase
    .from("grades")
    .update({
      is_available: input.isAvailable,
      unavailable_reason: input.isAvailable ? null : nullable(input.unavailableReason),
    })
    .eq("id", input.levelId);
  if (error) throw new Error(error.message);
  return { ok: true };
}

export async function createImportBatch(context: Ctx, input: z.infer<typeof importBatchSchema>) {
  await assertPlatformAdmin(context);
  const { data, error } = await context.supabase
    .from("curriculum_import_batches")
    .insert({
      batch_reference: input.batchReference,
      source_artifact_id: input.sourceArtifactId ?? null,
      source_package: nullable(input.sourcePackage),
      imported_by: context.userId,
      started_at: new Date().toISOString(),
      dry_run: input.dryRun,
      record_counts: {},
      errors: [],
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);
  return { id: data.id as string };
}

/**
 * Short-lived signed URL for a private licence-evidence document. Only
 * Platform Administrators reach this path, and the bucket itself is private.
 */
export async function signRightsEvidence(context: Ctx, storagePath: string) {
  await assertPlatformAdmin(context);
  const { data, error } = await context.supabase.storage
    .from("rights-evidence")
    .createSignedUrl(storagePath, 300);
  if (error) throw new Error(error.message);
  return { url: data.signedUrl as string };
}
