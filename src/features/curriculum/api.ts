import { supabase } from "@/integrations/supabase/client";

export const curriculumKeys = {
  grades: (curriculumId: string | null) => ["grades", curriculumId] as const,
  grade: (gradeId: string) => ["grade", gradeId] as const,
  subject: (subjectId: string) => ["subject", subjectId] as const,
  lesson: (lessonId: string) => ["lesson", lessonId] as const,
  allSubjects: () => ["subjects", "all"] as const,
};

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
      .select("id, name, sequence_order, pathway_required")
      .eq("id", gradeId)
      .maybeSingle(),
    supabase.from("pathways").select("id, name").eq("grade_id", gradeId).order("name"),
    supabase
      .from("subjects")
      .select("id, name, code, pathway_id")
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

export async function getSubjectWithLessons(subjectId: string) {
  const [subjectResult, lessonsResult, competenciesResult] = await Promise.all([
    supabase
      .from("subjects")
      .select("id, name, code, grade:grades(id, name), pathway:pathways(id, name)")
      .eq("id", subjectId)
      .maybeSingle(),
    supabase
      .from("lessons")
      .select("id, title, sequence_order, content_type")
      .eq("subject_id", subjectId)
      .order("sequence_order"),
    supabase.from("competencies").select("id, name, description").eq("subject_id", subjectId),
  ]);
  if (subjectResult.error) throw subjectResult.error;
  if (lessonsResult.error) throw lessonsResult.error;
  if (competenciesResult.error) throw competenciesResult.error;
  return {
    subject: subjectResult.data,
    lessons: lessonsResult.data ?? [],
    competencies: competenciesResult.data ?? [],
  };
}

export async function getLesson(lessonId: string) {
  const { data, error } = await supabase
    .from("lessons")
    .select(
      "id, title, sequence_order, content_type, content_body, storage_path, subject:subjects(id, name, grade:grades(id, name))",
    )
    .eq("id", lessonId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function listAllSubjects() {
  const { data, error } = await supabase
    .from("subjects")
    .select("id, name, grade:grades(id, name, sequence_order)")
    .order("name");
  if (error) throw error;
  return data;
}
