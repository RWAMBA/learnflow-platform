import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  evidenceConfirmSchema,
  evidenceIdSchema,
  evidenceListSchema,
  evidenceUploadTicketSchema,
  evidenceWithdrawSchema,
} from "./rights-evidence.schemas";
import {
  confirmEvidenceUpload,
  createEvidenceDownloadUrl,
  createEvidenceUploadTicket,
  listEvidenceDocuments,
  withdrawEvidenceDocument,
} from "./rights-evidence.server";

export const requestEvidenceUploadTicket = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => evidenceUploadTicketSchema.parse(data))
  .handler(({ data, context }) => createEvidenceUploadTicket(context, data));

export const confirmEvidenceDocument = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => evidenceConfirmSchema.parse(data))
  .handler(({ data, context }) => confirmEvidenceUpload(context, data));

export const requestEvidenceDownloadUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => evidenceIdSchema.parse(data))
  .handler(({ data, context }) => createEvidenceDownloadUrl(context, data));

export const listRightsEvidence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => evidenceListSchema.parse(data))
  .handler(({ data, context }) => listEvidenceDocuments(context, data));

export const withdrawRightsEvidence = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => evidenceWithdrawSchema.parse(data))
  .handler(({ data, context }) => withdrawEvidenceDocument(context, data));
