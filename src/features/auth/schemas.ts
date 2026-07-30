import { z } from "zod";

export const signInSchema = z.object({
  email: z.string().trim().min(1, "Email is required").email("Enter a valid email address").max(255),
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
});

export const signUpSchema = signInSchema.extend({
  fullName: z.string().trim().min(2, "Enter your full name").max(120),
});

export const requestResetSchema = z.object({
  email: z.string().trim().min(1, "Email is required").email("Enter a valid email address").max(255),
});

export const newPasswordSchema = z
  .object({
    password: z.string().min(8, "Password must be at least 8 characters").max(128),
    confirmPassword: z.string(),
  })
  .refine((values) => values.password === values.confirmPassword, {
    path: ["confirmPassword"],
    message: "Passwords do not match",
  });

export type SignInValues = z.infer<typeof signInSchema>;
export type SignUpValues = z.infer<typeof signUpSchema>;
export type RequestResetValues = z.infer<typeof requestResetSchema>;
export type NewPasswordValues = z.infer<typeof newPasswordSchema>;
