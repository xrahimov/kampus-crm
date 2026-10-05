import { z } from "zod";

import { idSchema } from "./common";

/* Video lessons: starting a group's call, and the browsers' signalling sync. */

export const startVideoSchema = z.object({
  /** The lesson the call belongs to; omitted = today's lesson of the group, if any. */
  lessonId: z.union([z.null(), idSchema]).optional(),
});
export type StartVideoInput = z.infer<typeof startVideoSchema>;

/** WebRTC messages one browser sends another through the server. */
export const SIGNAL_KINDS = ["offer", "answer", "candidate", "restart"] as const;
export type SignalKind = (typeof SIGNAL_KINDS)[number];

export const videoSyncSchema = z.object({
  secret: z.string().min(16).max(200),
  /** Highest signal id already received; those up to it are deleted. */
  after: z.number().int().min(0).default(0),
  signals: z
    .array(
      z.object({
        to: z.string().min(1).max(64),
        kind: z.enum(SIGNAL_KINDS),
        // SDP blobs run to a few KB; candidates are tiny.
        payload: z.unknown().refine((v) => JSON.stringify(v ?? null).length <= 20_000, {
          message: "validation.tooLong",
        }),
      }),
    )
    .max(100)
    .default([]),
  /** The browser is closing: mark the participant gone at once. */
  leave: z.boolean().default(false),
  /** Shown to others as muted / camera off icons. */
  state: z
    .object({ audio: z.boolean(), video: z.boolean(), screen: z.boolean().default(false) })
    .optional(),
});
export type VideoSyncInput = z.infer<typeof videoSyncSchema>;

/** SMS with each student's personal link; `{link}` and `{studentName}` are filled in per student. */
export const videoLinksSmsSchema = z.object({
  text: z
    .string()
    .trim()
    .min(1, "validation.required")
    .max(600, "validation.tooLong")
    .refine((v) => v.includes("{link}"), "validation.linkPlaceholder"),
});
export type VideoLinksSmsInput = z.infer<typeof videoLinksSmsSchema>;
