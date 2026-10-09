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
});
export type AssistantAskInput = z.infer<typeof assistantAskSchema>;
