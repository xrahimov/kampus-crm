import { z } from "zod";

import { idSchema } from "./common";

/*
 * Self-check exercises (A-158, online-lessons item C2): six kinds of item,
 * each with its answer key, on a syllabus topic or a homework. The same
 * schemas describe what the teacher writes and what the student sends back.
 */

export const EXERCISE_KINDS = ["CHOICE", "TRUE_FALSE", "GAP", "MATCH", "ORDER", "SHORT"] as const;
export type ExerciseKind = (typeof EXERCISE_KINDS)[number];
export const EXERCISE_ITEMS_MAX = 30;
/** The marker for a gap in a GAP item's prompt. */
export const GAP_MARK = "___";

const text = (max: number) =>
  z.string().trim().min(1, "validation.required").max(max, "validation.tooLong");
const prompt = text(1000);
const answerText = text(120);

export const exerciseItemSchema = z.discriminatedUnion("kind", [
  z
    .object({
      kind: z.literal("CHOICE"),
      prompt,
      options: z.array(text(300)).min(2, "validation.minOptions").max(6, "validation.max"),
      /** Indexes of the right options; one or several. */
      correct: z.array(z.number().int().min(0)).min(1, "validation.required").max(6),
    })
    .superRefine((v, ctx) => {
      if (
        v.correct.some((i) => i >= v.options.length) ||
        new Set(v.correct).size !== v.correct.length
      ) {
        ctx.addIssue({ code: "custom", path: ["correct"], message: "validation.correctIndex" });
      }
    }),
  z.object({ kind: z.literal("TRUE_FALSE"), prompt, correct: z.boolean() }),
  z
    .object({
      kind: z.literal("GAP"),
      /** The sentence with `___` where each gap is. */
      prompt,
      /** Accepted answers per gap, in the order of the gaps. */
      answers: z.array(z.array(answerText).min(1).max(5)).min(1, "validation.required").max(10),
    })
    .superRefine((v, ctx) => {
      if (v.prompt.split(GAP_MARK).length - 1 !== v.answers.length) {
        ctx.addIssue({ code: "custom", path: ["answers"], message: "validation.gapCount" });
      }
    }),
  z.object({
    kind: z.literal("MATCH"),
    prompt,
    pairs: z
      .array(z.object({ left: answerText, right: answerText }))
      .min(2, "validation.minOptions")
      .max(8, "validation.max"),
  }),
  z.object({
    kind: z.literal("ORDER"),
    prompt,
    /** The pieces in the right order. */
    items: z.array(answerText).min(2, "validation.minOptions").max(10, "validation.max"),
  }),
  z.object({
    kind: z.literal("SHORT"),
    prompt,
    answers: z.array(answerText).min(1, "validation.required").max(10),
  }),
]);
export type ExerciseItem = z.infer<typeof exerciseItemSchema>;

/** Title and items: what an edit changes. */
export const exerciseBodySchema = z.object({
  title: text(120),
  items: z.array(exerciseItemSchema).min(1, "validation.required").max(EXERCISE_ITEMS_MAX),
});
export type ExerciseBodyInput = z.infer<typeof exerciseBodySchema>;

export const exerciseSchema = exerciseBodySchema
  .extend({
    topicId: idSchema.nullable().optional(),
    homeworkId: idSchema.nullable().optional(),
  })
  .superRefine((v, ctx) => {
    if (Boolean(v.topicId) === Boolean(v.homeworkId)) {
      ctx.addIssue({ code: "custom", path: ["topicId"], message: "validation.required" });
    }
  });
export type ExerciseInput = z.infer<typeof exerciseSchema>;

export const exerciseListQuerySchema = z
  .object({ topicId: idSchema.optional(), homeworkId: idSchema.optional() })
  .refine((v) => Boolean(v.topicId) !== Boolean(v.homeworkId), "validation.required");

/** What a student sends: one entry per item index they answered. */
export const exerciseAnswerSchema = z.union([
  z.array(z.number().int().min(0).max(5)).max(6), // CHOICE
  z.boolean(), // TRUE_FALSE
  z.array(z.string().trim().max(120)).max(10), // GAP, ORDER, MATCH (chosen right per left)
  z.string().trim().max(120), // SHORT
]);
export const exerciseAttemptSchema = z.object({
  answers: z.record(z.string().regex(/^\d{1,2}$/), exerciseAnswerSchema),
});
export type ExerciseAttemptInput = z.infer<typeof exerciseAttemptSchema>;
export type ExerciseAnswer = z.infer<typeof exerciseAnswerSchema>;
