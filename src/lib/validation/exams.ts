import { z } from "zod";

import { idSchema } from "./common";
import { dateOnlySchema, timeSchema } from "./settings";

/* Exams (EXP §7). Messages are i18n keys. */

export const EXAM_TYPES = ["GROUP", "MOCK"] as const;
export type ExamType = (typeof EXAM_TYPES)[number];
export const EXAM_STATUSES = ["NOT_STARTED", "FINISHED"] as const;
export type ExamStatus = (typeof EXAM_STATUSES)[number];

const name = z.string().trim().min(1, "validation.required").max(120, "validation.tooLong");
const text = (max: number) => z.string().trim().max(max, "validation.tooLong");
const score = z.coerce.number().min(0, "validation.min").max(9999, "validation.max");
const blankToNull = <T extends z.ZodTypeAny>(schema: T) =>
  z.union([z.literal("").transform(() => null), z.null(), schema]).optional();
const optionalId = blankToNull(idSchema);

const base = z.object({
  name,
  date: dateOnlySchema,
  startTime: timeSchema,
  endTime: timeSchema,
  examinerId: optionalId,
  roomId: optionalId,
  /** null = "Maxsus" (custom scale). */
  gradingSystemId: optionalId,
  passScore: score,
  maxScore: score,
});

/** "Imtihon qo'shish" drawer: the type toggle decides which extra fields apply. */
export const examSchema = base
  .extend({
    type: z.enum(EXAM_TYPES),
    groupId: optionalId,
    isRetake: z.boolean().default(false),
    price: z
      .union([z.literal("").transform(() => 0), z.coerce.number().min(0, "validation.min")])
      .default(0),
    capacity: blankToNull(z.coerce.number().int().min(1, "validation.min").max(10_000)),
    groupIds: z.array(idSchema).max(200).default([]),
  })
  .superRefine((v, ctx) => {
    if (v.endTime <= v.startTime) {
      ctx.addIssue({ code: "custom", path: ["endTime"], message: "validation.workHours" });
    }
    if (v.passScore > v.maxScore) {
      ctx.addIssue({ code: "custom", path: ["passScore"], message: "validation.passScore" });
    }
    if (v.type === "GROUP" && !v.groupId) {
      ctx.addIssue({ code: "custom", path: ["groupId"], message: "validation.required" });
    }
    if (v.type === "MOCK" && v.groupIds.length === 0) {
      ctx.addIssue({ code: "custom", path: ["groupIds"], message: "validation.groupsMin" });
    }
  });
export type ExamInput = z.infer<typeof examSchema>;

export const examFilterSchema = z.object({
  type: z.enum(EXAM_TYPES).default("GROUP"),
  status: z.enum(EXAM_STATUSES).optional(),
  groupId: idSchema.optional(),
  from: dateOnlySchema.optional(),
  to: dateOnlySchema.optional(),
});
export type ExamFilters = z.infer<typeof examFilterSchema>;

export const examResultsSchema = z.object({
  results: z
    .array(
      z.object({
        studentId: idSchema,
        score: blankToNull(score),
        isPresent: z.boolean().default(true),
        comment: text(500).nullable().optional(),
      }),
    )
    .min(1)
    .max(500),
});
export type ExamResultsInput = z.infer<typeof examResultsSchema>;

/** A mock exam registration ("Ariza"). */
export const examRegistrationSchema = z.object({ studentId: idSchema });
export type ExamRegistrationInput = z.infer<typeof examRegistrationSchema>;
