import { z } from "zod";

import { idSchema } from "./common";
import { dateOnlySchema } from "./settings";

/*
 * Lesson content per syllabus topic (A-157, online-lessons item C1): the
 * blocks a topic carries and when a group's students may open them.
 */

export const TOPIC_BLOCK_KINDS = ["TEXT", "VIDEO", "FILE", "LINK"] as const;
export type TopicBlockKindInput = (typeof TOPIC_BLOCK_KINDS)[number];
export const TOPIC_BLOCKS_MAX = 40;
export const TOPIC_TEXT_MAX = 20_000;

/** YouTube watch, short and share URLs; the capture is the 11-character video id. */
export const YOUTUBE_URL =
  /^https?:\/\/(?:www\.|m\.)?(?:youtube\.com\/(?:watch\?(?:.*&)?v=|shorts\/|embed\/|live\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/i;

export function youtubeId(url: string | null | undefined): string | null {
  const m = url ? YOUTUBE_URL.exec(url) : null;
  return m ? m[1]! : null;
}

const isStoredFile = (url: string) => url.startsWith("/api/v1/files/");

export const topicBlockSchema = z
  .object({
    kind: z.enum(TOPIC_BLOCK_KINDS),
    title: z.string().trim().min(1, "validation.required").max(200, "validation.tooLong"),
    body: z.string().trim().max(TOPIC_TEXT_MAX, "validation.tooLong").nullable().optional(),
    url: z.string().trim().max(500, "validation.tooLong").nullable().optional(),
    size: z.number().int().nonnegative().nullable().optional(),
  })
  .superRefine((v, ctx) => {
    const url = v.url ?? "";
    if (v.kind === "TEXT" && !v.body) {
      ctx.addIssue({ code: "custom", path: ["body"], message: "validation.required" });
    }
    if (v.kind === "LINK" && !/^https?:\/\//i.test(url)) {
      ctx.addIssue({ code: "custom", path: ["url"], message: "validation.url" });
    }
    if (v.kind === "FILE" && !isStoredFile(url)) {
      ctx.addIssue({ code: "custom", path: ["url"], message: "validation.fileRequired" });
    }
    if (v.kind === "VIDEO" && !isStoredFile(url) && !youtubeId(url)) {
      ctx.addIssue({ code: "custom", path: ["url"], message: "validation.videoUrl" });
    }
  });

export const topicContentSchema = z.object({
  blocks: z.array(topicBlockSchema).max(TOPIC_BLOCKS_MAX, "validation.max"),
});
export type TopicContentInput = z.infer<typeof topicContentSchema>;

/** How a group's students get a topic: after the lesson that covers it (default), now, or from a date. */
export const TOPIC_RELEASE_MODES = ["lesson", "now", "date"] as const;
export const topicReleaseSchema = z
  .object({
    mode: z.enum(TOPIC_RELEASE_MODES),
    date: dateOnlySchema.nullable().optional(),
  })
  .superRefine((v, ctx) => {
    if (v.mode === "date" && !v.date) {
      ctx.addIssue({ code: "custom", path: ["date"], message: "validation.required" });
    }
  });
export type TopicReleaseInput = z.infer<typeof topicReleaseSchema>;

export const topicIdParam = idSchema;
