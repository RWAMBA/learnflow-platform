import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  importBatchSchema,
  levelAvailabilitySchema,
  rightsGrantSchema,
  sourceArtifactSchema,
  sourceLinkSchema,
  stageAvailabilitySchema,
  versionGovernanceSchema,
} from "./curriculum-rights.schemas";
import {
  createImportBatch,
  createSourceLink,
  removeSourceLink,
  setLevelAvailability,
  setStageAvailability,
  setVersionGovernance,
  upsertRightsGrant,
  upsertSourceArtifact,
} from "./curriculum-rights.server";

export const saveSourceArtifact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => sourceArtifactSchema.parse(data))
  .handler(({ data, context }) => upsertSourceArtifact(context, data));

export const saveRightsGrant = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => rightsGrantSchema.parse(data))
  .handler(({ data, context }) => upsertRightsGrant(context, data));

export const linkSourceArtifact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => sourceLinkSchema.parse(data))
  .handler(({ data, context }) => createSourceLink(context, data));

export const unlinkSourceArtifact = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => z.object({ id: z.string().uuid() }).parse(data))
  .handler(({ data, context }) => removeSourceLink(context, data.id));

export const saveVersionGovernance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => versionGovernanceSchema.parse(data))
  .handler(({ data, context }) => setVersionGovernance(context, data));

export const saveStageAvailability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => stageAvailabilitySchema.parse(data))
  .handler(({ data, context }) => setStageAvailability(context, data));

export const saveLevelAvailability = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => levelAvailabilitySchema.parse(data))
  .handler(({ data, context }) => setLevelAvailability(context, data));

export const startImportBatch = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => importBatchSchema.parse(data))
  .handler(({ data, context }) => createImportBatch(context, data));
