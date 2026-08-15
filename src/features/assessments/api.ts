import { supabase } from "@/integrations/supabase/client";
import type { AssessmentStatus, QuestionStatus, SubmissionStatus } from "./constants";

export const assessmentKeys = {
  types: (organizationId: string) => ["assessment-types", organizationId] as const,
  list: (organizationId: string, filters: unknown) =>
    ["assessments", organizationId, filters] as const,
  detail: (assessmentId: string) => ["assessment-definition", assessmentId] as const,
  questions: (assessmentId: string) => ["assessment-questions", assessmentId] as const,
  bank: (organizationId: string, filters: unknown) =>
    ["question-bank", organizationId, filters] as const,
  rubrics: (organizationId: string) => ["rubrics", organizationId] as const,
  rubric: (rubricId: string) => ["rubric", rubricId] as const,
  submissions: (assessmentId: string) => ["assessment-submissions", assessmentId] as const,
  submission: (submissionId: string) => ["assessment-submission", submissionId] as const,
  studentSubmissions: (studentId: string) =>
    ["assessment-submissions", "student", studentId] as const,
  studentAssessments: (studentId: string) => ["assessments", "student", studentId] as const,
  analytics: (organizationId: string) => ["assessment-analytics", organizationId] as const,
};

const ASSESSMENT_SELECT = `
  id, title, description, status, max_score, passing_score, weighting, estimated_minutes,
  due_at, available_from, available_until, time_limit_minutes, attempts_allowed,
  randomize_questions, randomize_options, late_submission_allowed, late_penalty_percent,
  parent_visible, allow_review, auto_grade, is_template, instructions, student_instructions,
  teacher_notes, published_at, created_at, organization_id, grade_id, subject_id, strand_id,
  sub_strand_id, lesson_id, curriculum_id, curriculum_version_id, rubric_id, assessment_type_id,
  type:assessment_types(id, name, code, category),
  subject:subjects(id, name), grade:grades(id, name, sequence_order),
  strand:strands(id, title), sub_strand:sub_strands(id, title), lesson:lessons(id, title)
`;

export interface AssessmentFilters {
  term?: string;
  status?: AssessmentStatus | "all";
  subjectId?: string | "all";
  gradeId?: string | "all";
  typeId?: string | "all";
  templatesOnly?: boolean;
}

export async function listAssessmentTypes(organizationId: string) {
  const { data, error } = await supabase
    .from("assessment_types")
    .select("id, code, name, description, category, is_system, is_active, organization_id")
    .or(`organization_id.is.null,organization_id.eq.${organizationId}`)
    .eq("is_active", true)
    .order("sequence_order");
  if (error) throw error;
  return data;
}

export async function listAssessments(organizationId: string, filters: AssessmentFilters = {}) {
  let query = supabase
    .from("assessment_definitions")
    .select(ASSESSMENT_SELECT)
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(200);

  if (filters.status && filters.status !== "all") query = query.eq("status", filters.status);
  if (filters.subjectId && filters.subjectId !== "all")
    query = query.eq("subject_id", filters.subjectId);
  if (filters.gradeId && filters.gradeId !== "all") query = query.eq("grade_id", filters.gradeId);
  if (filters.typeId && filters.typeId !== "all")
    query = query.eq("assessment_type_id", filters.typeId);
  if (filters.templatesOnly) query = query.eq("is_template", true);
  if (filters.term?.trim()) query = query.ilike("title", `%${filters.term.trim()}%`);

  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export type AssessmentRow = Awaited<ReturnType<typeof listAssessments>>[number];

export async function getAssessment(assessmentId: string) {
  const [assessment, questions, competencies, outcomes] = await Promise.all([
    supabase
      .from("assessment_definitions")
      .select(ASSESSMENT_SELECT)
      .eq("id", assessmentId)
      .maybeSingle(),
    listAssessmentQuestions(assessmentId),
    supabase
      .from("assessment_competencies")
      .select("id, weight, competency:competencies(id, name)")
      .eq("assessment_id", assessmentId),
    supabase
      .from("assessment_learning_outcomes")
      .select("id, weight, learning_outcome:learning_outcomes(id, description)")
      .eq("assessment_id", assessmentId),
  ]);
  if (assessment.error) throw assessment.error;
  if (competencies.error) throw competencies.error;
  if (outcomes.error) throw outcomes.error;
  return {
    assessment: assessment.data,
    questions,
    competencies: competencies.data ?? [],
    outcomes: outcomes.data ?? [],
  };
}

export async function listAssessmentQuestions(assessmentId: string) {
  const { data, error } = await supabase
    .from("assessment_questions")
    .select(
      "id, sequence_order, points_override, required, question:question_bank_items(id, prompt, question_type, body, points, difficulty, category, tags, status, answer_key, explanation)",
    )
    .eq("assessment_id", assessmentId)
    .order("sequence_order");
  if (error) throw error;
  return data ?? [];
}

export type AssessmentQuestionRow = Awaited<ReturnType<typeof listAssessmentQuestions>>[number];

export interface QuestionFilters {
  term?: string;
  subjectId?: string | "all";
  gradeId?: string | "all";
  difficulty?: string | "all";
  status?: QuestionStatus | "all";
  questionType?: string | "all";
}

export async function listQuestionBank(organizationId: string, filters: QuestionFilters = {}) {
  let query = supabase
    .from("question_bank_items")
    .select(
      "id, prompt, question_type, body, answer_key, explanation, points, difficulty, category, tags, status, version, subject_id, grade_id, strand_id, competency_id, created_at, subject:subjects(id, name), grade:grades(id, name)",
    )
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false })
    .limit(300);

  if (filters.subjectId && filters.subjectId !== "all")
    query = query.eq("subject_id", filters.subjectId);
  if (filters.gradeId && filters.gradeId !== "all") query = query.eq("grade_id", filters.gradeId);
  if (filters.difficulty && filters.difficulty !== "all")
    query = query.eq("difficulty", filters.difficulty);
  if (filters.status && filters.status !== "all") query = query.eq("status", filters.status);
  if (filters.questionType && filters.questionType !== "all")
    query = query.eq("question_type", filters.questionType);
  if (filters.term?.trim()) query = query.ilike("prompt", `%${filters.term.trim()}%`);

  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

export type QuestionRow = Awaited<ReturnType<typeof listQuestionBank>>[number];

export async function listRubrics(organizationId: string) {
  const { data, error } = await supabase
    .from("rubrics")
    .select(
      "id, title, description, status, is_template, subject_id, created_at, subject:subjects(id, name), criteria:rubric_criteria(id, title, description, max_points, sequence_order, competency_id, learning_outcome_id, levels:rubric_levels(id, label, descriptor, points, sequence_order))",
    )
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export type RubricRow = Awaited<ReturnType<typeof listRubrics>>[number];

const SUBMISSION_SELECT = `
  id, assessment_id, student_id, attempt_number, status, started_at, submitted_at, last_saved_at,
  time_spent_seconds, score, percentage, grade_label, is_late, feedback, graded_at, autosave,
  organization_id,
  student:students(id, first_name, last_name),
  assessment:assessment_definitions(id, title, max_score, passing_score, allow_review, parent_visible,
    subject:subjects(id, name), type:assessment_types(id, name))
`;

export async function listSubmissionsForAssessment(assessmentId: string) {
  const { data, error } = await supabase
    .from("assessment_submissions")
    .select(SUBMISSION_SELECT)
    .eq("assessment_id", assessmentId)
    .order("submitted_at", { ascending: false, nullsFirst: false });
  if (error) throw error;
  return data ?? [];
}

export async function listSubmissionsForStudents(studentIds: string[]) {
  if (studentIds.length === 0) return [];
  const { data, error } = await supabase
    .from("assessment_submissions")
    .select(SUBMISSION_SELECT)
    .in("student_id", studentIds)
    .order("started_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export type SubmissionRow = Awaited<ReturnType<typeof listSubmissionsForAssessment>>[number];

export async function getSubmission(submissionId: string) {
  const [submission, answers, rubricScores] = await Promise.all([
    supabase
      .from("assessment_submissions")
      .select(SUBMISSION_SELECT)
      .eq("id", submissionId)
      .maybeSingle(),
    supabase
      .from("submission_answers")
      .select(
        "id, question_id, answer, storage_path, is_correct, awarded_points, feedback, graded_at, question:question_bank_items(id, prompt, question_type, body, answer_key, points, explanation)",
      )
      .eq("submission_id", submissionId),
    supabase
      .from("submission_rubric_scores")
      .select("id, criterion_id, level_id, points, comment")
      .eq("submission_id", submissionId),
  ]);
  if (submission.error) throw submission.error;
  if (answers.error) throw answers.error;
  if (rubricScores.error) throw rubricScores.error;
  return {
    submission: submission.data,
    answers: answers.data ?? [],
    rubricScores: rubricScores.data ?? [],
  };
}

/** Assessments a learner may see, with their own attempts attached. */
export async function listStudentAssessments(params: {
  organizationId: string;
  studentId: string;
  gradeId: string | null;
}) {
  let query = supabase
    .from("assessment_definitions")
    .select(ASSESSMENT_SELECT)
    .eq("organization_id", params.organizationId)
    .eq("is_template", false)
    .in("status", [
      "published",
      "open",
      "in_progress",
      "submitted",
      "grading",
      "reviewed",
      "completed",
    ])
    .order("due_at", { ascending: true, nullsFirst: false });
  if (params.gradeId) query = query.or(`grade_id.is.null,grade_id.eq.${params.gradeId}`);

  const [assessments, submissions] = await Promise.all([
    query,
    listSubmissionsForStudents([params.studentId]),
  ]);
  if (assessments.error) throw assessments.error;

  return (assessments.data ?? []).map((assessment) => ({
    assessment,
    attempts: submissions.filter((row) => row.assessment_id === assessment.id),
  }));
}

/** Everything the analytics dashboard needs, in one round trip per table. */
export async function getAssessmentAnalytics(organizationId: string) {
  const [assessments, submissions] = await Promise.all([
    supabase
      .from("assessment_definitions")
      .select(
        "id, title, status, max_score, passing_score, subject:subjects(id, name), type:assessment_types(id, name)",
      )
      .eq("organization_id", organizationId),
    supabase
      .from("assessment_submissions")
      .select("id, assessment_id, status, score, percentage, submitted_at, graded_at, student_id")
      .eq("organization_id", organizationId)
      .limit(1000),
  ]);
  if (assessments.error) throw assessments.error;
  if (submissions.error) throw submissions.error;
  return { assessments: assessments.data ?? [], submissions: submissions.data ?? [] };
}

export function summarizeScores(percentages: number[]) {
  if (percentages.length === 0) {
    return { count: 0, average: 0, median: 0, highest: 0, lowest: 0 };
  }
  const sorted = [...percentages].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return {
    count: sorted.length,
    average: Math.round((sorted.reduce((sum, value) => sum + value, 0) / sorted.length) * 10) / 10,
    median:
      sorted.length % 2 === 0
        ? Math.round(((sorted[middle - 1]! + sorted[middle]!) / 2) * 10) / 10
        : sorted[middle]!,
    highest: sorted[sorted.length - 1]!,
    lowest: sorted[0]!,
  };
}

export const isGradedStatus = (status: SubmissionStatus | string) =>
  status === "graded" || status === "reviewed" || status === "returned";
