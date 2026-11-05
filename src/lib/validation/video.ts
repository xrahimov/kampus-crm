import { z } from "zod";

import { idSchema } from "./common";

/* Video lessons: starting a group's call, and the browsers' signalling sync. */

export const startVideoSchema = z.object({
  /** The lesson the call belongs to; omitted = today's lesson of the group, if any. */
  lessonId: z.union([z.null(), idSchema]).optional(),
});
export type StartVideoInput = z.infer<typeof startVideoSchema>;

/**
 * Messages one browser sends another through the server: the WebRTC handshake,
 * plus in-call chat lines, the teacher's "mute" and "lower hand" requests and
 * reactions (A-152).
 */
export const SIGNAL_KINDS = [
  "offer",
  "answer",
  "candidate",
  "restart",
  "chat",
  "mute",
  "lower",
  "react",
] as const;
export type SignalKind = (typeof SIGNAL_KINDS)[number];

/** Signals only the teacher (HOST) may send; the server drops anyone else's. */
export const HOST_SIGNAL_KINDS: readonly SignalKind[] = ["mute", "lower"];

/** Reactions everyone sees on the sender's picture; "slower"/"faster" go to the teacher only. */
export const REACTIONS = ["like", "clap", "heart", "laugh", "wow", "slower", "faster"] as const;
export type Reaction = (typeof REACTIONS)[number];
export const PACE_REACTIONS: readonly Reaction[] = ["slower", "faster"];

export const POLL_QUESTION_MAX = 200;
export const POLL_OPTION_MAX = 100;
export const POLL_MIN_OPTIONS = 2;
export const POLL_MAX_OPTIONS = 6;

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
  /** Shown to others as muted / camera off / sharing / raised-hand marks. */
  state: z
    .object({
      audio: z.boolean(),
      video: z.boolean(),
      screen: z.boolean().default(false),
      hand: z.boolean().default(false),
    })
    .optional(),
  /** Poll actions (A-153): the teacher opens or closes one; a student answers. */
  poll: z
    .discriminatedUnion("action", [
      z.object({
        action: z.literal("open"),
        question: z.string().trim().min(1).max(POLL_QUESTION_MAX),
        options: z
          .array(z.string().trim().min(1).max(POLL_OPTION_MAX))
          .min(POLL_MIN_OPTIONS)
          .max(POLL_MAX_OPTIONS),
      }),
      z.object({ action: z.literal("close"), pollId: z.string().min(1).max(64) }),
      z.object({
        action: z.literal("vote"),
        pollId: z.string().min(1).max(64),
        option: z
          .number()
          .int()
          .min(0)
          .max(POLL_MAX_OPTIONS - 1),
      }),
    ])
    .optional(),
  /** The teacher's stage for everyone: spotlight (a participant id or null) and focus mode. */
  room: z
    .object({
      spotlight: z.string().min(1).max(64).nullable(),
      focus: z.boolean(),
    })
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

/** The teacher's confirmed marks from a call (online-lessons B1). */
export const callAttendanceSchema = z.object({
  marks: z
    .array(
      z.object({
        membershipId: idSchema,
        status: z.enum(["PRESENT", "ABSENT", "EXCUSED"]),
      }),
    )
    .max(200),
});
export type CallAttendanceInput = z.infer<typeof callAttendanceSchema>;
