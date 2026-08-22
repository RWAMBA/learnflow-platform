/**
 * Stage 2 — academic programme summaries.
 *
 * Academic "programmes" are not a separate entity: the labels are read from
 * the existing Stage 1C curriculum_enrollments rows.
 *   Primary       -> Full-Time Homeschooling
 *   Supplementary -> Part-Time Tuition
 * No duplicate academic-programme model is introduced, and nothing here
 * authorizes anything — the rows arrive already filtered by RLS.
 */

export const ACADEMIC_PROGRAMME_LABELS = {
  primary: "Full-Time Homeschooling",
  supplementary: "Part-Time Tuition",
} as const;

export type AcademicProgrammeCategory = keyof typeof ACADEMIC_PROGRAMME_LABELS;

export interface AcademicSummaryRow {
  category: AcademicProgrammeCategory;
  label: string;
  activeLearners: number;
  totalEnrollments: number;
}

interface SummaryInput {
  student_id: string;
  enrollment_category: string;
  status: string;
}

export function summarizeAcademicProgrammes(rows: SummaryInput[]): AcademicSummaryRow[] {
  return (Object.keys(ACADEMIC_PROGRAMME_LABELS) as AcademicProgrammeCategory[]).map((category) => {
    const scoped = rows.filter((row) => row.enrollment_category === category);
    const active = new Set(
      scoped.filter((row) => row.status === "active").map((row) => row.student_id),
    );
    return {
      category,
      label: ACADEMIC_PROGRAMME_LABELS[category],
      activeLearners: active.size,
      totalEnrollments: scoped.length,
    };
  });
}
