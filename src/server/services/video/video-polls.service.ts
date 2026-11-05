import type { VideoPeerRole } from "@/generated/prisma/client";
import type { VideoSyncInput } from "@/lib/validation/video";
import type { DbClient } from "@/server/db/prisma";

/*
 * Polls in a video lesson (online-lessons item B2, A-153). They travel with the
 * browsers' regular sync, so a student needs nothing but the call: the teacher
 * (HOST) opens a question with 2-6 answers, students answer (and may change
 * their answer while it is open), the teacher closes it. One poll is open at a
 * time; opening another closes the previous. While a poll is open only the
 * teacher and staff see the counts; once closed everyone sees them. Results
 * stay with the call and show on the group page under the last video lesson.
 */

export interface PollDto {
  id: string;
  question: string;
  options: string[];
  open: boolean;
  /** This browser's answer (students), or null. */
  myVote: number | null;
  /** Answers per option; null for a student while the poll is open. */
  counts: number[] | null;
  total: number;
  /** Who answered what, for the teacher and staff only. */
  voters: Array<{ name: string; option: number }> | null;
}

/** A closed poll's result, as the group page shows it. */
export interface PollResultDto {
  id: string;
  question: string;
  options: string[];
  counts: number[];
  total: number;
}

interface Me {
  id: string;
  roomId: string;
  role: VideoPeerRole;
  studentId: string | null;
  displayName: string;
}

/** Applies one poll action from a browser; anything it may not do is ignored. */
export async function applyPollAction(
  db: DbClient,
  me: Me,
  action: NonNullable<VideoSyncInput["poll"]>,
  now = new Date(),
): Promise<void> {
  if (action.action === "open") {
    if (me.role !== "HOST") return;
    await db.videoPoll.updateMany({
      where: { roomId: me.roomId, closedAt: null },
      data: { closedAt: now },
    });
    await db.videoPoll.create({
      data: { roomId: me.roomId, question: action.question, options: action.options },
    });
    return;
  }
  const poll = await db.videoPoll.findFirst({
    where: { id: action.pollId, roomId: me.roomId, closedAt: null },
  });
  if (!poll) return;
  if (action.action === "close") {
    if (me.role !== "HOST") return;
    await db.videoPoll.update({ where: { id: poll.id }, data: { closedAt: now } });
    return;
  }
  // Only students answer; the teacher and staff watch the results.
  if (me.role !== "STUDENT") return;
  if (action.option >= (poll.options as string[]).length) return;
  const voterKey = me.studentId ?? me.id;
  await db.videoPollVote.upsert({
    where: { pollId_voterKey: { pollId: poll.id, voterKey } },
    create: {
      pollId: poll.id,
      voterKey,
      studentId: me.studentId,
      displayName: me.displayName,
      option: action.option,
    },
    update: { option: action.option, displayName: me.displayName },
  });
}

/** The poll this browser should show: the open one, else the last closed one. */
export async function pollForPeer(db: DbClient, me: Me): Promise<PollDto | null> {
  const poll = await db.videoPoll.findFirst({
    where: { roomId: me.roomId },
    orderBy: { createdAt: "desc" },
    include: { votes: { orderBy: { updatedAt: "asc" } } },
  });
  if (!poll) return null;
  const options = poll.options as string[];
  const open = poll.closedAt === null;
  const counts = options.map((_, i) => poll.votes.filter((v) => v.option === i).length);
  const staff = me.role !== "STUDENT";
  const voterKey = me.studentId ?? me.id;
  return {
    id: poll.id,
    question: poll.question,
    options,
    open,
    myVote: poll.votes.find((v) => v.voterKey === voterKey)?.option ?? null,
    counts: staff || !open ? counts : null,
    total: poll.votes.length,
    voters: staff ? poll.votes.map((v) => ({ name: v.displayName, option: v.option })) : null,
  };
}

/** Closed and open polls of a call with their counts, oldest first. */
export async function pollResults(db: DbClient, roomId: string): Promise<PollResultDto[]> {
  const polls = await db.videoPoll.findMany({
    where: { roomId },
    orderBy: { createdAt: "asc" },
    include: { votes: { select: { option: true } } },
  });
  return polls.map((p) => {
    const options = p.options as string[];
    return {
      id: p.id,
      question: p.question,
      options,
      counts: options.map((_, i) => p.votes.filter((v) => v.option === i).length),
      total: p.votes.length,
    };
  });
}
