import { z } from "zod";

const uuid = z.string().uuid();
const optionalText = (max: number) => z.string().trim().max(max).nullable().optional();

export const sourceArtifactSchema = z.object({
  id: uuid.optional(),
  rightsHolder: z.string().trim().min(2).max(200),
  sourceTitle: z.string().trim().min(2).max(300),
  sourceType: z.enum([
    "official_document",
    "publisher_material",
    "open_licensed",
    "learnflow_original",
    "other",
  ]),
  authoritativeUrl: z.string().trim().url().max(2000).nullable().optional(),
  documentDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  jurisdiction: optionalText(120),
  acquisitionMethod: z.enum([
    "unknown",
    "official_download",
    "licensed_supply",
    "direct_grant",
    "public_domain",
    "learnflow_authored",
  ]),
  edition: optionalText(120),
  checksum: optionalText(200),
  originalArtifactPath: optionalText(500),
  verificationStatus: z.enum(["unverified", "in_review", "verified", "rejected"]),
  notes: optionalText(2000),
});

export const rightsGrantSchema = z.object({
  id: uuid.optional(),
  sourceArtifactId: uuid,
  grantType: z.enum([
    "unknown",
    "open_licence",
    "commercial_licence",
    "written_permission",
    "public_domain",
    "learnflow_owned",
  ]),
  grantReference: optionalText(200),
  evidenceStoragePath: optionalText(500),
  effectiveDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  expiryDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .nullable()
    .optional(),
  territory: optionalText(200),
  attributionText: optionalText(500),
  restrictions: optionalText(2000),
  markReviewed: z.boolean().default(false),
  permitsCommercialUse: z.boolean(),
  permitsStorage: z.boolean(),
  permitsTransformation: z.boolean(),
  permitsAuthenticatedDisplay: z.boolean(),
  permitsPublicDisplay: z.boolean(),
  permitsDownload: z.boolean(),
  permitsTranslation: z.boolean(),
  permitsDerivativeWorks: z.boolean(),
  permitsSublicensing: z.boolean(),
});

export const sourceLinkSchema = z.object({
  sourceArtifactId: uuid,
  entityType: z.enum([
    "curriculum_version",
    "education_stage",
    "academic_level",
    "track",
    "subject",
    "curriculum_node",
    "learning_objective",
    "lesson",
    "learning_resource",
  ]),
  entityId: uuid,
  note: optionalText(500),
});

export const versionGovernanceSchema = z.object({
  versionId: uuid,
  contentReadiness: z.enum(["none", "partial", "complete"]),
  rightsStatus: z.enum(["unknown", "review_required", "authorized", "restricted", "expired"]),
  activationStatus: z.enum(["inactive", "internal_preview", "active"]),
  availabilityNote: optionalText(300),
});

export const stageAvailabilitySchema = z.object({
  stageId: uuid,
  isAvailable: z.boolean(),
  unavailableReason: optionalText(300),
});

export const levelAvailabilitySchema = z.object({
  levelId: uuid,
  isAvailable: z.boolean(),
  unavailableReason: optionalText(300),
});

export const importBatchSchema = z.object({
  batchReference: z.string().trim().min(2).max(120),
  sourceArtifactId: uuid.nullable().optional(),
  sourcePackage: optionalText(300),
  dryRun: z.boolean().default(true),
});

export const idSchema = z.object({ id: uuid });
