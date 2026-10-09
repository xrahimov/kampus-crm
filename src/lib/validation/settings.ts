import { z } from "zod";

import { idSchema, passwordSchema, phoneSchema } from "./common";

/* Shared by the API routes (server) and the forms (client). Messages are i18n keys. */

const name = z.string().trim().min(1, "validation.required").max(120, "validation.tooLong");
/** Optional free text; an empty form field is stored as "not set". */
const optionalText = z
  .string()
  .trim()
  .max(1000, "validation.tooLong")
  .transform((v) => (v === "" ? undefined : v))
  .optional();

/** "HH:mm", 24-hour. */
export const timeSchema = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "validation.time");

/** "YYYY-MM-DD" calendar date, no time zone. */
export const dateOnlySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, "validation.date")
  .refine((v) => !Number.isNaN(new Date(`${v}T00:00:00Z`).getTime()), "validation.date");

export const SCHEDULE_STEPS = [15, 30] as const;

/** Form amounts arrive as strings or numbers; both are accepted. */
const money = z.coerce.number().min(0, "validation.min").max(9_999_999_999_999, "validation.max");

// --- Organisation settings (EXP §8 "Markaz sozlamalari") ---------------------

/** Days until a debt-collection step runs (A-112); an empty field switches the step off. */
const cadenceDays = z
  .union([
    z.literal("").transform(() => null),
    z.null(),
    z.coerce.number().int("validation.integer").min(0, "validation.min").max(90, "validation.max"),
  ])
  .optional();

/** Public page (A-121): an empty field clears the value. */
const publicText = (max: number) =>
  z
    .union([
      z.literal("").transform(() => null),
      z.null(),
      z.string().trim().max(max, "validation.tooLong"),
    ])
    .optional();
/** The page's address on the server's domain: /c/<slug>, 3 to 40 characters. */
export const PUBLIC_SLUG = /^[a-z0-9](?:[a-z0-9-]{1,38}[a-z0-9])?$/;
const publicSlug = z
  .union([
    z.literal("").transform(() => null),
    z.null(),
    z.string().trim().toLowerCase().regex(PUBLIC_SLUG, "validation.slug"),
  ])
  .optional();
const optionalFormId = z
  .union([z.literal("").transform(() => null), z.null(), idSchema])
  .optional();

export const ORG_SWITCHES = [
  "spreadOverpayment",
  "adminActionsNeedApproval",
  "printReceiptAfterPayment",
  "refundsEnabled",
  "attendanceComments",
  "teachersSeeExamSchedule",
  "attendanceOnlyDuringLesson",
  "teacherSeesSalary",
  "payTeacherOnGroupDayOff",
  "payOnlyAttendedLessons",
  "teacherCanAddStudents",
  "bookAnySupportTeacher",
  "groupSupportSessions",
] as const;
export type OrgSwitch = (typeof ORG_SWITCHES)[number];

const switchFields = Object.fromEntries(ORG_SWITCHES.map((k) => [k, z.boolean()])) as Record<
  OrgSwitch,
  z.ZodBoolean
>;

export const orgSettingsSchema = z
  .object({
    name,
    ...switchFields,
    workStart: timeSchema,
    workEnd: timeSchema,
    scheduleStepMinutes: z.coerce
      .number()
      .refine((v): v is (typeof SCHEDULE_STEPS)[number] => SCHEDULE_STEPS.includes(v as 15 | 30), {
        message: "validation.scheduleStep",
      }),
    debtTelegramDays: cadenceDays,
    debtSmsDays: cadenceDays,
    debtTaskDays: cadenceDays,
    /** Referral programme (A-120): so'm given to the referrer when a friend joins; 0 = coins only. */
    referralBonus: z.coerce
      .number()
      .int("validation.min")
      .min(0, "validation.min")
      .max(99_999_999, "validation.max")
      .default(0),
    /** Public page per centre (A-121). */
    publicPage: z.boolean().default(false),
    publicSlug,
    publicIntro: publicText(1000),
    publicPhone: publicText(30),
    publicAddress: publicText(300),
    publicInstagram: publicText(100),
    publicTelegram: publicText(100),
    publicFormId: optionalFormId,
  })
  .refine((v) => v.workStart < v.workEnd, {
    message: "validation.workHours",
    path: ["workEnd"],
  });
export type OrgSettingsInput = z.infer<typeof orgSettingsSchema>;

// --- Branches -----------------------------------------------------------------

export const branchSchema = z.object({
  name,
  isActive: z.boolean().default(true),
});
export type BranchInput = z.infer<typeof branchSchema>;
export const branchUpdateSchema = branchSchema.partial();

// --- Organisations (site owner only, A-108) -----------------------------------

export const organizationCreateSchema = z.object({
  name,
  /** The centre's branches, at least one; the CEO is attached to all of them. */
  branches: z.array(name).min(1, "validation.required").max(20, "validation.tooLong"),
  ceoFullName: name,
  ceoPhone: phoneSchema,
  /** A first password the site owner passes on; the CEO changes it after signing in. */
  ceoPassword: passwordSchema,
});
export type OrganizationCreateInput = z.infer<typeof organizationCreateSchema>;
/** A centre's own address: a bare host name such as kingston.kampus.uz (A-114). */
const HOSTNAME = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
export const domainSchema = z
  .union([
    z.literal("").transform(() => null),
    z.null(),
    z.string().trim().toLowerCase().regex(HOSTNAME, "validation.domain"),
  ])
  .optional();
/** The same rule for a form field, which keeps the empty string instead of null. */
export const domainFieldSchema = z
  .string()
  .trim()
  .toLowerCase()
  .refine((value) => value === "" || HOSTNAME.test(value), "validation.domain");
export const organizationUpdateSchema = z.object({ name, domain: domainSchema });
export type OrganizationUpdateInput = z.infer<typeof organizationUpdateSchema>;

// --- Payment methods ----------------------------------------------------------

export const paymentMethodSchema = z.object({
  name,
  isActive: z.boolean().default(true),
  sortOrder: z.coerce.number().int().min(0).max(1000).default(0),
});
export type PaymentMethodInput = z.infer<typeof paymentMethodSchema>;
export const paymentMethodUpdateSchema = paymentMethodSchema.partial();

// --- Grading systems ----------------------------------------------------------

export const ROUNDING_TYPES = ["STANDARD", "IELTS"] as const;

export const gradingLevelSchema = z
  .object({
    name: z.string().trim().min(1, "validation.required").max(60, "validation.tooLong"),
    minScore: z.coerce.number().min(0, "validation.min").max(1000, "validation.max"),
    maxScore: z.coerce.number().min(0, "validation.min").max(1000, "validation.max"),
  })
  .refine((l) => l.minScore <= l.maxScore, {
    message: "validation.levelRange",
    path: ["maxScore"],
  });

export const gradingSystemSchema = z.object({
  name,
  rounding: z.enum(ROUNDING_TYPES).default("STANDARD"),
  levels: z
    .array(gradingLevelSchema)
    .min(1, "validation.levelsMin")
    .max(50, "validation.levelsMax"),
});
export type GradingSystemInput = z.infer<typeof gradingSystemSchema>;
export type GradingLevelInput = z.infer<typeof gradingLevelSchema>;

// --- Courses ------------------------------------------------------------------

export const courseSchema = z.object({
  branchId: idSchema,
  name,
  description: optionalText,
  price: money,
  durationMonths: z.coerce.number().int().min(1, "validation.min").max(60, "validation.max"),
  gradingSystemId: idSchema.nullable().optional(),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/, "validation.color")
    .nullable()
    .optional(),
});
export type CourseInput = z.infer<typeof courseSchema>;
export const courseUpdateSchema = courseSchema
  .omit({ branchId: true })
  .extend({ isArchived: z.boolean().optional() })
  .partial();
export type CourseUpdateInput = z.infer<typeof courseUpdateSchema>;

// --- Rooms --------------------------------------------------------------------

export const roomSchema = z.object({
  branchId: idSchema,
  name,
  capacity: z.coerce.number().int().min(1, "validation.min").max(1000, "validation.max"),
});
export type RoomInput = z.infer<typeof roomSchema>;
export const roomUpdateSchema = roomSchema.omit({ branchId: true }).partial();

// --- Days off -----------------------------------------------------------------

export const dayOffSchema = z.object({
  branchId: idSchema,
  date: dateOnlySchema,
  reason: z.string().trim().min(1, "validation.required").max(500, "validation.tooLong"),
  /** Tell the students and parents of that day's groups (A-117). */
  notify: z.boolean().default(true),
});
export type DayOffInput = z.infer<typeof dayOffSchema>;
export const dayOffUpdateSchema = dayOffSchema.omit({ branchId: true }).partial();

// --- Schools ------------------------------------------------------------------

export const schoolSchema = z.object({ name });
export type SchoolInput = z.infer<typeof schoolSchema>;
export const schoolUpdateSchema = schoolSchema.partial();
