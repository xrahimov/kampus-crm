import { z } from "zod";

import { idSchema } from "./common";
import { dateOnlySchema } from "./settings";

/* Tests and the question bank (EXP §5 TEST / BILIM TAHLILI, §6 TEST NATIJALARI, §8 Test sozlamalari). */

export const TEST_STATUSES = ["DRAFT", "ACTIVE", "CLOSED"] as const;
export type TestStatus = (typeof TEST_STATUSES)[number];

const text = (max: number) => z.string().trim().min(1, "validation.required").max(max);
const blankToNull = <T extends z.ZodTypeAny>(schema: T) =>
  z.union([z.literal("").transform(() => null), z.null(), schema]).optional();

export const MIN_OPTIONS = 2;
export const MAX_OPTIONS = 6;

/** Question bank item: subject, topic, text, 2–6 options, the correct one. */
export const questionSchema = z
  .object({
    subject: text(80),
    topic: text(120),
    text: text(2000),
    options: z.array(text(300)).min(MIN_OPTIONS, "validation.minOptions").max(MAX_OPTIONS),
    correctIndex: z.coerce.number().int().min(0),
  })
  .superRefine((v, ctx) => {
    if (v.correctIndex >= v.options.length) {
      ctx.addIssue({ code: "custom", path: ["correctIndex"], message: "validation.correctIndex" });
    }
  });
export type QuestionInput = z.output<typeof questionSchema>;

export const questionFilterSchema = z.object({
  subject: z.string().trim().max(80).optional(),
  topic: z.string().trim().max(120).optional(),
});

/** "Yangi test yaratish": name, subject, limits, deadline, status, groups and questions. */
export const testSchema = z
  .object({
    name: text(120),
    subject: text(80),
    timeLimitMinutes: blankToNull(z.coerce.number().int().min(1, "validation.min").max(600)),
    passPercent: z.coerce.number().int().min(0, "validation.min").max(100, "validation.max"),
    deadline: blankToNull(dateOnlySchema),
    status: z.enum(TEST_STATUSES).default("DRAFT"),
    groupIds: z.array(idSchema).max(200).default([]),
    questions: z
      .array(
        z.object({
          questionId: idSchema,
          points: z.coerce.number().int().min(1, "validation.min").max(100),
        }),
      )
      .max(200)
      .default([]),
  })
  .superRefine((v, ctx) => {
    if (v.status === "ACTIVE" && v.questions.length === 0) {
      ctx.addIssue({ code: "custom", path: ["questions"], message: "validation.noQuestions" });
    }
    const ids = new Set(v.questions.map((q) => q.questionId));
    if (ids.size !== v.questions.length) {
      ctx.addIssue({
        code: "custom",
        path: ["questions"],
        message: "validation.duplicateQuestion",
      });
    }
  });
export type TestInput = z.output<typeof testSchema>;

export const testFilterSchema = z.object({
  status: z.enum(TEST_STATUSES).optional(),
  subject: z.string().trim().max(80).optional(),
  groupId: idSchema.optional(),
  /** "Yangi qo'shilganlar": newest first. */
  recent: z
    .union([z.literal("1"), z.literal("0"), z.boolean()])
    .optional()
    .transform((v) => v === true || v === "1"),
});
export type TestFilters = z.output<typeof testFilterSchema>;

/** Staff records a student's submitted test by entering the chosen options (A-82). */
export const testAttemptSchema = z.object({
  studentId: idSchema,
  groupId: blankToNull(idSchema),
  answers: z.record(
    z.string(),
    z.coerce
      .number()
      .int()
      .min(0)
      .max(MAX_OPTIONS - 1),
  ),
  durationSeconds: blankToNull(z.coerce.number().int().min(0).max(86_400)),
});
export type TestAttemptInput = z.output<typeof testAttemptSchema>;

/** Filters shared by the group "Bilim tahlili" tab and the student "Test natijalari" tab. */
export const knowledgeFilterSchema = z.object({
  subject: z.string().trim().max(80).optional(),
  testId: idSchema.optional(),
  from: dateOnlySchema.optional(),
  to: dateOnlySchema.optional(),
});
export type KnowledgeFilters = z.output<typeof knowledgeFilterSchema>;
