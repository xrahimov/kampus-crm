import { z } from "zod";

import { idSchema, passwordSchema } from "./common";
import { GENDERS } from "./students";

/* Sign-in with a Telegram code, the password after it, and the waiting list (A-196). */

/** Which sign-in page the person is on: it decides where they land when a phone is both. */
export const SIGN_IN_DOORS = ["STAFF", "STUDENT"] as const;
export type SignInDoor = (typeof SIGN_IN_DOORS)[number];

/** Any international number: Telegram vouches for it, so Uzbek ones are not the only ones. */
export const signInPhoneSchema = z
  .string()
  .trim()
  .transform((v) => v.replace(/[\s()-]/g, ""))
  .pipe(z.string().regex(/^\+\d{10,15}$/, "validation.phone"));

const door = z.enum(SIGN_IN_DOORS).default("STAFF");

export const passwordSignInSchema = z.object({
  phone: signInPhoneSchema,
  password: passwordSchema,
  door,
});
export type PasswordSignInInput = z.infer<typeof passwordSignInSchema>;

export const codeRequestSchema = z.object({ phone: signInPhoneSchema, door });
export type CodeRequestInput = z.infer<typeof codeRequestSchema>;

export const codeVerifySchema = z.object({
  id: z.string().min(1).max(128),
  code: z
    .string()
    .trim()
    .regex(/^\d{6}$/, "validation.code"),
  door,
});
export type CodeVerifyInput = z.infer<typeof codeVerifySchema>;

/** A password chosen in a session Telegram opened: the old one is not asked for. */
export const setPasswordSchema = z.object({ newPassword: passwordSchema });
export type SetPasswordInput = z.infer<typeof setPasswordSchema>;

/** A student's or parent's password: the current one is needed outside a Telegram session. */
export const studentPasswordSchema = z.object({
  newPassword: passwordSchema,
  currentPassword: z.string().max(128).optional(),
});
export type StudentPasswordInput = z.infer<typeof studentPasswordSchema>;

const name = z.string().trim().min(2, "validation.required").max(120, "validation.tooLong");
const note = z
  .union([z.literal("").transform(() => null), z.null(), z.string().trim().max(300)])
  .optional();

/** The person on the waiting list says who they are and where they study or work. */
export const joinRequestSendSchema = z.object({
  token: z.string().min(20).max(128),
  fullName: name,
  organizationId: idSchema.optional(),
  branchId: idSchema.optional(),
  note,
});
export type JoinRequestSendInput = z.infer<typeof joinRequestSendSchema>;

export const JOIN_REQUEST_TABS = ["PENDING", "DECLINED"] as const;
export type JoinRequestTab = (typeof JOIN_REQUEST_TABS)[number];

/** How a waiting person is let in: as someone new, or as someone the centre already has. */
export const joinRequestApproveSchema = z.discriminatedUnion("mode", [
  z.object({
    mode: z.literal("newStudent"),
    fullName: name,
    branchId: idSchema,
    gender: z.enum(GENDERS).default("MALE"),
    groupId: z.union([z.literal("").transform(() => null), z.null(), idSchema]).optional(),
  }),
  /** The number is an existing student's own. */
  z.object({ mode: z.literal("student"), studentId: idSchema }),
  /** The number belongs to a parent of an existing student. */
  z.object({ mode: z.literal("parent"), studentId: idSchema, fullName: name }),
  z.object({
    mode: z.literal("newStaff"),
    fullName: name,
    branchId: idSchema,
    gender: z.enum(GENDERS).default("MALE"),
    roleCode: z.string().min(1).max(64),
  }),
]);
export type JoinRequestApproveInput = z.infer<typeof joinRequestApproveSchema>;
