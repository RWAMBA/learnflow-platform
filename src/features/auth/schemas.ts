import { z } from "zod";

export const MIN_PASSWORD_LENGTH = 12;

export const strongPassword = z
  .string()
  .min(MIN_PASSWORD_LENGTH, `Password must be at least ${MIN_PASSWORD_LENGTH} characters`)
  .max(128)
  .regex(/[a-z]/, "Include at least one lowercase letter")
  .regex(/[A-Z]/, "Include at least one uppercase letter")
  .regex(/[0-9]/, "Include at least one number")
  .regex(/[^A-Za-z0-9]/, "Include at least one symbol")
  .refine(
    (value) => !/(.)\1{2,}/.test(value),
    "Avoid repeating the same character three or more times",
  );

export const signInSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Email is required")
    .email("Enter a valid email address")
    .max(255),
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
});

export const signUpSchema = signInSchema.extend({
  fullName: z.string().trim().min(2, "Enter your full name").max(120),
  password: strongPassword,
});

export const requestResetSchema = z.object({
  email: z
    .string()
    .trim()
    .min(1, "Email is required")
    .email("Enter a valid email address")
    .max(255),
});

export const newPasswordSchema = z
  .object({
    password: strongPassword,
    confirmPassword: z.string(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });

export type SignInValues = z.infer<typeof signInSchema>;

export const changePasswordSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password").max(128),
    password: strongPassword,
    confirmPassword: z.string(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  })
  .refine((values) => values.password !== values.currentPassword, {
    path: ["password"],
    message: "Choose a password different from your current one",
  });

export type ChangePasswordValues = z.infer<typeof changePasswordSchema>;
export type SignUpValues = z.infer<typeof signUpSchema>;
export type RequestResetValues = z.infer<typeof requestResetSchema>;
export type NewPasswordValues = z.infer<typeof newPasswordSchema>;
