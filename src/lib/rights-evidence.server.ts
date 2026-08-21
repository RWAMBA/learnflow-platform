/**
 * Phase 10 Stage 1 — server-mediated curriculum rights EVIDENCE handling.
 *
 * Authorization model (fail-closed, defence in depth):
 *   1. Every entry point runs behind requireSupabaseAuth.
 *   2. assertActivePlatformAdmin() re-checks ACTIVE platform administrator
 *      status against the database before any privileged work.
 *   3. Row reads/writes use the caller's session, so the platform-admin RLS
 *      policies remain the authoritative boundary.
 *   4. The service-role client is loaded lazily, inside the handler, only to
 *      mint short-lived signed Storage URLs. It never leaves the server and
 *      no caller-supplied object path is ever passed to it: the path is always
 *      resolved from a validated evidence-record identifier.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import type { z } from "zod";
import {
  EVIDENCE_BUCKET,
  EVIDENCE_DOWNLOAD_URL_SECONDS,
  EVIDENCE_MAX_BYTES,
  EVIDENCE_MIME_ALLOWLIST,
  EVIDENCE_UPLOAD_URL_SECONDS,
  canonicalExtension,
  type EvidenceMimeType,
  type evidenceConfirmSchema,
  type evidenceIdSchema,
  type evidenceListSchema,
  type evidenceUploadTicketSchema,
  type evidenceWithdrawSchema,
} from "./rights-evidence.schemas";

type Ctx = { supabase: SupabaseClient; userId: string };

const EVIDENCE_COLUMNS =
  "id, rights_grant_id, source_artifact_id, storage_bucket, storage_path, original_filename, mime_type, byte_size, checksum, status, supersedes_id, withdrawal_reason, uploaded_by, created_at, updated_at";

/** Fail-closed pre-check: the administrator must exist AND be active. */
export async function assertActivePlatformAdmin(context: Ctx) {
  const { data, error } = await context.supabase
    .from("platform_admins")
    .select("id, status")
    .eq("user_id", context.userId)
    .eq("status", "active")
    .maybeSingle();
  if (error) throw new Error("Unable to verify platform administrator authorization");
  if (!data) throw new Error("Only active platform administrators may manage rights evidence");
}

function randomHex(bytes: number) {
  const buffer = new Uint8Array(bytes);
  crypto.getRandomValues(buffer);
  return Array.from(buffer, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Non-enumerable, server-generated object key. Callers never choose a path. */
export function buildEvidenceObjectKey(mimeType: EvidenceMimeType) {
  return `rights-evidence/${crypto.randomUUID()}/${randomHex(16)}.${canonicalExtension(mimeType)}`;
}

function assertAllowlisted(mimeType: string, filename: string, byteSize: number) {
  const permitted = EVIDENCE_MIME_ALLOWLIST[mimeType as EvidenceMimeType];
  if (!permitted) throw new Error(`Evidence file type ${mimeType} is not permitted`);
  const extension = filename.split(".").pop()?.toLowerCase() ?? "";
  if (!permitted.includes(extension as never)) {
    throw new Error(`Evidence file extension .${extension} does not match ${mimeType}`);
  }
  if (byteSize <= 0 || byteSize > EVIDENCE_MAX_BYTES) {
    throw new Error("Evidence file exceeds the permitted size");
  }
}

async function adminClient() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin as unknown as SupabaseClient;
}

async function recordAudit(context: Ctx, evidenceId: string, action: string) {
  // Supplementary to the database audit trigger: records read-side events
  // (signed-URL issuance) that no row change would otherwise capture.
  await context.supabase.from("rights_audit_log").insert({
    entity_type: "rights_evidence_document",
    entity_id: evidenceId,
    action,
    actor_id: context.userId,
    new_state: { actor: context.userId, at: new Date().toISOString() },
  });
}

export async function createEvidenceUploadTicket(
  context: Ctx,
  input: z.infer<typeof evidenceUploadTicketSchema>,
) {
  await assertActivePlatformAdmin(context);
  assertAllowlisted(input.mimeType, input.filename, input.byteSize);

  const storagePath = buildEvidenceObjectKey(input.mimeType);

  const { data, error } = await context.supabase
    .from("rights_evidence_documents")
    .insert({
      rights_grant_id: input.rightsGrantId ?? null,
      source_artifact_id: input.sourceArtifactId ?? null,
      storage_bucket: EVIDENCE_BUCKET,
      storage_path: storagePath,
      original_filename: input.filename,
      mime_type: input.mimeType,
      byte_size: input.byteSize,
      status: "pending",
      supersedes_id: input.supersedesId ?? null,
      uploaded_by: context.userId,
    })
    .select("id")
    .single();
  if (error) throw new Error(error.message);

  const admin = await adminClient();
  const signed = await admin.storage.from(EVIDENCE_BUCKET).createSignedUploadUrl(storagePath);
  if (signed.error) throw new Error(signed.error.message);

  return {
    evidenceId: data.id as string,
    bucket: EVIDENCE_BUCKET,
    path: storagePath,
    token: signed.data.token,
    expiresInSeconds: EVIDENCE_UPLOAD_URL_SECONDS,
  };
}

export async function confirmEvidenceUpload(
  context: Ctx,
  input: z.infer<typeof evidenceConfirmSchema>,
) {
  await assertActivePlatformAdmin(context);
  const { data: row, error } = await context.supabase
    .from("rights_evidence_documents")
    .select("id, storage_path, status")
    .eq("id", input.evidenceId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) throw new Error("Evidence record not found");

  const admin = await adminClient();
  const folder = String(row.storage_path).split("/").slice(0, -1).join("/");
  const filename = String(row.storage_path).split("/").pop() ?? "";
  const listed = await admin.storage.from(EVIDENCE_BUCKET).list(folder, { search: filename });
  if (listed.error) throw new Error(listed.error.message);
  const object = (listed.data ?? []).find((entry) => entry.name === filename);
  if (!object) throw new Error("The evidence document was not stored — upload again");

  const { error: updateError } = await context.supabase
    .from("rights_evidence_documents")
    .update({ status: "stored", checksum: input.checksum ?? null })
    .eq("id", input.evidenceId);
  if (updateError) throw new Error(updateError.message);
  return { ok: true as const };
}

/**
 * Issues a short-lived signed URL for one validated evidence record. The path
 * comes from the database row, never from the caller.
 */
export async function createEvidenceDownloadUrl(
  context: Ctx,
  input: z.infer<typeof evidenceIdSchema>,
) {
  await assertActivePlatformAdmin(context);
  const { data: row, error } = await context.supabase
    .from("rights_evidence_documents")
    .select("id, storage_path, status, original_filename")
    .eq("id", input.evidenceId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!row) throw new Error("Evidence record not found");
  if (row.status === "withdrawn") throw new Error("This evidence document has been withdrawn");
  if (row.status === "pending") throw new Error("This evidence document was never stored");

  const admin = await adminClient();
  const signed = await admin.storage
    .from(EVIDENCE_BUCKET)
    .createSignedUrl(String(row.storage_path), EVIDENCE_DOWNLOAD_URL_SECONDS);
  if (signed.error) throw new Error(signed.error.message);

  await recordAudit(context, input.evidenceId, "evidence_signed_url_issued");

  return {
    url: signed.data.signedUrl,
    expiresInSeconds: EVIDENCE_DOWNLOAD_URL_SECONDS,
    filename: String(row.original_filename),
  };
}

export interface EvidenceDocumentView {
  id: string;
  rights_grant_id: string | null;
  source_artifact_id: string | null;
  storage_bucket: string;
  original_filename: string;
  mime_type: string;
  byte_size: number;
  checksum: string | null;
  status: string;
  supersedes_id: string | null;
  withdrawal_reason: string | null;
  uploaded_by: string;
  created_at: string;
  updated_at: string;
}

export async function listEvidenceDocuments(
  context: Ctx,
  input: z.infer<typeof evidenceListSchema>,
): Promise<EvidenceDocumentView[]> {
  await assertActivePlatformAdmin(context);
  let query = context.supabase
    .from("rights_evidence_documents")
    .select(EVIDENCE_COLUMNS)
    .order("created_at", { ascending: false })
    .limit(200);
  if (input.rightsGrantId) query = query.eq("rights_grant_id", input.rightsGrantId);
  if (input.sourceArtifactId) query = query.eq("source_artifact_id", input.sourceArtifactId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  // Storage paths are platform-internal; they never travel to the browser.
  return ((data ?? []) as Record<string, unknown>[]).map((row) => ({
    id: String(row.id),
    rights_grant_id: (row.rights_grant_id as string | null) ?? null,
    source_artifact_id: (row.source_artifact_id as string | null) ?? null,
    storage_bucket: String(row.storage_bucket),
    original_filename: String(row.original_filename),
    mime_type: String(row.mime_type),
    byte_size: Number(row.byte_size),
    checksum: (row.checksum as string | null) ?? null,
    status: String(row.status),
    supersedes_id: (row.supersedes_id as string | null) ?? null,
    withdrawal_reason: (row.withdrawal_reason as string | null) ?? null,
    uploaded_by: String(row.uploaded_by),
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  }));
}

export async function withdrawEvidenceDocument(
  context: Ctx,
  input: z.infer<typeof evidenceWithdrawSchema>,
) {
  await assertActivePlatformAdmin(context);
  const { error } = await context.supabase
    .from("rights_evidence_documents")
    .update({ status: "withdrawn", withdrawal_reason: input.reason })
    .eq("id", input.evidenceId);
  if (error) throw new Error(error.message);
  return { ok: true as const };
}
