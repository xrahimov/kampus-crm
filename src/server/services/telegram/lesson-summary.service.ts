import type { AttendanceStatus } from "@/generated/prisma/client";
import type { DbClient } from "@/server/db/prisma";
import { enqueue } from "@/server/jobs/queue";
import { telegramConfigFor } from "@/server/services/integrations/integrations.service";
import { dateToIso } from "@/server/services/settings/shared";
import { botDate, notifyStudents } from "@/server/services/telegram/student-telegram.service";

/*
 * Lesson summary to parents (A-171): when an online lesson's room closes, a job
 * waits half an hour (time to mark attendance and set homework), then every
 * chat linked to a student of the group hears what the lesson covered, whether
 * the student was there and what homework was set. The Telegram card's
 * "Summary after each online lesson" switch turns it off per centre.
 */

/** How long after the room closes the summary goes out. */
export const SUMMARY_DELAY_MS = 30 * 60_000;
/** Homework text is cut to this many characters in the message. */
const HOMEWORK_SNIPPET = 120;

/** Queues the summary for a room that just closed; idempotent per room. */
export async function scheduleLessonSummary(
  db: DbClient,
  roomId: string,
  closedAt: Date = new Date(),
): Promise<string | null> {
  return enqueue(db, {
    type: "lesson.summary",
    payload: { roomId },
    runAt: new Date(closedAt.getTime() + SUMMARY_DELAY_MS),
    uniqueKey: `lesson-summary:${roomId}`,
  });
}

function snippet(text: string): string {
  const line = text.replace(/\s+/g, " ").trim();
  return line.length > HOMEWORK_SNIPPET ? `${line.slice(0, HOMEWORK_SNIPPET - 1)}…` : line;
}

/**
 * Sends the summaries for one closed room. Returns how many Telegram messages
 * were queued; nothing goes out for a room without a lesson, an archived group
 * or a centre that switched the summary off.
 */
export async function sendLessonSummaries(db: DbClient, roomId: string): Promise<number> {
  const room = await db.videoRoom.findUnique({
    where: { id: roomId },
    select: {
      lessonId: true,
      group: {
        select: {
          id: true,
          name: true,
          status: true,
          branch: { select: { organizationId: true } },
        },
      },
      lesson: {
        select: {
          date: true,
          startTime: true,
          endTime: true,
          topic: true,
          courseTopic: { select: { title: true } },
          homework: { select: { title: true, text: true, dueDate: true } },
          attendances: { select: { membershipId: true, status: true } },
        },
      },
    },
  });
  if (!room?.lesson || room.group.status === "ARCHIVED") return 0;
  const effective = await telegramConfigFor(db, room.group.branch.organizationId);
  if (!effective || effective.config.lessonSummary === false) return 0;
  const lesson = room.lesson;
  const members = await db.groupMembership.findMany({
    where: { groupId: room.group.id, status: { in: ["NEW", "TRIAL", "ACTIVE"] } },
    select: { id: true, studentId: true },
  });
  const marks = new Map<string, AttendanceStatus>(
    lesson.attendances.map((a) => [a.membershipId, a.status]),
  );
  const topic = lesson.topic?.trim() || lesson.courseTopic?.title || "";
  const homework = lesson.homework
    ? [lesson.homework.title, snippet(lesson.homework.text)].filter(Boolean).join(": ")
    : "";
  const dateIso = dateToIso(lesson.date);
  let queued = 0;
  for (const m of members) {
    const status = marks.get(m.id) ?? "NOT_MARKED";
    queued += await db.$transaction((tx) =>
      notifyStudents(tx, {
        studentIds: [m.studentId],
        kind: "lessonSummary",
        refKey: `lesson-summary:${roomId}:${m.studentId}`,
        values: (locale) => ({
          group: room.group.name,
          date: botDate(locale, dateIso),
          time: `${lesson.startTime}–${lesson.endTime}`,
          topic: topic || "none",
          attendance: status,
          homework: homework || "none",
          due: lesson.homework?.dueDate
            ? botDate(locale, dateToIso(lesson.homework.dueDate))
            : "none",
        }),
      }),
    );
  }
  return queued;
}
