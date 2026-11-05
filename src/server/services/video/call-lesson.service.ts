import { prisma, type DbClient } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";
import { safeEqual, sha256 } from "@/server/auth/tokens";
import { dateToIso } from "@/server/services/settings/shared";

/*
 * The lesson beside the call (online-lessons item B7, A-154): the topic, the
 * lesson's (and the group's general) materials and the homework, read from
 * inside the call with the participant's own secret, so a student needs nothing
 * but the call. File links are rewritten for students to their personal-link
 * file path; staff open the signed-in one.
 */

export interface CallLessonDto {
  lesson: {
    id: string;
    date: string;
    startTime: string;
    endTime: string;
    topic: string | null;
    courseTopicTitle: string | null;
    attachmentUrl: string | null;
  } | null;
  materials: Array<{
    id: string;
    kind: "FILE" | "LINK" | "RECORDING";
    title: string;
    url: string;
    /** True for the group's general materials, not tied to this lesson. */
    general: boolean;
  }>;
  homework: {
    id: string;
    text: string;
    linkUrl: string | null;
    attachmentUrl: string | null;
    dueDate: string | null;
    speaking: boolean;
  } | null;
}

const MAX_MATERIALS = 30;

function fileUrl(token: string | null, url: string | null): string | null {
  if (!url || !token || !url.startsWith("/api/v1/files/")) return url;
  return `/api/v1/public/class/${encodeURIComponent(token)}/files/${url.slice("/api/v1/files/".length)}`;
}

/** What the lesson panel shows this participant; the secret proves the browser's seat in the call. */
export async function getCallLesson(
  participantId: string,
  secret: string,
  db: DbClient = prisma,
): Promise<CallLessonDto> {
  const me = await db.videoParticipant.findUnique({
    where: { id: participantId },
    include: {
      room: {
        include: {
          lesson: {
            select: {
              id: true,
              date: true,
              startTime: true,
              endTime: true,
              topic: true,
              attachmentUrl: true,
              courseTopic: { select: { title: true } },
            },
          },
        },
      },
    },
  });
  if (!me || !safeEqual(sha256(secret), me.secretHash)) throw AppError.forbidden();
  if (me.leftAt || me.room.status !== "LIVE") throw AppError.conflict("errors.videoEnded");
  const lesson = me.room.lesson;
  // A student's files go through their personal link (A-105).
  const token =
    me.role === "STUDENT" && me.studentId
      ? ((
          await db.groupMembership.findFirst({
            where: { groupId: me.room.groupId, studentId: me.studentId },
            select: { videoToken: true },
            orderBy: { createdAt: "desc" },
          })
        )?.videoToken ?? null)
      : null;
  const [materials, homework] = await Promise.all([
    db.lessonMaterial.findMany({
      where: {
        groupId: me.room.groupId,
        OR: [{ lessonId: null }, ...(lesson ? [{ lessonId: lesson.id }] : [])],
      },
      orderBy: [{ lessonId: "desc" }, { createdAt: "desc" }],
      take: MAX_MATERIALS,
      select: { id: true, kind: true, title: true, url: true, lessonId: true },
    }),
    lesson ? db.homework.findUnique({ where: { lessonId: lesson.id } }) : null,
  ]);
  return {
    lesson: lesson
      ? {
          id: lesson.id,
          date: dateToIso(lesson.date),
          startTime: lesson.startTime,
          endTime: lesson.endTime,
          topic: lesson.topic,
          courseTopicTitle: lesson.courseTopic?.title ?? null,
          attachmentUrl: fileUrl(token, lesson.attachmentUrl),
        }
      : null,
    materials: materials.map((m) => ({
      id: m.id,
      kind: m.kind,
      title: m.title,
      url: fileUrl(token, m.url) ?? m.url,
      general: m.lessonId === null,
    })),
    homework: homework
      ? {
          id: homework.id,
          text: homework.text,
          linkUrl: homework.linkUrl,
          attachmentUrl: fileUrl(token, homework.attachmentUrl),
          dueDate: homework.dueDate ? dateToIso(homework.dueDate) : null,
          speaking: homework.speaking,
        }
      : null,
  };
}
