import type { AttendanceStatus } from "@/lib/validation/groups";
import type { LessonRatingInput } from "@/lib/validation/groups";
import { recordAudit } from "@/server/audit/audit";
import { prisma, type DbClient } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";
import { authorize, type Actor } from "@/server/rbac/authorize";
import { findGroupInScope } from "@/server/services/groups/shared";
import { dateToIso } from "@/server/services/settings/shared";
import { membershipByToken } from "@/server/services/video/video.service";

/*
 * Post-lesson rating (online-lessons item D6, A-168). Once a lesson is over
 * (Tashkent time) a student who was not marked absent rates it 1-5 from their
 * page, with an optional line, and may change the rating later. Staff who see
 * the group see each lesson's average in the attendance grid and the names,
 * stars and lines in the lesson dialog; the teacher's own note to the students
 * lives on the lesson (`studentNote`) and is set through the lesson update.
 */

export interface PortalLessonRatingDto {
  lessonId: string;
  rating: number;
  comment: string | null;
}

export interface LessonRatingRowDto {
  membershipId: string;
  fullName: string;
  rating: number;
  comment: string | null;
  at: string;
}

export interface LessonRatingsDto {
  lessonId: string;
  average: number | null;
  rows: LessonRatingRowDto[];
}

/** The lesson has ended (Tashkent time) and the student was there, or not marked. */
export function canRateLesson(
  lesson: { date: string; endTime: string },
  attendance: AttendanceStatus | null,
  now: Date = new Date(),
): boolean {
  if (attendance === "ABSENT") return false;
  const end = new Date(`${lesson.date}T${lesson.endTime}:00+05:00`);
  return end.getTime() <= now.getTime();
}

export async function ratePortalLesson(
  token: string,
  lessonId: string,
  input: LessonRatingInput,
  db: DbClient = prisma,
): Promise<PortalLessonRatingDto | null> {
  const membership = await membershipByToken(db, token);
  if (!membership) return null;
  const lesson = await db.lesson.findFirst({
    where: { id: lessonId, groupId: membership.groupId },
    select: {
      id: true,
      date: true,
      endTime: true,
      attendances: { where: { membershipId: membership.id }, select: { status: true } },
      group: { select: { branchId: true, branch: { select: { organizationId: true } } } },
    },
  });
  if (!lesson) throw AppError.notFound();
  const attendance = lesson.attendances[0]?.status ?? null;
  if (!canRateLesson({ date: dateToIso(lesson.date), endTime: lesson.endTime }, attendance)) {
    throw AppError.conflict(
      attendance === "ABSENT" ? "errors.ratingAbsent" : "errors.lessonNotOver",
    );
  }
  const row = await db.$transaction(async (tx) => {
    const saved = await tx.lessonRating.upsert({
      where: { lessonId_membershipId: { lessonId, membershipId: membership.id } },
      create: {
        lessonId,
        membershipId: membership.id,
        rating: input.rating,
        comment: input.comment ?? null,
      },
      update: { rating: input.rating, comment: input.comment ?? null },
    });
    await recordAudit(tx, null, {
      organizationId: lesson.group.branch.organizationId,
      branchId: lesson.group.branchId,
      action: "lesson.rate",
      entity: "Lesson",
      entityId: lessonId,
      after: { studentId: membership.studentId, rating: input.rating },
    });
    return saved;
  });
  return { lessonId, rating: row.rating, comment: row.comment };
}

/** Staff who see the group: every rating of one lesson, newest first. */
export async function listLessonRatings(
  actor: Actor,
  lessonId: string,
  db: DbClient = prisma,
): Promise<LessonRatingsDto> {
  authorize(actor, "groups.view");
  const lesson = await db.lesson.findUnique({ where: { id: lessonId }, select: { groupId: true } });
  if (!lesson) throw AppError.notFound();
  await findGroupInScope(db, actor, lesson.groupId, {});
  const rows = await db.lessonRating.findMany({
    where: { lessonId },
    orderBy: { updatedAt: "desc" },
    include: { membership: { select: { student: { select: { fullName: true } } } } },
  });
  return {
    lessonId,
    average: rows.length
      ? Math.round((rows.reduce((s, r) => s + r.rating, 0) / rows.length) * 10) / 10
      : null,
    rows: rows.map((r) => ({
      membershipId: r.membershipId,
      fullName: r.membership.student.fullName,
      rating: r.rating,
      comment: r.comment,
      at: r.updatedAt.toISOString(),
    })),
  };
}
