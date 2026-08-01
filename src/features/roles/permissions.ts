import type { ActiveRole, RoleCode } from "./types";

/**
 * UI-level capability map. Every one of these is mirrored by a database
 * policy — this only decides what is worth rendering.
 */
export const can = {
  manageStudents: (role: RoleCode | undefined) => role === "parent_guardian" || role === "org_admin",
  createRelationships: (role: RoleCode | undefined) =>
    role === "parent_guardian" || role === "org_admin",
  createAssignments: (role: RoleCode | undefined) =>
    role === "teacher" || role === "tutor" || role === "org_admin" || role === "parent_guardian",
  gradeAssignments: (role: RoleCode | undefined) =>
    role === "teacher" || role === "tutor" || role === "org_admin",
  viewOrganizationRollup: (role: RoleCode | undefined) => role === "org_admin",
};

/** Curriculum authoring is limited to educators and organization admins. */
export const canAuthorCurriculum = (role: RoleCode | undefined) =>
  role === "teacher" || role === "tutor" || role === "org_admin";

/** Who may attach a subject to a student's learning plan. */
export const canAssignCurriculum = (role: RoleCode | undefined) =>
  role === "teacher" || role === "tutor" || role === "org_admin" || role === "parent_guardian";

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
