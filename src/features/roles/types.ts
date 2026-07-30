export type RoleCode = "student" | "parent_guardian" | "teacher" | "tutor" | "org_admin";

export const ROLE_LABELS: Record<RoleCode, string> = {
  student: "Student",
  parent_guardian: "Parent/Guardian",
  teacher: "Teacher",
  tutor: "Tutor",
  org_admin: "Organization Administrator",
};

export type TenantType =
  | "family"
  | "independent_tutor"
  | "private_school"
  | "homeschool_academy"
  | "learning_centre"
  | "ngo";

export interface ActiveRole {
  userRoleId: string;
  roleCode: RoleCode;
  roleName: string;
  organizationId: string;
  organizationName: string;
  tenantType: TenantType;
}

export interface ViewerContext {
  userId: string;
  fullName: string;
  isPlatformAdmin: boolean;
  roles: ActiveRole[];
}
