/**
 * Server-only helpers for the assessment authoring server functions.
 * Keeps the *.functions.ts modules thin wrappers.
 */
import type { AssessmentInput, QuestionInput, RubricInput } from "@/features/assessments/schemas";

type Db = {
  from: (table: string) => any;
};

export function assessmentRow(data: AssessmentInput, userId: string) {
  return {
    organization_id: data.organizationId,
    assessment_type_id: data.assessmentTypeId ?? null,
    title: data.title,
    description: data.description ?? null,
    instructions: data.instructions ?? null,
    student_instructions: data.studentInstructions ?? null,
    teacher_notes: data.teacherNotes ?? null,
    curriculum_id: data.curriculumId ?? null,
    curriculum_version_id: data.curriculumVersionId ?? null,
    grade_id: data.gradeId ?? null,
    subject_id: data.subjectId ?? null,
    strand_id: data.strandId ?? null,
    sub_strand_id: data.subStrandId ?? null,
    lesson_id: data.lessonId ?? null,
    rubric_id: data.rubricId ?? null,
    status: data.status,
    max_score: data.maxScore,
    passing_score: data.passingScore ?? null,
    weighting: data.weighting,
    estimated_minutes: data.estimatedMinutes ?? null,
    due_at: data.dueAt ?? null,
    available_from: data.availableFrom ?? null,
    available_until: data.availableUntil ?? null,
    time_limit_minutes: data.timeLimitMinutes ?? null,
    attempts_allowed: data.attemptsAllowed,
    randomize_questions: data.randomizeQuestions,
    randomize_options: data.randomizeOptions,
    late_submission_allowed: data.lateSubmissionAllowed,
    late_penalty_percent: data.latePenaltyPercent,
    parent_visible: data.parentVisible,
    allow_review: data.allowReview,
    auto_grade: data.autoGrade,
    is_template: data.isTemplate,
    published_at:
      data.status === "published" || data.status === "open" ? new Date().toISOString() : null,
    created_by: userId,
  };
}

export function questionRow(data: QuestionInput, userId: string) {
  return {
    organization_id: data.organizationId,
    question_type: data.questionType,
    prompt: data.prompt,
    body: data.body,
    answer_key: data.answerKey,
    explanation: data.explanation ?? null,
    points: data.points,
    difficulty: data.difficulty,
    status: data.status,
    category: data.category ?? null,
    tags: data.tags,
    subject_id: data.subjectId ?? null,
    grade_id: data.gradeId ?? null,
    strand_id: data.strandId ?? null,
    sub_strand_id: data.subStrandId ?? null,
    learning_outcome_id: data.learningOutcomeId ?? null,
    competency_id: data.competencyId ?? null,
    created_by: userId,
  };
}

/** Replaces the competency / learning-outcome links of an assessment. */
export async function replaceCurriculumLinks(
  supabase: Db,
  assessmentId: string,
  competencyIds: string[],
  outcomeIds: string[],
) {
  await supabase.from("assessment_competencies").delete().eq("assessment_id", assessmentId);
  await supabase.from("assessment_learning_outcomes").delete().eq("assessment_id", assessmentId);
  if (competencyIds.length > 0) {
    await supabase
      .from("assessment_competencies")
      .insert(competencyIds.map((id) => ({ assessment_id: assessmentId, competency_id: id })));
  }
  if (outcomeIds.length > 0) {
    await supabase
      .from("assessment_learning_outcomes")
      .insert(outcomeIds.map((id) => ({ assessment_id: assessmentId, learning_outcome_id: id })));
  }
}

/** Writes a rubric with its criteria and performance levels. */
export async function writeRubric(supabase: Db, data: RubricInput, userId: string) {
  const base = {
    organization_id: data.organizationId,
    title: data.title,
    description: data.description ?? null,
    subject_id: data.subjectId ?? null,
    is_template: data.isTemplate,
    status: data.status,
    created_by: userId,
  };

  let rubricId = data.rubricId ?? null;
  if (rubricId) {
    const { error } = await supabase.from("rubrics").update(base).eq("id", rubricId);
    if (error) throw new Error(error.message);
    await supabase.from("rubric_criteria").delete().eq("rubric_id", rubricId);
  } else {
    const { data: created, error } = await supabase
      .from("rubrics")
      .insert(base)
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    rubricId = created.id as string;
  }

  for (const [index, criterion] of data.criteria.entries()) {
    const { data: row, error } = await supabase
      .from("rubric_criteria")
      .insert({
        rubric_id: rubricId,
        title: criterion.title,
        description: criterion.description ?? null,
        competency_id: criterion.competencyId ?? null,
        learning_outcome_id: criterion.learningOutcomeId ?? null,
        max_points: criterion.maxPoints,
        sequence_order: index,
      })
      .select("id")
      .single();
    if (error) throw new Error(error.message);
    if (criterion.levels.length > 0) {
      await supabase.from("rubric_levels").insert(
        criterion.levels.map((level, levelIndex) => ({
          criterion_id: row.id,
          label: level.label,
          descriptor: level.descriptor ?? null,
          points: level.points,
          sequence_order: levelIndex,
        })),
      );
    }
  }

  return rubricId;
}

/** Deep-copies an assessment, its questions and its curriculum links. */
export async function cloneAssessment(
  supabase: Db,
  assessmentId: string,
  title: string | null,
  userId: string,
  asTemplate: boolean,
) {
  const { data: source, error } = await supabase
    .from("assessment_definitions")
    .select("*")
    .eq("id", assessmentId)
    .single();
  if (error) throw new Error(error.message);

  const {
    id: _id,
    created_at: _createdAt,
    updated_at: _updatedAt,
    published_at: _publishedAt,
    ...rest
  } = source as Record<string, unknown>;

  const { data: created, error: insertError } = await supabase
    .from("assessment_definitions")
    .insert({
      ...rest,
      title: title?.trim() || `${source.title} (copy)`,
      status: "draft",
      is_template: asTemplate,
      cloned_from_id: assessmentId,
      created_by: userId,
    })
    .select("id")
    .single();
  if (insertError) throw new Error(insertError.message);

  const [{ data: questions }, { data: competencies }, { data: outcomes }] = await Promise.all([
    supabase
      .from("assessment_questions")
      .select("question_id, sequence_order, points_override, required")
      .eq("assessment_id", assessmentId),
    supabase
      .from("assessment_competencies")
      .select("competency_id, weight")
      .eq("assessment_id", assessmentId),
    supabase
      .from("assessment_learning_outcomes")
      .select("learning_outcome_id, weight")
      .eq("assessment_id", assessmentId),
  ]);

  if (questions?.length) {
    await supabase
      .from("assessment_questions")
      .insert(
        questions.map((row: Record<string, unknown>) => ({ ...row, assessment_id: created.id })),
      );
  }
  if (competencies?.length) {
    await supabase
      .from("assessment_competencies")
      .insert(
        competencies.map((row: Record<string, unknown>) => ({ ...row, assessment_id: created.id })),
      );
  }
  if (outcomes?.length) {
    await supabase
      .from("assessment_learning_outcomes")
      .insert(
        outcomes.map((row: Record<string, unknown>) => ({ ...row, assessment_id: created.id })),
      );
  }

  return created.id as string;
}

/**
 * Notifies learners (and their guardians) that assessments are available.
 * Silent no-op when nobody in scope has an independent login.
 */
export async function notifyAssessmentAudience(
  supabase: Db,
  params: {
    organizationId: string;
    gradeId: string | null;
    assessmentId: string;
    type: string;
    payload?: Record<string, unknown>;
  },
) {
  let studentQuery = supabase
    .from("students")
    .select("id, user_role_id")
    .eq("organization_id", params.organizationId);
  if (params.gradeId) studentQuery = studentQuery.eq("grade_id", params.gradeId);
  const { data: students } = await studentQuery;

  const recipients = new Set<string>();
  (students ?? []).forEach((student: { user_role_id: string | null }) => {
    if (student.user_role_id) recipients.add(student.user_role_id);
  });

  const studentIds = (students ?? []).map((student: { id: string }) => student.id);
  if (studentIds.length > 0) {
    const { data: guardians } = await supabase
      .from("parent_student_relationships")
      .select("parent_id")
      .in("student_id", studentIds)
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
  }

  if (recipients.size === 0) return;
  await supabase.from("notifications").insert(
    Array.from(recipients).map((roleId) => ({
      recipient_user_role_id: roleId,
      type: params.type,
      payload: { assessment_id: params.assessmentId, ...(params.payload ?? {}) },
    })),
  );
}
