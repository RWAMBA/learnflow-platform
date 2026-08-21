import type { ActiveRole, RoleCode } from "./types";

/**
 * UI-level capability map. Every one of these is mirrored by a database
 * policy — this only decides what is worth rendering.
 */
export const can = {
  manageStudents: (role: RoleCode | undefined) =>
    role === "parent_guardian" || role === "org_admin",
  createRelationships: (role: RoleCode | undefined) =>
    role === "parent_guardian" || role === "org_admin",
  createAssignments: (role: RoleCode | undefined) =>
    role === "teacher" || role === "tutor" || role === "org_admin" || role === "parent_guardian",
  gradeAssignments: (role: RoleCode | undefined) =>
    role === "teacher" || role === "tutor" || role === "org_admin",
  viewOrganizationRollup: (role: RoleCode | undefined) => role === "org_admin",
};

/**
 * Tenant-authored curriculum content is Organization Administrator-only.
 *
 * This is a UI capability helper only. PostgreSQL RLS remains the
 * authoritative authorization boundary.
 */
export const canAuthorTenantCurriculum = (role: RoleCode | undefined) => role === "org_admin";

/**
 * Platform curriculum structure is administered through the separate
 * platform_admins authorization path, not an organization role.
 *
 * This is a UI capability helper only. PostgreSQL RLS remains authoritative.
 */
export const canAuthorPlatformCurriculum = (isPlatformAdmin: boolean) => isPlatformAdmin;

/** Who may attach a subject to a student's learning plan. */
export const canAssignCurriculum = (role: RoleCode | undefined) =>
  role === "teacher" || role === "tutor" || role === "org_admin" || role === "parent_guardian";

/** Assessment authoring: builder, question bank, rubrics, lifecycle changes. */
export const canAuthorAssessments = (role: RoleCode | undefined) =>
  role === "teacher" || role === "tutor" || role === "org_admin";

/** Who may mark submissions and moderate marks. */
export const canGradeAssessments = (role: RoleCode | undefined) =>
  role === "teacher" || role === "tutor" || role === "org_admin";

/** Who may sit an assessment. */
/** Who may sit an assessment. */
export const canTakeAssessments = (role: RoleCode | undefined) => role === "student";

/**
 * Stage 2 — who may author extracurricular programmes and assign instructors.
 * Organization Administrator only; Teachers and Tutors instruct, they do not
 * create programmes or assign themselves.
 */
export const canManageProgrammes = (role: RoleCode | undefined) => role === "org_admin";

/**
 * Who may attempt a programme enrollment. The database narrows this further:
 * a Parent/Guardian must hold full management of that learner, and a
 * Teacher/Tutor must be an assigned instructor *and* already have an active
 * relationship with that same learner.
 */
export const canEnrollInProgrammes = (role: RoleCode | undefined) =>
  role === "org_admin" || role === "parent_guardian" || role === "teacher" || role === "tutor";

/** Who may move a programme enrollment through its lifecycle. */
export const canManageProgrammeEnrollments = (role: RoleCode | undefined) => role === "org_admin";


/** Who may see organization-wide assessment analytics. */
export const canViewAssessmentAnalytics = (role: RoleCode | undefined) =>
  role === "teacher" || role === "tutor" || role === "org_admin";

/**
 * Family tenants merge the administrator widgets into the parent widget set
 * instead of rendering a separate administrator dashboard.
 */
export function usesMergedFamilyDashboard(role: ActiveRole | null) {
  return role?.roleCode === "org_admin" && role.tenantType === "family";
}

export const SENIOR_SECONDARY_MIN_GRADE = 10;

/** Independent student login is limited to senior secondary (grades 10–12). */
export function studentMayLoginIndependently(params: {
  gradeSequence: number | null | undefined;
  organizationAllowsYoungerLogin: boolean;
}) {
  if (params.organizationAllowsYoungerLogin) return true;
  return (params.gradeSequence ?? 0) >= SENIOR_SECONDARY_MIN_GRADE;
}
