import { z } from "zod";

/**
 * Documented allowlist for curriculum licence / rights evidence uploads.
 * MIME type, file extension and maximum size are all enforced again in the
 * database (app_private.validate_rights_evidence_document), so a client that
 * bypasses this schema still fails closed.
 */
export const EVIDENCE_MIME_ALLOWLIST = {
  "application/pdf": ["pdf"],
  "image/png": ["png"],
  "image/jpeg": ["jpg", "jpeg"],
  "text/plain": ["txt"],
} as const;

export type EvidenceMimeType = keyof typeof EVIDENCE_MIME_ALLOWLIST;

export const EVIDENCE_BUCKET = "curriculum-rights-evidence";
export const EVIDENCE_MAX_BYTES = 26_214_400; // 25 MiB
export const EVIDENCE_UPLOAD_URL_SECONDS = 300;
export const EVIDENCE_DOWNLOAD_URL_SECONDS = 120;

const uuid = z.string().uuid();

export const evidenceUploadTicketSchema = z
  .object({
    rightsGrantId: uuid.nullable().optional(),
    sourceArtifactId: uuid.nullable().optional(),
    filename: z
      .string()
      .trim()
      .min(1)
      .max(200)
      // No caller-controlled path may ever reach Storage.
      .refine((value) => !/[\\/]/.test(value) && !value.includes(".."), {
        message: "The filename must not contain a path",
      }),
    mimeType: z.enum(["application/pdf", "image/png", "image/jpeg", "text/plain"]),
    byteSize: z.number().int().positive().max(EVIDENCE_MAX_BYTES),
    supersedesId: uuid.nullable().optional(),
  })
  .refine((value) => Boolean(value.rightsGrantId || value.sourceArtifactId), {
    message: "Evidence must be attached to a rights grant or a source artifact",
  });

export const evidenceIdSchema = z.object({ evidenceId: uuid });

export const evidenceConfirmSchema = z.object({
  evidenceId: uuid,
  checksum: z.string().trim().max(200).nullable().optional(),
});

export const evidenceWithdrawSchema = z.object({
  evidenceId: uuid,
  reason: z.string().trim().min(3).max(500),
});

export const evidenceListSchema = z.object({
  rightsGrantId: uuid.nullable().optional(),
  sourceArtifactId: uuid.nullable().optional(),
});

/** Returns the single canonical extension used for a permitted MIME type. */
export function canonicalExtension(mimeType: EvidenceMimeType): string {
  return EVIDENCE_MIME_ALLOWLIST[mimeType][0];
}
