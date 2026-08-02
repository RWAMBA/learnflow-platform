import { z } from "zod";

export const relationshipKind = z.enum(["parent", "teacher", "tutor"]);

export const inviteSchema = z.object({
  kind: relationshipKind,
  organizationId: z.string().uuid(),
  studentId: z.string().uuid(),
  inviteeUserId: z.string().uuid(),
  subjectId: z.string().uuid().optional().nullable(),
  roleSubtype: z
    .enum(["biological_parent", "legal_guardian", "foster_parent", "other_guardian"])
    .optional(),
  permissionLevel: z.enum(["full_management", "view_only"]).optional(),
  notes: z.string().trim().max(500).optional(),
});

export const respondSchema = z.object({
  kind: relationshipKind,
  relationshipId: z.string().uuid(),
  accept: z.boolean(),
});

export const setStatusSchema = z.object({
  kind: relationshipKind,
  relationshipId: z.string().uuid(),
  status: z.enum(["active", "suspended", "ended"]),
});

export const TABLE_BY_KIND = {
  parent: "parent_student_relationships",
  teacher: "teacher_student_relationships",
  tutor: "tutor_student_relationships",
} as const;

export const ROLE_CODE_BY_KIND = {
  parent: "parent_guardian",
  teacher: "teacher",
  tutor: "tutor",
} as const;
