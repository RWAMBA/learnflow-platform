/**
 * Stage 2 — Programme reads.
 *
 * Every query runs through the browser client, so the Stage 2 RLS policies
 * decide what comes back. Nothing here authorizes anything; it decides what
 * the UI has to render.
 */
import { supabase } from "@/integrations/supabase/client";
import type { ProgrammeCategory, ProgrammeEnrollmentStatus, ProgrammeStatus } from "./constants";
import { OCCUPYING_ENROLLMENT_STATUSES } from "./constants";

export const programmeKeys = {
  all: ["programmes"] as const,
  list: (organizationId: string | null) => ["programmes", "list", organizationId] as const,
  detail: (programmeId: string | null) => ["programmes", "detail", programmeId] as const,
  instructors: (programmeId: string | null) => ["programmes", "instructors", programmeId] as const,
  enrollments: (programmeId: string | null) => ["programmes", "enrollments", programmeId] as const,
  myLearnerEnrollments: (organizationId: string | null) =>
    ["programmes", "learner-enrollments", organizationId] as const,
  assignableInstructors: (organizationId: string | null) =>
    ["programmes", "assignable-instructors", organizationId] as const,
  enrollableStudents: (organizationId: string | null) =>
    ["programmes", "enrollable-students", organizationId] as const,
  subjects: (organizationId: string | null) => ["programmes", "subjects", organizationId] as const,
};

export interface ProgrammeRow {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  category: ProgrammeCategory;
  subjectId: string | null;
  capacity: number | null;
  scheduleDescription: string | null;
  status: ProgrammeStatus;
  occupied: number;
}

const PROGRAMME_COLUMNS =
  "id, organization_id, name, description, category, subject_id, capacity, schedule_description, status";

function toProgramme(
  row: {
    id: string;
    organization_id: string;
    name: string;
    description: string | null;
    category: string;
    subject_id: string | null;
    capacity: number | null;
    schedule_description: string | null;
    status: string;
  },
  occupied: number,
): ProgrammeRow {
  return {
    id: row.id,
    organizationId: row.organization_id,
    name: row.name,
    description: row.description,
    category: row.category as ProgrammeCategory,
    subjectId: row.subject_id,
    capacity: row.capacity,
    scheduleDescription: row.schedule_description,
    status: row.status as ProgrammeStatus,
    occupied,
  };
}

/**
 * Occupancy is counted from the enrollments the caller may read. A parent who
 * can only see their own child still gets an accurate "is it full" answer from
 * the capacity check in the database when they try to enroll.
 */
async function countOccupancy(programmeIds: string[]) {
  const counts = new Map<string, number>();
  if (programmeIds.length === 0) return counts;
  const { data, error } = await supabase
    .from("programme_enrollments")
    .select("programme_id")
    .in("programme_id", programmeIds)
    .in("status", OCCUPYING_ENROLLMENT_STATUSES);
  if (error) throw new Error(error.message);
  for (const row of data ?? []) {
    counts.set(row.programme_id, (counts.get(row.programme_id) ?? 0) + 1);
  }
  return counts;
}

export async function listProgrammes(organizationId: string | null) {
  if (!organizationId) return [] as ProgrammeRow[];
  const { data, error } = await supabase
    .from("programmes")
    .select(PROGRAMME_COLUMNS)
    .eq("organization_id", organizationId)
    .order("name");
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  const counts = await countOccupancy(rows.map((row) => row.id));
  return rows.map((row) => toProgramme(row, counts.get(row.id) ?? 0));
}

export async function getProgramme(programmeId: string | null) {
  if (!programmeId) return null;
  const { data, error } = await supabase
    .from("programmes")
    .select(PROGRAMME_COLUMNS)
    .eq("id", programmeId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) return null;
  const counts = await countOccupancy([data.id]);
  return toProgramme(data, counts.get(data.id) ?? 0);
}

/* ------------------------------------------------------------ instructors */

export interface ProgrammeInstructorRow {
  id: string;
  userRoleId: string;
  userId: string;
  fullName: string;
  roleCode: string;
  status: "active" | "ended";
  assignedAt: string;
  endedAt: string | null;
}

export async function listProgrammeInstructors(programmeId: string | null) {
  if (!programmeId) return [] as ProgrammeInstructorRow[];
  const { data, error } = await supabase
    .from("programme_instructors")
    .select("id, user_role_id, status, assigned_at, ended_at")
    .eq("programme_id", programmeId)
    .order("assigned_at", { ascending: false });
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  if (rows.length === 0) return [] as ProgrammeInstructorRow[];

  const roles = await supabase
    .from("user_roles")
    .select("id, user_id, role:roles!inner(code)")
    .in(
      "id",
      rows.map((row) => row.user_role_id),
    );
  if (roles.error) throw new Error(roles.error.message);

  const roleById = new Map(
    (roles.data ?? []).map((role) => [
      role.id,
      { userId: role.user_id, code: (role.role as { code: string }).code },
    ]),
  );

  const userIds = [...new Set([...roleById.values()].map((entry) => entry.userId))];
  const profiles = await supabase.from("profiles").select("id, full_name").in("id", userIds);
  if (profiles.error) throw new Error(profiles.error.message);
  const nameById = new Map((profiles.data ?? []).map((row) => [row.id, row.full_name]));

  return rows.map((row) => {
    const role = roleById.get(row.user_role_id);
    return {
      id: row.id,
      userRoleId: row.user_role_id,
      userId: role?.userId ?? "",
      fullName: (role ? nameById.get(role.userId) : null) ?? "Unnamed instructor",
      roleCode: role?.code ?? "teacher",
      status: row.status as "active" | "ended",
      assignedAt: row.assigned_at,
      endedAt: row.ended_at,
    } satisfies ProgrammeInstructorRow;
  });
}

export interface AssignableInstructor {
  userRoleId: string;
  fullName: string;
  roleCode: string;
}

export async function listAssignableInstructors(organizationId: string | null) {
  if (!organizationId) return [] as AssignableInstructor[];
  const { data, error } = await supabase
    .from("user_roles")
    .select("id, user_id, role:roles!inner(code)")
    .eq("organization_id", organizationId)
    .eq("status", "active")
    .in("roles.code", ["teacher", "tutor"]);
  if (error) throw new Error(error.message);
  const rows = data ?? [];
  if (rows.length === 0) return [] as AssignableInstructor[];

  const profiles = await supabase
    .from("profiles")
    .select("id, full_name")
    .in(
      "id",
      rows.map((row) => row.user_id),
    );
  if (profiles.error) throw new Error(profiles.error.message);
  const nameById = new Map((profiles.data ?? []).map((row) => [row.id, row.full_name]));

  return rows
    .map((row) => ({
      userRoleId: row.id,
      fullName: nameById.get(row.user_id) ?? "Unnamed educator",
      roleCode: (row.role as { code: string }).code,
    }))
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
}

/* ----------------------------------------------------------- enrollments */

export interface ProgrammeEnrollmentRow {
  id: string;
  programmeId: string;
  programmeName: string;
  studentId: string;
  studentName: string;
  status: ProgrammeEnrollmentStatus;
  enrolledAt: string;
}

async function decorateEnrollments(
  rows: {
    id: string;
    programme_id: string;
    student_id: string;
    status: string;
    enrolled_at: string;
  }[],
) {
  if (rows.length === 0) return [] as ProgrammeEnrollmentRow[];

  const students = await supabase
    .from("students")
    .select("id, first_name, last_name")
    .in(
      "id",
      rows.map((row) => row.student_id),
    );
  if (students.error) throw new Error(students.error.message);
  const studentById = new Map(
    (students.data ?? []).map((row) => [row.id, `${row.first_name} ${row.last_name}`.trim()]),
  );

  const programmes = await supabase
    .from("programmes")
    .select("id, name")
    .in("id", [...new Set(rows.map((row) => row.programme_id))]);
  if (programmes.error) throw new Error(programmes.error.message);
  const programmeById = new Map((programmes.data ?? []).map((row) => [row.id, row.name]));

  return rows.map((row) => ({
    id: row.id,
    programmeId: row.programme_id,
    programmeName: programmeById.get(row.programme_id) ?? "Programme",
    studentId: row.student_id,
    studentName: studentById.get(row.student_id) ?? "Learner",
    status: row.status as ProgrammeEnrollmentStatus,
    enrolledAt: row.enrolled_at,
  }));
}

export async function listProgrammeEnrollments(programmeId: string | null) {
  if (!programmeId) return [] as ProgrammeEnrollmentRow[];
  const { data, error } = await supabase
    .from("programme_enrollments")
    .select("id, programme_id, student_id, status, enrolled_at")
    .eq("programme_id", programmeId)
    .order("enrolled_at", { ascending: false });
  if (error) throw new Error(error.message);
  return decorateEnrollments(data ?? []);
}

/** Every programme enrollment the caller is permitted to see in this tenant. */
export async function listVisibleProgrammeEnrollments(organizationId: string | null) {
  if (!organizationId) return [] as ProgrammeEnrollmentRow[];
  const { data, error } = await supabase
    .from("programme_enrollments")
    .select("id, programme_id, student_id, status, enrolled_at")
    .eq("organization_id", organizationId)
    .order("enrolled_at", { ascending: false });
  if (error) throw new Error(error.message);
  return decorateEnrollments(data ?? []);
}

/* -------------------------------------------------------------- pickers */

export async function listEnrollableStudents(organizationId: string | null) {
  if (!organizationId) return [] as { id: string; name: string }[];
  const { data, error } = await supabase
    .from("students")
    .select("id, first_name, last_name")
    .eq("organization_id", organizationId)
    .order("first_name");
  if (error) throw new Error(error.message);
  return (data ?? []).map((row) => ({
    id: row.id,
    name: `${row.first_name} ${row.last_name}`.trim(),
  }));
}

/** Published school-level subjects a programme may optionally be linked to. */
export async function listLinkableSubjects(organizationId: string | null) {
  if (!organizationId) return [] as { id: string; name: string }[];
  const { data, error } = await supabase
    .from("subjects")
    .select("id, name, authoring_organization_id")
    .eq("status", "published")
    .order("name");
  if (error) throw new Error(error.message);
  return (data ?? [])
    .filter(
      (row) =>
        row.authoring_organization_id === null || row.authoring_organization_id === organizationId,
    )
    .map((row) => ({ id: row.id, name: row.name }));
}
