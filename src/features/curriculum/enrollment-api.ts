/**
 * Phase 10 Stage 1C — academic period and curriculum enrollment reads.
 *
 * Runs through the browser client so the Stage 1C RLS policies stay
 * authoritative. Nothing here decides authorization; it decides what the UI
 * has to render.
 */
import { supabase } from "@/integrations/supabase/client";

export const PERIOD_TYPES = ["year", "term", "semester", "quarter"] as const;
export type PeriodType = (typeof PERIOD_TYPES)[number];

export const ENROLLMENT_STATUSES = [
  "pending",
  "active",
  "completed",
  "transferred",
  "withdrawn",
  "archived",
] as const;
export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];

export const ENROLLMENT_CATEGORIES = ["primary", "supplementary"] as const;
export type EnrollmentCategory = (typeof ENROLLMENT_CATEGORIES)[number];

/** Transitions the Stage 1C lifecycle trigger accepts. */
export const ALLOWED_ENROLLMENT_TRANSITIONS: Record<EnrollmentStatus, EnrollmentStatus[]> = {
  pending: ["active", "withdrawn", "archived"],
  active: ["completed", "transferred", "withdrawn"],
  completed: ["archived"],
  transferred: ["archived"],
  withdrawn: ["archived"],
  archived: [],
};

export const enrollmentKeys = {
  periods: (organizationId: string | null) => ["enrollment", "periods", organizationId] as const,
  enrollments: (organizationId: string | null, studentId: string | null) =>
    ["enrollment", "list", organizationId, studentId] as const,
  reconciliation: (organizationId: string | null) =>
    ["enrollment", "reconciliation", organizationId] as const,
};

/* ------------------------------------------------------ academic periods */

export interface PeriodNode {
  id: string;
  name: string;
  periodType: PeriodType;
  startDate: string;
  endDate: string;
  parentPeriodId: string | null;
  depth: number;
  children: PeriodNode[];
}

export async function listAcademicPeriods(organizationId: string | null) {
  let query = supabase
    .from("academic_periods")
    .select(
      "id, organization_id, name, period_type, start_date, end_date, parent_period_id, created_at",
    )
    .order("start_date", { ascending: false });
  if (organizationId) query = query.eq("organization_id", organizationId);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export type AcademicPeriodRow = Awaited<ReturnType<typeof listAcademicPeriods>>[number];

/** Builds the period hierarchy (year → term/semester → quarter) for display. */
export function buildPeriodTree(rows: AcademicPeriodRow[]): PeriodNode[] {
  const byId = new Map<string, PeriodNode>();
  for (const row of rows) {
    byId.set(row.id, {
      id: row.id,
      name: row.name,
      periodType: row.period_type as PeriodType,
      startDate: row.start_date,
      endDate: row.end_date,
      parentPeriodId: row.parent_period_id,
      depth: 0,
      children: [],
    });
  }
  const roots: PeriodNode[] = [];
  for (const node of byId.values()) {
    const parent = node.parentPeriodId ? byId.get(node.parentPeriodId) : undefined;
    if (parent) parent.children.push(node);
    else roots.push(node);
  }
  const assignDepth = (nodes: PeriodNode[], depth: number) => {
    for (const node of nodes) {
      node.depth = depth;
      node.children.sort((a, b) => a.startDate.localeCompare(b.startDate));
      assignDepth(node.children, depth + 1);
    }
  };
  roots.sort((a, b) => b.startDate.localeCompare(a.startDate));
  assignDepth(roots, 0);
  return roots;
}

/** Flattens the tree so a table can render indentation without recursion. */
export function flattenPeriodTree(nodes: PeriodNode[]): PeriodNode[] {
  return nodes.flatMap((node) => [node, ...flattenPeriodTree(node.children)]);
}

/* ----------------------------------------------------------- enrollments */

export async function listCurriculumEnrollments(params: {
  organizationId: string | null;
  studentId: string | null;
}) {
  let query = supabase
    .from("curriculum_enrollments")
    .select(
      "id, student_id, curriculum_version_id, academic_level_id, track_id, academic_period_id, enrollment_category, status, enrolled_at, ended_at, transferred_from_enrollment_id, created_at, student:students(id, first_name, last_name, organization_id), academic_level:grades(id, name, sequence_order), track:pathways(id, name), period:academic_periods(id, name), version:curriculum_versions(id, label, curriculum:curricula(id, code, name))",
    )
    .order("created_at", { ascending: false });
  if (params.studentId) query = query.eq("student_id", params.studentId);
  const { data, error } = await query;
  if (error) throw error;
  const rows = data ?? [];
  if (!params.organizationId) return rows;
  return rows.filter((row) => row.student?.organization_id === params.organizationId);
}

export type EnrollmentRow = Awaited<ReturnType<typeof listCurriculumEnrollments>>[number];

/* -------------------------------------------------- learner reconciliation */

export interface ReconciliationRow {
  studentId: string;
  studentName: string;
  legacyLevelId: string | null;
  legacyLevelName: string | null;
  legacyTrackId: string | null;
  legacyTrackName: string | null;
  hasPrimaryEnrollment: boolean;
  /** True when the legacy columns and the primary enrollment disagree. */
  mismatched: boolean;
}

export interface ReconciliationReport {
  rows: ReconciliationRow[];
  total: number;
  reconciled: number;
  outstanding: number;
  mismatched: number;
}

/**
 * Compares every existing learner's legacy `students.grade_id` / `pathway_id`
 * placement against their Stage 1C primary enrollment. Read-only: it reports
 * what still needs reconciling instead of silently rewriting learner records.
 */
export async function getLearnerReconciliation(
  organizationId: string | null,
): Promise<ReconciliationReport> {
  let studentQuery = supabase
    .from("students")
    .select(
      "id, first_name, last_name, grade_id, pathway_id, organization_id, grade:grades(id, name), pathway:pathways(id, name)",
    )
    .order("last_name");
  if (organizationId) studentQuery = studentQuery.eq("organization_id", organizationId);

  const [students, enrollments] = await Promise.all([
    studentQuery,
    supabase
      .from("curriculum_enrollments")
      .select("id, student_id, academic_level_id, track_id, status, enrollment_category"),
  ]);
  if (students.error) throw students.error;
  if (enrollments.error) throw enrollments.error;

  const primaryByStudent = new Map<string, (typeof enrollments.data)[number]>();
  for (const row of enrollments.data ?? []) {
    if (row.enrollment_category !== "primary") continue;
    if (row.status !== "active" && row.status !== "pending") continue;
    primaryByStudent.set(row.student_id, row);
  }

  const rows: ReconciliationRow[] = (students.data ?? []).map((student) => {
    const primary = primaryByStudent.get(student.id);
    const mismatched = Boolean(
      primary &&
      ((student.grade_id && primary.academic_level_id !== student.grade_id) ||
        (student.pathway_id && primary.track_id !== student.pathway_id)),
    );
    return {
      studentId: student.id,
      studentName: `${student.first_name} ${student.last_name}`.trim(),
      legacyLevelId: student.grade_id,
      legacyLevelName: student.grade?.name ?? null,
      legacyTrackId: student.pathway_id,
      legacyTrackName: student.pathway?.name ?? null,
      hasPrimaryEnrollment: Boolean(primary),
      mismatched,
    };
  });

  return {
    rows,
    total: rows.length,
    reconciled: rows.filter((row) => row.hasPrimaryEnrollment && !row.mismatched).length,
    outstanding: rows.filter((row) => !row.hasPrimaryEnrollment).length,
    mismatched: rows.filter((row) => row.mismatched).length,
  };
}
