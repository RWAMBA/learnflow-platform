import { supabase } from "@/integrations/supabase/client";

export type PublishStatus = "draft" | "published" | "archived";

export const curriculumKeys = {
  curricula: () => ["curricula"] as const,
  grades: (curriculumId: string | null) => ["grades", curriculumId] as const,
  grade: (gradeId: string) => ["grade", gradeId] as const,
  subject: (subjectId: string) => ["subject", subjectId] as const,
  lesson: (lessonId: string) => ["lesson", lessonId] as const,
  allSubjects: () => ["subjects", "all"] as const,
  stats: (organizationId: string) => ["curriculum", "stats", organizationId] as const,
  search: (params: unknown) => ["curriculum", "search", params] as const,
  pathways: (gradeId: string) => ["curriculum", "pathways", gradeId] as const,
  progress: (studentId: string) => ["curriculum", "progress", studentId] as const,
  lessonProgress: (studentId: string, lessonId: string) =>
    ["curriculum", "progress", studentId, lessonId] as const,
  studentAssignments: (studentId: string) =>
    ["curriculum", "student-assignments", studentId] as const,
  subjectAssignments: (subjectId: string) =>
    ["curriculum", "subject-assignments", subjectId] as const,
};

export const MASTERY_LEVELS = [
  "not_started",
  "emerging",
  "developing",
  "proficient",
  "mastered",
] as const;
export type MasteryLevel = (typeof MASTERY_LEVELS)[number];

/** Mastery levels that count a lesson as complete for progress percentages. */
const COMPLETED_LEVELS: string[] = ["proficient", "mastered"];

export async function listCurricula() {
  const { data, error } = await supabase.from("curricula").select("id, code, name").order("name");
  if (error) throw error;
  return data;
}

export async function listGrades(curriculumId: string | null) {
  let query = supabase
    .from("grades")
    .select("id, name, sequence_order, pathway_required, curriculum_id")
    .order("sequence_order");
  if (curriculumId) query = query.eq("curriculum_id", curriculumId);
  const { data, error } = await query;
  if (error) throw error;
  return data;
}

export async function getGradeWithContent(gradeId: string) {
  const [gradeResult, pathwaysResult, subjectsResult] = await Promise.all([
    supabase
      .from("grades")
      .select("id, name, sequence_order, pathway_required, curriculum:curricula(id, name)")
      .eq("id", gradeId)
      .maybeSingle(),
    supabase
      .from("pathways")
      .select("id, name, description, status, authoring_organization_id, published_at")
      .eq("grade_id", gradeId)
      .order("name"),
    supabase
      .from("subjects")
      .select("id, name, code, description, status, pathway_id, authoring_organization_id")
      .eq("grade_id", gradeId)
      .order("name"),
  ]);
  if (gradeResult.error) throw gradeResult.error;
  if (pathwaysResult.error) throw pathwaysResult.error;
  if (subjectsResult.error) throw subjectsResult.error;
  return {
    grade: gradeResult.data,
    pathways: pathwaysResult.data ?? [],
    subjects: subjectsResult.data ?? [],
  };
}

/** Subject with its topic → lesson hierarchy, competencies and objectives count. */
export async function getSubjectWithContent(subjectId: string) {
  const [subjectResult, topicsResult, lessonsResult, competenciesResult] = await Promise.all([
    supabase
      .from("subjects")
      .select(
        "id, name, code, description, status, authoring_organization_id, grade:grades!subjects_grade_id_fkey(id, name), pathway:pathways!subjects_pathway_id_fkey(id, name)",
      )
      .eq("id", subjectId)
      .maybeSingle(),
    supabase
      .from("topics")
      .select("id, title, description, sequence_order, status, authoring_organization_id")
      .eq("subject_id", subjectId)
      .order("sequence_order"),
    supabase
      .from("lessons")
      .select(
        "id, title, sequence_order, content_type, status, topic_id, author_type, authoring_organization_id",
      )
      .eq("subject_id", subjectId)
      .order("sequence_order"),
    supabase.from("competencies").select("id, name, description").eq("subject_id", subjectId),
  ]);
  if (subjectResult.error) throw subjectResult.error;
  if (topicsResult.error) throw topicsResult.error;
  if (lessonsResult.error) throw lessonsResult.error;
  if (competenciesResult.error) throw competenciesResult.error;
  return {
    subject: subjectResult.data,
    topics: topicsResult.data ?? [],
    lessons: lessonsResult.data ?? [],
    competencies: competenciesResult.data ?? [],
  };
}

/** Kept for existing callers that only need the flat lesson list. */
export async function getSubjectWithLessons(subjectId: string) {
  const result = await getSubjectWithContent(subjectId);
  return { subject: result.subject, lessons: result.lessons, competencies: result.competencies };
}

export async function getLesson(lessonId: string) {
  const [lessonResult, objectivesResult] = await Promise.all([
    supabase
      .from("lessons")
      .select(
        "id, title, sequence_order, content_type, content_body, storage_path, status, published_at, topic_id, summary, estimated_minutes, sub_strand_id, learning_outcome_id, author_type, authoring_organization_id, topic:topics(id, title), subject:subjects(id, name, grade:grades!subjects_grade_id_fkey(id, name))",
      )
      .eq("id", lessonId)
      .maybeSingle(),
    supabase
      .from("learning_objectives")
      .select("id, description, sequence_order, competency_id, competency:competencies(id, name)")
      .eq("lesson_id", lessonId)
      .order("sequence_order"),
  ]);
  if (lessonResult.error) throw lessonResult.error;
  if (objectivesResult.error) throw objectivesResult.error;
  return { lesson: lessonResult.data, objectives: objectivesResult.data ?? [] };
}

export async function listAllSubjects() {
  const { data, error } = await supabase
    .from("subjects")
    .select("id, name, grade:grades!subjects_grade_id_fkey(id, name, sequence_order)")
    .order("name");
  if (error) throw error;
  return data;
}

export interface CurriculumSearchParams {
  term: string;
  gradeId: string | null;
  status: PublishStatus | "all";
  contentType: string | "all";
  page: number;
  pageSize: number;
}

/** Paginated lesson search used by the curriculum dashboard. */
export async function searchLessons(params: CurriculumSearchParams) {
  const from = (params.page - 1) * params.pageSize;
  let query = supabase
    .from("lessons")
    .select(
      "id, title, status, content_type, sequence_order, subject:subjects!inner(id, name, grade_id, grade:grades!subjects_grade_id_fkey(id, name))",
      { count: "exact" },
    )
    .order("title");

  const term = params.term.trim();
  if (term) query = query.ilike("title", `%${term.replace(/[%_]/g, "")}%`);
  if (params.gradeId) query = query.eq("subjects.grade_id", params.gradeId);
  if (params.status !== "all") query = query.eq("status", params.status);
  if (params.contentType !== "all") query = query.eq("content_type", params.contentType);

  const { data, error, count } = await query.range(from, from + params.pageSize - 1);
  if (error) throw error;
  return { rows: data ?? [], total: count ?? 0 };
}

export async function getCurriculumStats(organizationId: string | null) {
  const [grades, subjects, topics, lessons, drafts, orgLessons] = await Promise.all([
    supabase.from("grades").select("id", { count: "exact", head: true }),
    supabase.from("subjects").select("id", { count: "exact", head: true }),
    supabase.from("topics").select("id", { count: "exact", head: true }),
    supabase.from("lessons").select("id", { count: "exact", head: true }),
    supabase.from("lessons").select("id", { count: "exact", head: true }).eq("status", "draft"),
    organizationId
      ? supabase
          .from("lessons")
          .select("id", { count: "exact", head: true })
          .eq("authoring_organization_id", organizationId)
      : Promise.resolve({ count: 0, error: null }),
  ]);
  for (const result of [grades, subjects, topics, lessons, drafts, orgLessons]) {
    if (result.error) throw result.error;
  }
  return {
    grades: grades.count ?? 0,
    subjects: subjects.count ?? 0,
    topics: topics.count ?? 0,
    lessons: lessons.count ?? 0,
    drafts: drafts.count ?? 0,
    orgLessons: orgLessons.count ?? 0,
  };
}

export async function listStudentCurriculumAssignments(studentId: string) {
  const { data, error } = await supabase
    .from("student_curriculum_assignments")
    .select(
      "id, status, notes, created_at, subject:subjects(id, name, status, grade:grades!subjects_grade_id_fkey(id, name))",
    )
    .eq("student_id", studentId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

export async function listSubjectAssignments(subjectId: string) {
  const { data, error } = await supabase
    .from("student_curriculum_assignments")
    .select("id, status, notes, student:students(id, first_name, last_name)")
    .eq("subject_id", subjectId)
    .order("created_at", { ascending: false });
  if (error) throw error;
  return data ?? [];
}

/* ------------------------------------------------------------- pathways */

export async function listPathways(gradeId: string) {
  const { data, error } = await supabase
    .from("pathways")
    .select("id, name, description, status, grade_id, authoring_organization_id, published_at")
    .eq("grade_id", gradeId)
    .order("name");
  if (error) throw error;
  return data ?? [];
}

/* --------------------------------------------------------------- search */

export type CurriculumKind = "subject" | "topic" | "lesson";

export interface CurriculumSearchAllParams {
  term: string;
  gradeId: string | null;
  status: PublishStatus | "all";
  contentType: string | "all";
  kinds: CurriculumKind[];
  page: number;
  pageSize: number;
}

export interface CurriculumSearchRow {
  kind: string;
  id: string;
  title: string;
  subtitle: string | null;
  status: string;
  content_type: string | null;
  subject_id: string;
  grade_id: string;
  grade_name: string | null;
  total_count: number;
}

/**
 * Unified full-text search across subjects, topics and lessons.
 * Backed by the `search_curriculum` SQL function (RLS applies as the caller).
 */
export async function searchCurriculum(params: CurriculumSearchAllParams) {
  const kinds = params.kinds.length > 0 ? params.kinds : (["subject", "topic", "lesson"] as const);
  const { data, error } = await supabase.rpc("search_curriculum", {
    p_term: params.term.trim(),
    p_grade_id: params.gradeId ?? undefined,
    p_status: params.status === "all" ? undefined : params.status,
    p_content_type: params.contentType === "all" ? undefined : params.contentType,
    p_kinds: [...kinds],
    p_limit: params.pageSize,
    p_offset: (params.page - 1) * params.pageSize,
  });
  if (error) throw error;
  const rows = (data ?? []) as CurriculumSearchRow[];
  return { rows, total: rows[0]?.total_count ?? 0 };
}

/* ------------------------------------------------------------- progress */

export async function listStudentProgress(studentId: string) {
  const { data, error } = await supabase
    .from("progress_records")
    .select(
      "id, mastery_level, recorded_at, notes, lesson_id, competency_id, learning_objective_id, lesson:lessons(id, title, subject_id), competency:competencies(id, name), objective:learning_objectives(id, description)",
    )
    .eq("student_id", studentId)
    .order("recorded_at", { ascending: false })
    .limit(500);
  if (error) throw error;
  return data ?? [];
}

export interface SubjectProgress {
  subjectId: string;
  subjectName: string;
  gradeName: string | null;
  totalLessons: number;
  completedLessons: number;
  percent: number;
}

/**
 * Per-subject completion for a student, derived from their curriculum
 * assignments and the progress records captured against lessons.
 * This is the data capture point future assessments will feed into.
 */
export async function getStudentProgressOverview(studentId: string) {
  const assignments = await listStudentCurriculumAssignments(studentId);
  const subjectIds = assignments
    .map((row) => row.subject?.id)
    .filter((id): id is string => Boolean(id));

  if (subjectIds.length === 0) {
    return { subjects: [] as SubjectProgress[], records: await listStudentProgress(studentId) };
  }

  const [lessonsResult, records] = await Promise.all([
    supabase.from("lessons").select("id, subject_id, status").in("subject_id", subjectIds),
    listStudentProgress(studentId),
  ]);
  if (lessonsResult.error) throw lessonsResult.error;

  const completedLessonIds = new Set(
    records
      .filter((record) => record.lesson_id && COMPLETED_LEVELS.includes(record.mastery_level))
      .map((record) => record.lesson_id as string),
  );

  const subjects: SubjectProgress[] = assignments
    .filter((row) => row.subject)
    .map((row) => {
      const subjectLessons = (lessonsResult.data ?? []).filter(
        (lesson) => lesson.subject_id === row.subject!.id && lesson.status !== "archived",
      );
      const completed = subjectLessons.filter((lesson) => completedLessonIds.has(lesson.id)).length;
      return {
        subjectId: row.subject!.id,
        subjectName: row.subject!.name,
        gradeName: row.subject!.grade?.name ?? null,
        totalLessons: subjectLessons.length,
        completedLessons: completed,
        percent:
          subjectLessons.length === 0 ? 0 : Math.round((completed / subjectLessons.length) * 100),
      };
    });

  return { subjects, records };
}

/** Latest progress record for one student on one lesson. */
export async function getLessonProgress(studentId: string, lessonId: string) {
  const { data, error } = await supabase
    .from("progress_records")
    .select("id, mastery_level, recorded_at, notes")
    .eq("student_id", studentId)
    .eq("lesson_id", lessonId)
    .order("recorded_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  return data;
}
