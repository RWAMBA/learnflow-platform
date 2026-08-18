/**
 * Phase 10 Stage 1A — rights, provenance and availability read layer.
 *
 * Every query here runs through the browser Supabase client, so RLS is the
 * authoritative boundary: the provenance, rights-grant, traceability,
 * import-batch and rights-audit tables are Platform Administrator-only in the
 * database. The UI helpers below decide only what is worth rendering.
 */
import { supabase } from "@/integrations/supabase/client";

export const CONTENT_READINESS = ["none", "partial", "complete"] as const;
export type ContentReadiness = (typeof CONTENT_READINESS)[number];

export const RIGHTS_STATUSES = [
  "unknown",
  "review_required",
  "authorized",
  "restricted",
  "expired",
] as const;
export type RightsStatus = (typeof RIGHTS_STATUSES)[number];

export const ACTIVATION_STATUSES = ["inactive", "internal_preview", "active"] as const;
export type ActivationStatus = (typeof ACTIVATION_STATUSES)[number];

export const SOURCE_TYPES = [
  "official_document",
  "publisher_material",
  "open_licensed",
  "learnflow_original",
  "other",
] as const;
export type SourceType = (typeof SOURCE_TYPES)[number];

export const ACQUISITION_METHODS = [
  "unknown",
  "official_download",
  "licensed_supply",
  "direct_grant",
  "public_domain",
  "learnflow_authored",
] as const;
export type AcquisitionMethod = (typeof ACQUISITION_METHODS)[number];

export const GRANT_TYPES = [
  "unknown",
  "open_licence",
  "commercial_licence",
  "written_permission",
  "public_domain",
  "learnflow_owned",
] as const;
export type GrantType = (typeof GRANT_TYPES)[number];

export const LINKABLE_ENTITIES = [
  "curriculum_version",
  "education_stage",
  "academic_level",
  "track",
  "subject",
  "curriculum_node",
  "learning_objective",
  "lesson",
  "learning_resource",
] as const;
export type LinkableEntity = (typeof LINKABLE_ENTITIES)[number];

export const rightsKeys = {
  providers: () => ["rights", "providers"] as const,
  catalogue: () => ["rights", "catalogue"] as const,
  stages: (versionId: string | null) => ["rights", "stages", versionId] as const,
  levels: (curriculumId: string | null) => ["rights", "levels", curriculumId] as const,
  tracks: () => ["rights", "tracks"] as const,
  subjectGroups: () => ["rights", "subject-groups"] as const,
  sources: (term: string) => ["rights", "sources", term] as const,
  grants: (sourceId: string | null) => ["rights", "grants", sourceId] as const,
  links: (sourceId: string) => ["rights", "links", sourceId] as const,
  batches: () => ["rights", "batches"] as const,
  audit: (entityId: string | null) => ["rights", "audit", entityId] as const,
};

/* ------------------------------------------------------------- providers */

export async function listProviders() {
  const { data, error } = await supabase
    .from("curriculum_providers")
    .select("id, code, name, created_at")
    .order("name");
  if (error) throw error;
  return data ?? [];
}

/* ------------------------------------------------------- activation matrix */

export interface CatalogueVersion {
  id: string;
  label: string;
  status: string;
  is_current: boolean;
  content_readiness: ContentReadiness;
  rights_status: RightsStatus;
  activation_status: ActivationStatus;
  rights_reviewed_at: string | null;
  availability_note: string | null;
  published_at: string | null;
}

export interface CatalogueEntry {
  curriculumId: string;
  curriculumCode: string;
  curriculumName: string;
  providerName: string | null;
  versions: CatalogueVersion[];
  currentVersion: CatalogueVersion | null;
  /** Truthful internal status shown only to Platform Administrators. */
  internalStatus: string;
  /** Whether ordinary users may select or enrol into this curriculum. */
  availableToUsers: boolean;
}

/** Derives the internal status label from database state — never hand-typed. */
export function deriveInternalStatus(version: CatalogueVersion | null): {
  label: string;
  available: boolean;
} {
  if (!version) return { label: "Configured — no version defined", available: false };
  if (version.availability_note && version.rights_status !== "authorized") {
    return { label: version.availability_note, available: false };
  }
  if (version.rights_status === "expired") {
    return { label: "Unavailable — rights expired", available: false };
  }
  if (version.rights_status === "restricted") {
    return { label: "Unavailable — rights restricted", available: false };
  }
  if (version.rights_status !== "authorized") {
    return { label: "Configured — rights review required", available: false };
  }
  if (version.content_readiness !== "complete") {
    return { label: "Configured — awaiting authorized curriculum data", available: false };
  }
  if (version.status !== "published" || !version.is_current) {
    return { label: "Authorized — awaiting publication", available: false };
  }
  if (version.activation_status !== "active") {
    return { label: "Authorized — not activated", available: false };
  }
  return { label: "Active", available: true };
}

/**
 * Full curriculum catalogue with the derived activation matrix. The internal
 * statuses are only rendered to Platform Administrators; ordinary selectors use
 * {@link listAvailableCurricula}.
 */
export async function listCurriculumCatalogue(): Promise<CatalogueEntry[]> {
  const [curricula, versions] = await Promise.all([
    supabase
      .from("curricula")
      .select("id, code, name, provider:curriculum_providers(id, name)")
      .order("name"),
    supabase
      .from("curriculum_versions")
      .select(
        "id, curriculum_id, label, status, is_current, content_readiness, rights_status, activation_status, rights_reviewed_at, availability_note, published_at",
      )
      .order("created_at", { ascending: false }),
  ]);
  if (curricula.error) throw curricula.error;
  if (versions.error) throw versions.error;

  return (curricula.data ?? []).map((curriculum) => {
    const rows = (versions.data ?? []).filter(
      (version) => version.curriculum_id === curriculum.id,
    ) as unknown as CatalogueVersion[];
    const current = rows.find((row) => row.is_current) ?? rows[0] ?? null;
    const derived = deriveInternalStatus(current);
    return {
      curriculumId: curriculum.id,
      curriculumCode: curriculum.code,
      curriculumName: curriculum.name,
      providerName: curriculum.provider?.name ?? null,
      versions: rows,
      currentVersion: current,
      internalStatus: derived.label,
      availableToUsers: derived.available,
    } satisfies CatalogueEntry;
  });
}

/**
 * Ordinary-user selector source. Returns only curricula whose current version
 * passes the database activation gate, so an unauthorized or incomplete
 * curriculum can never be offered, advertised or enrolled into.
 */
export async function listAvailableCurricula() {
  const { data, error } = await supabase
    .from("curriculum_versions")
    .select("id, label, curriculum_id, curriculum:curricula(id, code, name)")
    .eq("status", "published")
    .eq("is_current", true)
    .eq("content_readiness", "complete")
    .eq("rights_status", "authorized")
    .eq("activation_status", "active");
  if (error) throw error;
  const rows = data ?? [];
  if (rows.length === 0) return [];

  const checks = await Promise.all(
    rows.map(async (row) => {
      const gate = await supabase.rpc("curriculum_version_is_available", {
        p_version_id: row.id,
      });
      if (gate.error) throw gate.error;
      return gate.data === true ? row : null;
    }),
  );
  return checks.filter((row): row is (typeof rows)[number] => row !== null);
}

/* ----------------------------------------------------- stages and levels */

export async function listEducationStages(versionId: string | null) {
  let query = supabase
    .from("education_stages")
    .select(
      "id, curriculum_version_id, name, sequence_order, status, published_at, is_available, unavailable_reason",
    )
    .order("sequence_order");
  if (versionId) query = query.eq("curriculum_version_id", versionId);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function listAcademicLevels(curriculumId: string | null) {
  let query = supabase
    .from("grades")
    .select(
      "id, curriculum_id, name, sequence_order, pathway_required, education_stage_id, status, is_available, unavailable_reason, education_stage:education_stages(id, name, is_available)",
    )
    .order("sequence_order");
  if (curriculumId) query = query.eq("curriculum_id", curriculumId);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

/** Tracks (legacy `pathways`) across every academic level. */
export async function listTracks() {
  const { data, error } = await supabase
    .from("pathways")
    .select(
      "id, name, description, status, grade_id, authoring_organization_id, grade:grades(id, name, sequence_order)",
    )
    .order("name");
  if (error) throw error;
  return data ?? [];
}

export async function listSubjectGroups() {
  const { data, error } = await supabase
    .from("subject_groups")
    .select("id, name, created_at")
    .order("name");
  if (error) throw error;
  return data ?? [];
}

/* --------------------------------------------------- sources and grants */

export async function listSourceArtifacts(term: string) {
  let query = supabase
    .from("source_artifacts")
    .select(
      "id, rights_holder, source_title, source_type, authoritative_url, document_date, jurisdiction, acquisition_method, edition, checksum, original_artifact_path, verification_status, notes, created_at",
    )
    .order("created_at", { ascending: false });
  const needle = term.trim();
  if (needle) query = query.ilike("source_title", `%${needle.replace(/[%_]/g, "")}%`);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function listRightsGrants(sourceArtifactId: string | null) {
  let query = supabase
    .from("rights_grants")
    .select(
      "id, source_artifact_id, grant_type, grant_reference, evidence_storage_path, effective_date, expiry_date, territory, attribution_text, restrictions, reviewer_id, reviewed_at, permits_commercial_use, permits_storage, permits_transformation, permits_authenticated_display, permits_public_display, permits_download, permits_translation, permits_derivative_works, permits_sublicensing, created_at",
    )
    .order("created_at", { ascending: false });
  if (sourceArtifactId) query = query.eq("source_artifact_id", sourceArtifactId);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export async function listSourceLinks(sourceArtifactId: string) {
  const { data, error } = await supabase
    .from("source_artifact_links")
    .select("id, source_artifact_id, entity_type, entity_id, note, created_at")
    .eq("source_artifact_id", sourceArtifactId)
    .order("created_at");
  if (error) throw error;
  return data ?? [];
}

export async function listImportBatches() {
  const { data, error } = await supabase
    .from("curriculum_import_batches")
    .select(
      "id, batch_reference, source_artifact_id, source_package, imported_by, started_at, completed_at, dry_run, dry_run_result, record_counts, errors, rollback_reference, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw error;
  return data ?? [];
}

export async function listRightsAudit(entityId: string | null) {
  let query = supabase
    .from("rights_audit_log")
    .select("id, entity_type, entity_id, action, actor_id, previous_state, new_state, created_at")
    .order("created_at", { ascending: false })
    .limit(200);
  if (entityId) query = query.eq("entity_id", entityId);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

/* ------------------------------------------------- CBC scope verification */

export const CBC_GRADE_COUNT = 12;

export interface CbcScopeReport {
  expected: number;
  present: number[];
  missing: number[];
  duplicated: number[];
  outOfScope: { id: string; name: string; sequenceOrder: number }[];
  unavailableStages: { id: string; name: string; reason: string | null }[];
  compliant: boolean;
}

/**
 * Verifies the binding CBC scope: exactly Grades 1–12 with no Pre-Primary
 * level, and every excluded stage flagged unavailable.
 */
export async function getCbcScopeReport(): Promise<CbcScopeReport> {
  const curriculum = await supabase.from("curricula").select("id").eq("code", "CBC").maybeSingle();
  if (curriculum.error) throw curriculum.error;

  const [levels, stages] = await Promise.all([
    supabase
      .from("grades")
      .select("id, name, sequence_order")
      .eq("curriculum_id", curriculum.data?.id ?? "")
      .order("sequence_order"),
    supabase.from("education_stages").select("id, name, is_available, unavailable_reason"),
  ]);
  if (levels.error) throw levels.error;
  if (stages.error) throw stages.error;

  const rows = levels.data ?? [];
  const seen = new Map<number, number>();
  for (const row of rows) seen.set(row.sequence_order, (seen.get(row.sequence_order) ?? 0) + 1);

  const present = [...seen.keys()]
    .filter((n) => n >= 1 && n <= CBC_GRADE_COUNT)
    .sort((a, b) => a - b);
  const missing = Array.from({ length: CBC_GRADE_COUNT }, (_, i) => i + 1).filter(
    (n) => !seen.has(n),
  );
  const duplicated = [...seen.entries()].filter(([, count]) => count > 1).map(([n]) => n);
  const outOfScope = rows
    .filter((row) => row.sequence_order < 1 || row.sequence_order > CBC_GRADE_COUNT)
    .map((row) => ({ id: row.id, name: row.name, sequenceOrder: row.sequence_order }));
  const unavailableStages = (stages.data ?? [])
    .filter((row) => !row.is_available)
    .map((row) => ({ id: row.id, name: row.name, reason: row.unavailable_reason }));

  return {
    expected: CBC_GRADE_COUNT,
    present,
    missing,
    duplicated,
    outOfScope,
    unavailableStages,
    compliant:
      present.length === CBC_GRADE_COUNT &&
      missing.length === 0 &&
      duplicated.length === 0 &&
      outOfScope.length === 0,
  };
}
