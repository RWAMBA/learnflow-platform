import { supabase } from "@/integrations/supabase/client";

/* --------------------------------------------------------------- types */

export const CURRICULUM_STATUSES = ["draft", "review", "published", "archived"] as const;
export type CurriculumStatus = (typeof CURRICULUM_STATUSES)[number];

export const RESOURCE_TYPES = ["pdf", "video", "image", "audio", "link", "document"] as const;
export type ResourceType = (typeof RESOURCE_TYPES)[number];

export const RESOURCE_ENTITIES = ["subject", "strand", "sub_strand", "topic", "lesson"] as const;
export type ResourceEntity = (typeof RESOURCE_ENTITIES)[number];

export const RESOURCE_BUCKET = "curriculum-resources";

export const hierarchyKeys = {
  strands: (subjectId: string) => ["curriculum", "strands", subjectId] as const,
  resources: (entityType: ResourceEntity, entityId: string) =>
    ["curriculum", "resources", entityType, entityId] as const,
  versions: (curriculumId: string | null) => ["curriculum", "versions", curriculumId] as const,
  prerequisites: (lessonId: string) => ["curriculum", "prerequisites", lessonId] as const,
  sequence: (subjectId: string) => ["curriculum", "sequence", subjectId] as const,
  analytics: (organizationId: string | null) =>
    ["curriculum", "analytics", organizationId] as const,
  learningPlan: (studentId: string) => ["curriculum", "learning-plan", studentId] as const,
};

/* ------------------------------------------------------------- strands */

/** Full strand → sub-strand → learning outcome tree for one subject. */
export async function listStrands(subjectId: string) {
  const { data, error } = await supabase
    .from("strands")
    .select(
      "id, title, description, sequence_order, status, authoring_organization_id, subject_id, curriculum_version_id, sub_strands(id, strand_id, title, description, sequence_order, status, authoring_organization_id, learning_outcomes(id, sub_strand_id, description, sequence_order, status, competency_id, authoring_organization_id, competency:competencies(id, name)))",
    )
    .eq("subject_id", subjectId)
    .order("sequence_order");
  if (error) throw error;
  return (data ?? []).map((strand) => ({
    ...strand,
    sub_strands: [...(strand.sub_strands ?? [])]
      .sort((a, b) => a.sequence_order - b.sequence_order)
      .map((sub) => ({
        ...sub,
        learning_outcomes: [...(sub.learning_outcomes ?? [])].sort(
          (a, b) => a.sequence_order - b.sequence_order,
        ),
      })),
  }));
}

export type StrandTree = Awaited<ReturnType<typeof listStrands>>;

/* ----------------------------------------------------------- resources */

export async function listCurriculumResources(entityType: ResourceEntity, entityId: string) {
  const { data, error } = await supabase
    .from("curriculum_resources")
    .select(
      "id, entity_type, entity_id, resource_type, title, description, url, storage_path, organization_id, created_at",
    )
    .eq("entity_type", entityType)
    .eq("entity_id", entityId)
    .order("created_at");
  if (error) throw error;
  return data ?? [];
}

/** Short-lived signed URL for a stored curriculum file. */
export async function getResourceDownloadUrl(storagePath: string) {
  const { data, error } = await supabase.storage
    .from(RESOURCE_BUCKET)
    .createSignedUrl(storagePath, 60 * 10);
  if (error) throw error;
  return data.signedUrl;
}

/** Uploads a file into the tenant-isolated `<organizationId>/…` prefix. */
export async function uploadResourceFile(organizationId: string, file: File) {
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `${organizationId}/${crypto.randomUUID()}-${safeName}`;
  const { error } = await supabase.storage.from(RESOURCE_BUCKET).upload(path, file);
  if (error) throw error;
  return path;
}

/* ------------------------------------------------------------ versions */

export async function listCurriculumVersions(curriculumId: string | null) {
  let query = supabase
    .from("curriculum_versions")
    .select(
      "id, curriculum_id, organization_id, parent_version_id, label, notes, status, published_at, created_at, curriculum:curricula(id, name, code)",
    )
    .order("created_at", { ascending: false });
  if (curriculumId) query = query.eq("curriculum_id", curriculumId);
  const { data, error } = await query;
  if (error) throw error;
  return data ?? [];
}

/* ------------------------------------------------------- sequencing */

export async function listSubjectLessonSequence(subjectId: string) {
  const { data, error } = await supabase
    .from("lessons")
    .select(
      "id, title, sequence_order, status, content_type, estimated_minutes, summary, topic_id, sub_strand_id, learning_outcome_id",
    )
    .eq("subject_id", subjectId)
    .order("sequence_order");
  if (error) throw error;
  return data ?? [];
}

export async function listLessonPrerequisites(lessonId: string) {
  const { data, error } = await supabase
    .from("lesson_prerequisites")
    .select("id, prerequisite_lesson_id, prerequisite:lessons!lesson_prerequisites_prerequisite_lesson_id_fkey(id, title, sequence_order)")
    .eq("lesson_id", lessonId);
  if (error) throw error;
  return data ?? [];
}

export interface LessonNeighbours {
  previous: { id: string; title: string } | null;
  next: { id: string; title: string } | null;
}

export function findLessonNeighbours(
  sequence: { id: string; title: string }[],
  lessonId: string,
): LessonNeighbours {
  const index = sequence.findIndex((lesson) => lesson.id === lessonId);
  if (index === -1) return { previous: null, next: null };
  return {
    previous: index > 0 ? (sequence[index - 1] ?? null) : null,
    next: index < sequence.length - 1 ? (sequence[index + 1] ?? null) : null,
  };
}

/* ------------------------------------------------------ learning plan */

const COMPLETED_LEVELS = ["proficient", "advanced", "mastered"];

export type LessonState = "completed" | "current" | "upcoming" | "locked";

export interface PlannedLesson {
  id: string;
  title: string;
  sequenceOrder: number;
  estimatedMinutes: number | null;
  state: LessonState;
}

export interface PlannedSubject {
  subjectId: string;
  subjectName: string;
  gradeName: string | null;
  lessons: PlannedLesson[];
  completed: number;
  total: number;
  percent: number;
}

/**
 * Ordered lesson progression for a learner: completed lessons, the current
 * lesson, upcoming lessons and lessons locked behind unmet prerequisites.
 */
export async function getStudentLearningPlan(studentId: string) {
  const { data: assignments, error: assignmentError } = await supabase
    .from("student_curriculum_assignments")
    .select("id, status, subject:subjects(id, name, grade:grades(id, name))")
    .eq("student_id", studentId);
  if (assignmentError) throw assignmentError;

  const subjectIds = (assignments ?? [])
    .map((row) => row.subject?.id)
    .filter((id): id is string => Boolean(id));
  if (subjectIds.length === 0) return [] as PlannedSubject[];

  const [lessonsResult, progressResult] = await Promise.all([
    supabase
      .from("lessons")
      .select("id, subject_id, title, sequence_order, status, estimated_minutes")
      .in("subject_id", subjectIds)
      .neq("status", "archived")
      .order("sequence_order"),
    supabase
      .from("progress_records")
      .select("lesson_id, mastery_level")
      .eq("student_id", studentId),
  ]);
  if (lessonsResult.error) throw lessonsResult.error;
  if (progressResult.error) throw progressResult.error;

  const lessons = lessonsResult.data ?? [];
  const lessonIds = lessons.map((lesson) => lesson.id);
  const prerequisites = lessonIds.length
    ? await supabase
        .from("lesson_prerequisites")
        .select("lesson_id, prerequisite_lesson_id")
        .in("lesson_id", lessonIds)
    : { data: [], error: null };
  if (prerequisites.error) throw prerequisites.error;

  const completedIds = new Set(
    (progressResult.data ?? [])
      .filter((row) => row.lesson_id && COMPLETED_LEVELS.includes(row.mastery_level))
      .map((row) => row.lesson_id as string),
  );

  const prereqMap = new Map<string, string[]>();
  for (const row of prerequisites.data ?? []) {
    prereqMap.set(row.lesson_id, [...(prereqMap.get(row.lesson_id) ?? []), row.prerequisite_lesson_id]);
  }

  return (assignments ?? [])
    .filter((row) => row.subject)
    .map((row) => {
      const subject = row.subject!;
      const subjectLessons = lessons.filter((lesson) => lesson.subject_id === subject.id);
      let currentTaken = false;
      const planned: PlannedLesson[] = subjectLessons.map((lesson) => {
        const done = completedIds.has(lesson.id);
        const blocked = (prereqMap.get(lesson.id) ?? []).some((id) => !completedIds.has(id));
        let state: LessonState = "upcoming";
        if (done) state = "completed";
        else if (blocked) state = "locked";
        else if (!currentTaken) {
          state = "current";
          currentTaken = true;
        }
        return {
          id: lesson.id,
          title: lesson.title,
          sequenceOrder: lesson.sequence_order,
          estimatedMinutes: lesson.estimated_minutes,
          state,
        };
      });
      const completed = planned.filter((lesson) => lesson.state === "completed").length;
      return {
        subjectId: subject.id,
        subjectName: subject.name,
        gradeName: subject.grade?.name ?? null,
        lessons: planned,
        completed,
        total: planned.length,
        percent: planned.length === 0 ? 0 : Math.round((completed / planned.length) * 100),
      } satisfies PlannedSubject;
    });
}

/* --------------------------------------------------------- analytics */

export interface CurriculumAnalytics {
  published: number;
  draft: number;
  review: number;
  archived: number;
  strands: number;
  subStrands: number;
  learningOutcomes: number;
  resources: number;
  lessonsCompleted: number;
  masteryCounts: { level: string; count: number }[];
  coveragePercent: number;
}

/** Curriculum coverage + mastery roll-up for the active organization. */
export async function getCurriculumAnalytics(organizationId: string | null): Promise<CurriculumAnalytics> {
  const countLessons = (status: string) => {
    let query = supabase
      .from("lessons")
      .select("id", { count: "exact", head: true })
      .eq("status", status);
    if (organizationId) query = query.eq("authoring_organization_id", organizationId);
    return query;
  };

  const [published, draft, review, archived, strands, subStrands, outcomes, resources, progress] =
    await Promise.all([
      countLessons("published"),
      countLessons("draft"),
      countLessons("review"),
      countLessons("archived"),
      supabase.from("strands").select("id", { count: "exact", head: true }),
      supabase.from("sub_strands").select("id", { count: "exact", head: true }),
      supabase.from("learning_outcomes").select("id", { count: "exact", head: true }),
      supabase.from("curriculum_resources").select("id", { count: "exact", head: true }),
      supabase.from("progress_records").select("mastery_level, lesson_id").limit(2000),
    ]);

  for (const result of [published, draft, review, archived, strands, subStrands, outcomes, resources, progress]) {
    if (result.error) throw result.error;
  }

  const rows = progress.data ?? [];
  const masteryCounts = Object.entries(
    rows.reduce<Record<string, number>>((acc, row) => {
      acc[row.mastery_level] = (acc[row.mastery_level] ?? 0) + 1;
      return acc;
    }, {}),
  ).map(([level, count]) => ({ level, count }));

  const publishedCount = published.count ?? 0;
  const total = publishedCount + (draft.count ?? 0) + (review.count ?? 0);

  return {
    published: publishedCount,
    draft: draft.count ?? 0,
    review: review.count ?? 0,
    archived: archived.count ?? 0,
    strands: strands.count ?? 0,
    subStrands: subStrands.count ?? 0,
    learningOutcomes: outcomes.count ?? 0,
    resources: resources.count ?? 0,
    lessonsCompleted: rows.filter(
      (row) => row.lesson_id && COMPLETED_LEVELS.includes(row.mastery_level),
    ).length,
    masteryCounts,
    coveragePercent: total === 0 ? 0 : Math.round((publishedCount / total) * 100),
  };
}
