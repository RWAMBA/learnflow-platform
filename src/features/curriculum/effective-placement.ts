/**
 * Phase 10 Stage 1C — compatibility read path for a Student's curriculum
 * placement.
 *
 * Read-only and additive. It does NOT change any existing write path: the
 * legacy `students.grade_id` / `students.pathway_id` columns remain the only
 * columns written by `createStudentWithGuardian` and the existing student
 * forms. This module only answers "what is this Student's effective placement
 * for reads", preferring the Stage 1C enrollment where one exists and falling
 * back to the legacy columns where it does not.
 *
 * The Stage 1C tables are created by an unapplied migration, so they are not
 * yet in the generated Supabase types. The narrow row shapes below are the
 * local contract; they are replaced by generated types once the migration is
 * applied and types are regenerated.
 */
import { supabase } from "@/integrations/supabase/client";

export type PlacementSource = "enrollment" | "legacy" | "none";

export type EffectivePlacement = {
  source: PlacementSource;
  /** Stage 1C enrollment id, null when resolved from the legacy columns. */
  enrollmentId: string | null;
  /** `grades.id` — the Academic Level under the Stage 1B naming. */
  academicLevelId: string | null;
  academicLevelName: string | null;
  /** `pathways.id` — the Track under the Stage 1B naming. */
  trackId: string | null;
  trackName: string | null;
  curriculumVersionId: string | null;
  academicPeriodId: string | null;
};

type EnrollmentRow = {
  id: string;
  curriculum_version_id: string | null;
  academic_level_id: string | null;
  academic_period_id: string | null;
  track_id: string | null;
  academic_level: { id: string; name: string } | null;
  track: { id: string; name: string } | null;
};

type LegacyRow = {
  grade_id: string | null;
  pathway_id: string | null;
  grade: { id: string; name: string } | null;
  pathway: { id: string; name: string } | null;
};

const EMPTY: EffectivePlacement = {
  source: "none",
  enrollmentId: null,
  academicLevelId: null,
  academicLevelName: null,
  trackId: null,
  trackName: null,
  curriculumVersionId: null,
  academicPeriodId: null,
};

export const placementKeys = {
  effective: (studentId: string) => ["curriculum", "placement", studentId] as const,
};

/**
 * Postgres error code for "relation does not exist". Until the Stage 1C
 * migration is applied the enrollment table is absent, and this read path must
 * degrade to the legacy columns rather than surface an error.
 */
const UNDEFINED_TABLE = "42P01";

function fromEnrollment(row: EnrollmentRow): EffectivePlacement {
  return {
    source: "enrollment",
    enrollmentId: row.id,
    academicLevelId: row.academic_level?.id ?? row.academic_level_id,
    academicLevelName: row.academic_level?.name ?? null,
    trackId: row.track?.id ?? row.track_id,
    trackName: row.track?.name ?? null,
    curriculumVersionId: row.curriculum_version_id,
    academicPeriodId: row.academic_period_id,
  };
}

function fromLegacy(row: LegacyRow): EffectivePlacement {
  if (!row.grade_id && !row.pathway_id) return EMPTY;
  return {
    source: "legacy",
    enrollmentId: null,
    academicLevelId: row.grade?.id ?? row.grade_id,
    academicLevelName: row.grade?.name ?? null,
    trackId: row.pathway?.id ?? row.pathway_id,
    trackName: row.pathway?.name ?? null,
    curriculumVersionId: null,
    academicPeriodId: null,
  };
}

/** Resolves a single Student's effective curriculum placement. */
export async function getEffectivePlacement(studentId: string): Promise<EffectivePlacement> {
  const enrollment = await supabase
    // Not yet in the generated types; see the module note above.
    .from("curriculum_enrollments" as never)
    .select(
      "id, curriculum_version_id, academic_level_id, academic_period_id, track_id, academic_level:grades(id, name), track:pathways(id, name)",
    )
    .eq("student_id", studentId)
    .eq("enrollment_category", "primary")
    .eq("status", "active")
    .maybeSingle();

  if (!enrollment.error && enrollment.data) {
    return fromEnrollment(enrollment.data as unknown as EnrollmentRow);
  }
  if (enrollment.error && enrollment.error.code !== UNDEFINED_TABLE) {
    throw enrollment.error;
  }

  const legacy = await supabase
    .from("students")
    .select("grade_id, pathway_id, grade:grades(id, name), pathway:pathways(id, name)")
    .eq("id", studentId)
    .maybeSingle();
  if (legacy.error) throw legacy.error;
  if (!legacy.data) return EMPTY;
  return fromLegacy(legacy.data as unknown as LegacyRow);
}

export const __testing = { fromEnrollment, fromLegacy, EMPTY };
