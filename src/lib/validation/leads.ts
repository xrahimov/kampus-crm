import { z } from "zod";

import { idSchema, phoneSchema } from "./common";
import { MEMBERSHIP_STATUSES } from "./groups";
import { dateOnlySchema, timeSchema } from "./settings";

/* Leads (EXP §2, §3, §8 Forms). Messages are i18n keys. */

export const LEAD_STATUSES = ["NEW", "CONTACTED", "UNREACHABLE", "LOST"] as const;
export type LeadStatus = (typeof LEAD_STATUSES)[number];
export const LEAD_TEMPERATURES = ["HOT", "WARM", "COLD"] as const;
export type LeadTemperature = (typeof LEAD_TEMPERATURES)[number];
export const LEAD_DAYS = ["ODD", "EVEN", "OTHER"] as const;
export type LeadDays = (typeof LEAD_DAYS)[number];

const name = z.string().trim().min(1, "validation.required").max(120, "validation.tooLong");
const text = (max: number) => z.string().trim().max(max, "validation.tooLong");
const blankToNull = <T extends z.ZodTypeAny>(schema: T) =>
  z.union([z.literal("").transform(() => null), z.null(), schema]).optional();
const optionalId = blankToNull(idSchema);
const optionalDate = blankToNull(dateOnlySchema);
const optionalTime = blankToNull(timeSchema);
const optionalAge = blankToNull(
  z.coerce.number().int().min(1, "validation.min").max(120, "validation.max"),
);

export const leadBoardSchema = z.object({ name });
export type LeadBoardInput = z.infer<typeof leadBoardSchema>;

export const leadColumnSchema = z.object({ name: name.max(60, "validation.tooLong") });
export type LeadColumnInput = z.infer<typeof leadColumnSchema>;

/** The "Yangi Lid" dialog: every field optional except the name and the column. */
export const leadSchema = z.object({
  columnId: idSchema,
  fullName: name,
  /** Several numbers ("+ Telefon raqam qo'shish"); blanks are dropped. */
  phones: z
    .array(z.union([z.literal(""), z.literal("+998"), phoneSchema]))
    .max(5, "validation.max")
    .default([])
    .transform((list) => list.filter((p) => p !== "" && p !== "+998")),
  birthDate: optionalDate,
  age: optionalAge,
  sourceId: optionalId,
  teacherId: optionalId,
  /** The student whose invite brought the lead (A-120). */
  referrerId: optionalId,
  days: blankToNull(z.enum(LEAD_DAYS)),
  lessonTime: optionalTime,
  status: z.enum(LEAD_STATUSES).default("NEW"),
  temperature: blankToNull(z.enum(LEAD_TEMPERATURES)),
  comment: text(2000).nullable().optional(),
});
export type LeadInput = z.infer<typeof leadSchema>;

export const leadUpdateSchema = leadSchema.partial();
export type LeadUpdateInput = z.infer<typeof leadUpdateSchema>;

/** Drop on another column, optionally before a given lead. */
export const leadMoveSchema = z.object({
  columnId: idSchema,
  beforeLeadId: idSchema.nullable().optional(),
});
export type LeadMoveInput = z.infer<typeof leadMoveSchema>;

export const leadFilterSchema = z.object({
  boardId: idSchema.optional(),
  q: z.string().trim().max(200).optional(),
  lessonTime: timeSchema.optional(),
  teacherId: idSchema.optional(),
  days: z.enum(LEAD_DAYS).optional(),
  archived: z.coerce.boolean().optional(),
});
export type LeadFilters = z.infer<typeof leadFilterSchema>;

/** "LIDLARNI GURUHGA QO'SHISH": the selected leads become students of one group. */
export const leadsToGroupSchema = z.object({
  leadIds: z.array(idSchema).min(1, "validation.leadsMin").max(100, "validation.max"),
  groupId: idSchema,
  joinedAt: dateOnlySchema,
  status: z.enum(MEMBERSHIP_STATUSES).default("NEW"),
});
export type LeadsToGroupInput = z.infer<typeof leadsToGroupSchema>;

/** "Lidlarga qaytarish" on a group member. */
export const toLeadSchema = z.object({
  boardId: optionalId,
  columnId: optionalId,
  reason: text(500).nullable().optional(),
});
export type ToLeadInput = z.infer<typeof toLeadSchema>;

export const leadSourceSchema = z.object({
  name: name.max(60, "validation.tooLong"),
  isActive: z.boolean().default(true),
});
export type LeadSourceInput = z.infer<typeof leadSourceSchema>;

export const sourceStatsSchema = z.object({
  from: dateOnlySchema.optional(),
  to: dateOnlySchema.optional(),
});
export type SourceStatsFilters = z.infer<typeof sourceStatsSchema>;

const slug = z
  .string()
  .trim()
  .toLowerCase()
  .min(2, "validation.required")
  .max(60, "validation.tooLong")
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "validation.slug");

/** Settings → "Formalar". */
export const leadFormSchema = z.object({
  name,
  slug,
  columnId: idSchema,
  sourceId: optionalId,
  integration: text(120).nullable().optional(),
  isActive: z.boolean().default(true),
});
export type LeadFormInput = z.infer<typeof leadFormSchema>;

/** What a visitor sends from the public form page. */
export const publicLeadSchema = z.object({
  fullName: name,
  phone: phoneSchema,
  comment: text(1000).nullable().optional(),
  /** An invite code from a student's link (`?ref=`), A-120; unknown codes are ignored. */
  ref: z.string().trim().max(32).nullable().optional(),
});
export type PublicLeadInput = z.infer<typeof publicLeadSchema>;
