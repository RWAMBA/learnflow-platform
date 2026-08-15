/** Server-only scoring and notification helpers for assessment delivery. */
import { gradeAnswer, percentageOf } from "@/lib/assessment-grading";
import { MASTERY_FROM_PERCENTAGE, gradeLabelFor } from "@/features/assessments/constants";

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- PostgREST query builders are deeply generic; narrowing here would duplicate the generated types without adding safety.
type Db = { from: (table: string) => any };

export interface ScoredSubmission {
  score: number;
  possible: number;
  percentage: number;
  gradeLabel: string;
  needsManualGrading: boolean;
}

/**
 * Materialises the autosaved answers into `submission_answers`, auto-grading
 * every objective question on the way through.
 */
export async function materialiseAnswers(
  supabase: Db,
  submissionId: string,
  assessmentId: string,
  autosave: Record<string, unknown>,
): Promise<ScoredSubmission> {
  const { data: questions, error } = await supabase
    .from("assessment_questions")
    .select(
      "question_id, points_override, question:question_bank_items(id, question_type, points, answer_key)",
    )
    .eq("assessment_id", assessmentId);
  if (error) throw new Error(error.message);

  let score = 0;
  let possible = 0;
  let needsManualGrading = false;
  const rows: Record<string, unknown>[] = [];

  for (const item of questions ?? []) {
    const question = item.question;
    if (!question) continue;
    const maxPoints = Number(item.points_override ?? question.points ?? 0);
    possible += maxPoints;
    const answer = (autosave[question.id] ?? {}) as Record<string, unknown>;
    const graded = gradeAnswer(question, answer, maxPoints);
    if (graded) score += graded.points;
    else needsManualGrading = true;

    rows.push({
      submission_id: submissionId,
      question_id: question.id,
      answer,
      is_correct: graded ? graded.isCorrect : null,
      awarded_points: graded ? graded.points : null,
      graded_at: graded ? new Date().toISOString() : null,
    });
  }

  if (rows.length > 0) {
    const { error: upsertError } = await supabase
      .from("submission_answers")
      .upsert(rows, { onConflict: "submission_id,question_id" });
    if (upsertError) throw new Error(upsertError.message);
  }

  const percentage = percentageOf(score, possible);
  return { score, possible, percentage, gradeLabel: gradeLabelFor(percentage), needsManualGrading };
}

/** Recomputes the total from stored per-answer marks after manual grading. */
export async function recomputeSubmissionScore(
  supabase: Db,
  submissionId: string,
  maxScore: number,
) {
  const { data: answers } = await supabase
    .from("submission_answers")
    .select("awarded_points, question:question_bank_items(points)")
    .eq("submission_id", submissionId);
  const { data: rubric } = await supabase
    .from("submission_rubric_scores")
    .select("points")
    .eq("submission_id", submissionId);

  const answerPoints = (answers ?? []).reduce(
    (sum: number, row: { awarded_points: number | null }) => sum + Number(row.awarded_points ?? 0),
    0,
  );
  const rubricPoints = (rubric ?? []).reduce(
    (sum: number, row: { points: number | null }) => sum + Number(row.points ?? 0),
    0,
  );
  const score = answerPoints + rubricPoints;
  const percentage = percentageOf(score, maxScore || 100);
  return { score, percentage, gradeLabel: gradeLabelFor(percentage) };
}

/** Notifies the teachers who own an assessment that work has arrived. */
export async function notifyAssessmentAuthor(
  supabase: Db,
  params: {
    organizationId: string;
    assessmentId: string;
    type: string;
    payload: Record<string, unknown>;
  },
) {
  const { data: assessment } = await supabase
    .from("assessment_definitions")
    .select("created_by")
    .eq("id", params.assessmentId)
    .maybeSingle();
  if (!assessment?.created_by) return;
  const { data: roles } = await supabase
    .from("user_roles")
    .select("id")
    .eq("user_id", assessment.created_by)
    .eq("organization_id", params.organizationId)
    .eq("status", "active");
  if (!roles?.length) return;
  await supabase.from("notifications").insert(
    roles.map((role: { id: string }) => ({
      recipient_user_role_id: role.id,
      type: params.type,
      payload: { assessment_id: params.assessmentId, ...params.payload },
    })),
  );
}

/** Notifies a learner and their guardians that marks are available. */
export async function notifyStudentAudience(
  supabase: Db,
  params: {
    organizationId: string;
    studentId: string;
    type: string;
    payload: Record<string, unknown>;
  },
) {
  const recipients = new Set<string>();
  const { data: student } = await supabase
    .from("students")
    .select("user_role_id")
    .eq("id", params.studentId)
    .maybeSingle();
  if (student?.user_role_id) recipients.add(student.user_role_id);

  const { data: guardians } = await supabase
    .from("parent_student_relationships")
    .select("parent_id")
    .eq("student_id", params.studentId)
    .eq("status", "active");
  if (guardians?.length) {
    const { data: guardianRoles } = await supabase
      .from("user_roles")
      .select("id")
      .in(
        "user_id",
        guardians.map((row: { parent_id: string }) => row.parent_id),
      )
      .eq("organization_id", params.organizationId)
      .eq("status", "active");
    (guardianRoles ?? []).forEach((row: { id: string }) => recipients.add(row.id));
  }

  if (recipients.size === 0) return;
  await supabase.from("notifications").insert(
    Array.from(recipients).map((roleId) => ({
      recipient_user_role_id: roleId,
      type: params.type,
      payload: params.payload,
    })),
  );
}

/** Writes competency mastery rows derived from an assessment percentage. */
export async function recordCompetencyMastery(
  supabase: Db,
  params: {
    studentId: string;
    competencyIds: string[];
    percentage: number;
    lessonId: string | null;
    recordedBy: string;
    notes: string | null;
  },
) {
  if (params.competencyIds.length === 0) return;
  await supabase.from("progress_records").insert(
    params.competencyIds.map((competencyId) => ({
      student_id: params.studentId,
      competency_id: competencyId,
      lesson_id: params.lessonId,
      mastery_level: MASTERY_FROM_PERCENTAGE(params.percentage),
      recorded_by: params.recordedBy,
      notes: params.notes,
    })),
  );
}
