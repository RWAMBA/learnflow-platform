import { supabase } from "@/integrations/supabase/client";

export type AssignmentStatus = "not_started" | "in_progress" | "submitted" | "graded" | "overdue";

export const assignmentKeys = {
  list: (scope: string) => ["assignments", scope] as const,
  detail: (assignmentId: string) => ["assignment", assignmentId] as const,
  forStudent: (studentId: string) => ["assignments", "student", studentId] as const,
  lessons: (scope: string) => ["assignments", "lessons", scope] as const,
};

const ASSIGNMENT_SELECT =
  "id, status, due_at, instructions, created_at, lesson:lessons(id, title, subject:subjects(id, name)), student:students(id, first_name, last_name, organization_id)";

export async function listAssignmentsForStudents(studentIds: string[]) {
  if (studentIds.length === 0) return [];
  const { data, error } = await supabase
    .from("assignments")
    .select(ASSIGNMENT_SELECT)
    .in("student_id", studentIds)
    .order("due_at", { ascending: true, nullsFirst: false });
  if (error) throw error;
  return data;
}

export async function listAssignmentsForOrganization(organizationId: string) {
  const { data: students, error: studentsError } = await supabase
    .from("students")
    .select("id")
    .eq("organization_id", organizationId);
  if (studentsError) throw studentsError;
  return listAssignmentsForStudents((students ?? []).map((student) => student.id));
}

export async function getAssignment(assignmentId: string) {
  const { data, error } = await supabase
    .from("assignments")
    .select(
      `${ASSIGNMENT_SELECT}, assessments(id, result, graded_at, graded_by_user_role_id)`,
    )
    .eq("id", assignmentId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function createAssignment(input: {
  lessonId: string;
  studentId: string;
  createdByUserRoleId: string;
  dueAt: string | null;
  instructions: string | null;
}) {
  const { data, error } = await supabase
    .from("assignments")
    .insert({
      lesson_id: input.lessonId,
      student_id: input.studentId,
      created_by_user_role_id: input.createdByUserRoleId,
      due_at: input.dueAt,
      instructions: input.instructions,
    })
    .select("id")
    .single();
  if (error) throw error;
  return data;
}

export async function updateAssignmentStatus(assignmentId: string, status: AssignmentStatus) {
  const { error } = await supabase.from("assignments").update({ status }).eq("id", assignmentId);
  if (error) throw error;
}

export async function listProgressForStudent(studentId: string) {
  const { data, error } = await supabase
    .from("progress_records")
    .select("id, mastery_level, recorded_at, competency:competencies(id, name, subject:subjects(id, name))")
    .eq("student_id", studentId)
    .order("recorded_at", { ascending: false });
  if (error) throw error;
  return data;
}

/** Published lessons that may be handed out as work. */
export async function listAssignableLessons() {
  const { data, error } = await supabase
    .from("lessons")
    .select("id, title, content_type, subject:subjects(id, name)")
    .eq("status", "published")
    .order("title")
    .limit(500);
  if (error) throw error;
  return data;
}

/** Competencies attached to the subject a lesson belongs to (rubric rows). */
export async function listCompetenciesForSubject(subjectId: string | null | undefined) {
  if (!subjectId) return [];
  const { data, error } = await supabase
    .from("competencies")
    .select("id, name, description")
    .eq("subject_id", subjectId)
    .order("name");
  if (error) throw error;
  return data;
}
