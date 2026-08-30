import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(200),
});

export const mfaCompleteSchema = z
  .object({
    challenge_token: z.string().trim().min(40).max(200),
    code: z
      .string()
      .trim()
      .regex(/^\d{6}$/)
      .optional(),
    recovery_code: z.string().trim().min(16).max(32).optional(),
  })
  .refine((value) => Boolean(value.code) !== Boolean(value.recovery_code), {
    message: "Provide exactly one MFA credential.",
  });

export const forgotPasswordSchema = z.object({
  email: z.string().trim().email().max(254),
});

export const resetPasswordSchema = z.object({
  user_id: z.string().uuid(),
  token: z.string().trim().min(1).max(512),
  new_password: z
    .string()
    .min(8)
    .max(200)
    .regex(/[A-Z]/, "Password must contain an uppercase letter.")
    .regex(/[0-9]/, "Password must contain a number."),
});
