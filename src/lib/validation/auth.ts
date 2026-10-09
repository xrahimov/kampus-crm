import { z } from "zod";

import { idSchema, passwordSchema, phoneSchema } from "./common";

export const loginSchema = z.object({
  phone: phoneSchema,
  password: passwordSchema,
});
export type LoginInput = z.infer<typeof loginSchema>;

export const activeBranchSchema = z.object({
  branchId: idSchema.nullable(),
});
export type ActiveBranchInput = z.infer<typeof activeBranchSchema>;

// --- Account safety (A-124) --------------------------------------------------

/** The second step of a sign-in: nothing, or a one-time code sent to the person's Telegram chat. */
export const SIGN_IN_CODES = ["OFF", "TELEGRAM"] as const;
export type SignInCode = (typeof SIGN_IN_CODES)[number];

export const verifyCodeSchema = z.object({
  challengeId: z.string().min(1).max(128),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "validation.code"),
});
export type VerifyCodeInput = z.infer<typeof verifyCodeSchema>;

export const changePasswordSchema = z.object({
  currentPassword: z.string().min(1, "validation.required").max(128),
  newPassword: passwordSchema,
});
export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;

export const accountSchema = z.object({
  signInCode: z.enum(SIGN_IN_CODES),
});
export type AccountInput = z.infer<typeof accountSchema>;
