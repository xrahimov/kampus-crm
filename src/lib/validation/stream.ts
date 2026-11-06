import { z } from "zod";

/** Class stream (A-164): a teacher's post and the comments under it. */
export const streamPostSchema = z.object({
  body: z.string().trim().min(1, "validation.required").max(4000, "validation.tooLong"),
  /** Uploaded through /uploads/documents first. */
  attachmentUrl: z.string().max(500).nullable().optional(),
  pinned: z.boolean().optional(),
  locked: z.boolean().optional(),
});
export type StreamPostInput = z.infer<typeof streamPostSchema>;

export const streamCommentSchema = z.object({
  body: z.string().trim().min(1, "validation.required").max(1000, "validation.tooLong"),
});
export type StreamCommentInput = z.infer<typeof streamCommentSchema>;
