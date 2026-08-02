import { z } from "zod";

export const organizationSettingsSchema = z.object({
  organizationId: z.string().uuid(),
  name: z.string().trim().min(2).max(120),
  timezone: z.string().trim().min(1).max(64),
  defaultCurrency: z.string().trim().length(3),
  defaultLocale: z.string().trim().min(2).max(10),
  openEnrollment: z.boolean(),
  youngerStudentIndependentLogin: z.boolean(),
});

export const memberRoleStatusSchema = z.object({
  organizationId: z.string().uuid(),
  userRoleId: z.string().uuid(),
  status: z.enum(["active", "suspended", "revoked"]),
});

export const grantRoleSchema = z.object({
  organizationId: z.string().uuid(),
  userId: z.string().uuid(),
  roleId: z.string().uuid(),
});
