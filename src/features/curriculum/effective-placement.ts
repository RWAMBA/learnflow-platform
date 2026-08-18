/**
 * Phase 10 Stage 1 — authoritative read path for a Student's curriculum
 * placement.
 *
 * After the Stage 1 legacy cutover, `curriculum_enrollments` is the single
 * source of truth. `students.grade_id` / `students.pathway_id` are retained as
 * deprecated, compatibility-only data: they are surfaced for reconciliation
 * reporting but never control application behaviour. A learner without a
 * primary enrollment resolves to "none" so the fail-closed Platform
 * Administrator reconciliation workflow — not a silent legacy fallback — is
 * what completes their placement.
 */
import { supabase } from "@/integrations/supabase/client";

export type PlacementSource = "enrollment" | "none";

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

/** Resolves a single Student's effective curriculum placement. */
export async function getEffectivePlacement(studentId: string): Promise<EffectivePlacement> {
  const enrollment = await supabase
    .from("curriculum_enrollments")
    .select(
      "id, curriculum_version_id, academic_level_id, academic_period_id, track_id, academic_level:grades(id, name), track:pathways(id, name)",
    )
    .eq("student_id", studentId)
    .eq("enrollment_category", "primary")
    .eq("status", "active")
    .maybeSingle();

  if (enrollment.error) throw enrollment.error;
  if (!enrollment.data) return EMPTY;
  return fromEnrollment(enrollment.data as unknown as EnrollmentRow);
}

export const __testing = { fromEnrollment, EMPTY };
