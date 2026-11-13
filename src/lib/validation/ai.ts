import { z } from "zod";

/** One turn of the Assistant page; the whole conversation is sent each time (A-149). */
export const assistantTurnSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1, "validation.required").max(4000, "validation.max"),
});

export const assistantAskSchema = z.object({
  messages: z.array(assistantTurnSchema).min(1).max(40),
  /** The UI language, so the answer comes in it. */
  locale: z.enum(["uz", "ru", "en"]).default("en"),
  /** The page the question was asked from, when it came from the floating assistant (A-191). */
  page: z
    .string()
    .trim()
    .max(200)
    .regex(/^\/[\w\-/]*$/)
    .optional(),
});
export type AssistantAskInput = z.infer<typeof assistantAskSchema>;

export const BRIEFING_VIEWS = ["management", "teaching"] as const;
export type BriefingView = (typeof BRIEFING_VIEWS)[number];
export const BRIEFING_PERIODS = ["yesterday", "today", "week"] as const;
export type BriefingPeriod = (typeof BRIEFING_PERIODS)[number];

/** Which summary to show (A-190); without a view the person's first one is taken. */
export const briefingSchema = z.object({
  view: z.enum(BRIEFING_VIEWS).optional(),
  period: z.enum(BRIEFING_PERIODS).default("yesterday"),
  locale: z.enum(["uz", "ru", "en"]).default("en"),
});
export type BriefingInput = z.infer<typeof briefingSchema>;

export const briefingRequestSchema = briefingSchema.extend({
  /** Write the conclusion again although one is kept. */
  refresh: z.boolean().default(false),
  /** False asks for the figures only, without waiting for the model. */
  write: z.boolean().default(true),
});
export type BriefingRequest = z.infer<typeof briefingRequestSchema>;
