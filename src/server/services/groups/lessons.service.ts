import type { Prisma } from "@/generated/prisma/client";
import type { AttendanceStatus, MembershipStatus } from "@/lib/validation/groups";
import { recordAudit } from "@/server/audit/audit";
import { awardAutoCoins } from "@/server/services/coins/coins.service";
import { queueAutoSms } from "@/server/services/sms/auto-sms.service";
import { prisma, type DbClient } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";
import { authorize, type Actor } from "@/server/rbac/authorize";
import {
  dateToIso,
  decimalToNumber,
  isoToDate,
  mustFind,
  rethrowAsAppError,
} from "@/server/services/settings/shared";

import { findGroupInScope, ownGroupsOnly, today } from "./shared";

/* Lessons, attendance and grades (EXP §5 DAVOMAT / BAHO tabs). */

export interface LessonDto {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  topic: string | null;
  attachmentUrl: string | null;
  isExtra: boolean;
  /** The date this extra lesson was moved from (A-117). */
  movedFrom: string | null;
  attendance: Record<string, { status: AttendanceStatus; comment: string | null }>;
  grades: Record<string, { score: number; comment: string | null }>;
}

/** A cancelled or moved lesson of the month: the group's own day off or a branch holiday (A-117). */
export interface LessonChangeDto {
  id: string;
  scope: "GROUP" | "BRANCH";
  date: string;
  reason: string;
  startTime: string | null;
  movedTo: { date: string; startTime: string; endTime: string } | null;
}

export interface MemberRowDto {
  membershipId: string;
  studentId: string;
  fullName: string;
  status: MembershipStatus;
  /** Average of this member's grades in the month (EXP "GPA"). */
  average: number | null;
}

export interface MonthGridDto {
  month: string;
  lessons: LessonDto[];
  members: MemberRowDto[];
  changes: LessonChangeDto[];
}

/** One month of the grid: lessons as columns, members as rows. */
export async function getMonthGrid(
  actor: Actor,
  groupId: string,
  month: string,
  db: DbClient = prisma,
): Promise<MonthGridDto> {
  authorize(actor, "groups.view");
  const group = await findGroupInScope(db, actor, groupId, {});
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
    throw AppError.validation({ month: ["validation.date"] });
  const from = isoToDate(`${month}-01`);
  const to = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1));
  const [lessons, memberships, groupDays, branchDays] = await Promise.all([
    db.lesson.findMany({
      where: { groupId, date: { gte: from, lt: to } },
      include: { attendances: true, grades: true, movedFrom: { select: { date: true } } },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    }),
    db.groupMembership.findMany({
      where: { groupId, status: { not: "ARCHIVED" } },
      include: { student: { select: { fullName: true } } },
      orderBy: { student: { fullName: "asc" } },
    }),
    db.groupDayOff.findMany({
      where: { groupId, date: { gte: from, lt: to } },
      include: { movedTo: { select: { date: true, startTime: true, endTime: true } } },
    }),
    db.dayOff.findMany({ where: { branchId: group.branchId, date: { gte: from, lt: to } } }),
  ]);
  const changes: LessonChangeDto[] = [
    ...groupDays.map((d) => ({
      id: d.id,
      scope: "GROUP" as const,
      date: dateToIso(d.date),
      reason: d.reason,
      startTime: d.startTime,
      movedTo: d.movedTo
        ? {
            date: dateToIso(d.movedTo.date),
            startTime: d.movedTo.startTime,
            endTime: d.movedTo.endTime,
          }
        : null,
    })),
    ...branchDays.map((d) => ({
      id: d.id,
      scope: "BRANCH" as const,
      date: dateToIso(d.date),
      reason: d.reason,
      startTime: null,
      movedTo: null,
    })),
  ].sort((a, b) => a.date.localeCompare(b.date));
  const sums = new Map<string, { total: number; count: number }>();
  const lessonDtos: LessonDto[] = lessons.map((l) => {
    const attendance: LessonDto["attendance"] = {};
    for (const a of l.attendances)
      attendance[a.membershipId] = { status: a.status, comment: a.comment };
    const grades: LessonDto["grades"] = {};
    for (const g of l.grades) {
      const score = decimalToNumber(g.score);
      grades[g.membershipId] = { score, comment: g.comment };
      const s = sums.get(g.membershipId) ?? { total: 0, count: 0 };
      sums.set(g.membershipId, { total: s.total + score, count: s.count + 1 });
    }
    return {
      id: l.id,
      date: dateToIso(l.date),
      startTime: l.startTime,
      endTime: l.endTime,
      topic: l.topic,
      attachmentUrl: l.attachmentUrl,
      isExtra: l.isExtra,
      movedFrom: l.movedFrom ? dateToIso(l.movedFrom.date) : null,
      attendance,
      grades,
    };
  });
  return {
    month,
    changes,
    lessons: lessonDtos,
    members: memberships.map((m) => {
      const s = sums.get(m.id);
      return {
        membershipId: m.id,
        studentId: m.studentId,
        fullName: m.student.fullName,
        status: m.status,
        average: s ? Math.round((s.total / s.count) * 100) / 100 : null,
      };
    }),
  };
}

type LessonRow = Prisma.LessonGetPayload<{
  include: { group: { select: { branchId: true; name: true } } };
}>;

async function findLessonInScope(db: DbClient, actor: Actor, lessonId: string): Promise<LessonRow> {
  const lesson = await mustFind(
    db.lesson.findUnique({
      where: { id: lessonId },
      include: { group: { select: { branchId: true, name: true } } },
    }),
  );
  if (!actor.branchIds.includes(lesson.group.branchId)) {
    throw AppError.forbidden("errors.branchForbidden");
  }
  if (ownGroupsOnly(actor)) await findGroupInScope(db, actor, lesson.groupId, {});
  return lesson;
}

/** "QO'SHIMCHA DARS": an extra meeting outside the schedule. */
export async function addExtraLesson(
  actor: Actor,
  groupId: string,
  input: { date: string; startTime: string; endTime: string },
  db: DbClient = prisma,
): Promise<LessonDto> {
  authorize(actor, "groups.update");
  const group = await findGroupInScope(db, actor, groupId, {});
  try {
    return await db.$transaction(async (tx) => {
      const row = await tx.lesson.create({
        data: {
          groupId,
          date: isoToDate(input.date),
          startTime: input.startTime,
          endTime: input.endTime,
          isExtra: true,
        },
      });
      await recordAudit(tx, actor, {
        action: "lesson.extra",
        entity: "Lesson",
        entityId: row.id,
        after: { groupId, ...input },
        branchId: group.branchId,
      });
      return {
        id: row.id,
        date: input.date,
        startTime: row.startTime,
        endTime: row.endTime,
        topic: null,
        attachmentUrl: null,
        isExtra: true,
        movedFrom: null,
        attendance: {},
        grades: {},
      };
    });
  } catch (error) {
    rethrowAsAppError(error, "date");
  }
}

/** Topic and attachment on the lesson header ("Mavzular"). */
export async function updateLesson(
  actor: Actor,
  lessonId: string,
  input: { topic?: string | null; attachmentUrl?: string | null },
  db: DbClient = prisma,
): Promise<void> {
  authorize(actor, "groups.attendance.mark");
  const lesson = await findLessonInScope(db, actor, lessonId);
  await db.$transaction(async (tx) => {
    const row = await tx.lesson.update({
      where: { id: lessonId },
      data: {
        ...(input.topic !== undefined ? { topic: input.topic } : {}),
        ...(input.attachmentUrl !== undefined ? { attachmentUrl: input.attachmentUrl } : {}),
      },
    });
    await recordAudit(tx, actor, {
      action: "lesson.update",
      entity: "Lesson",
      entityId: lessonId,
      before: { topic: lesson.topic, attachmentUrl: lesson.attachmentUrl },
      after: { topic: row.topic, attachmentUrl: row.attachmentUrl },
      branchId: lesson.group.branchId,
    });
  });
}

/** Attendance marks for one lesson; honours "only during the lesson" (A-41/A-57). */
export async function markAttendance(
  actor: Actor,
  lessonId: string,
  marks: Array<{ membershipId: string; status: AttendanceStatus; comment?: string | null }>,
  db: DbClient = prisma,
): Promise<void> {
  authorize(actor, "groups.attendance.mark");
  const lesson = await findLessonInScope(db, actor, lessonId);
  const settings = await db.orgSettings.findFirst({
    where: { organizationId: actor.organizationId },
    select: { attendanceOnlyDuringLesson: true },
  });
  if (settings?.attendanceOnlyDuringLesson && dateToIso(lesson.date) !== today()) {
    throw AppError.forbidden("errors.attendanceOutsideLesson");
  }
  await checkMemberships(
    db,
    lesson.groupId,
    marks.map((m) => m.membershipId),
  );
  const members = await db.groupMembership.findMany({
    where: { id: { in: marks.map((m) => m.membershipId) } },
    select: { id: true, studentId: true },
  });
  const studentOf = new Map(members.map((m) => [m.id, m.studentId]));
  await db.$transaction(async (tx) => {
    for (const mark of marks) {
      await tx.attendance.upsert({
        where: { lessonId_membershipId: { lessonId, membershipId: mark.membershipId } },
        create: {
          lessonId,
          membershipId: mark.membershipId,
          status: mark.status,
          comment: mark.comment ?? null,
          markedById: actor.userId,
        },
        update: {
          status: mark.status,
          comment: mark.comment ?? null,
          markedById: actor.userId,
          markedAt: new Date(),
        },
      });
      // Automatic "Davomat" coins follow the mark: given once per lesson, taken back if it changes (A-79).
      const studentId = studentOf.get(mark.membershipId);
      if (studentId) {
        await awardAutoCoins(tx, {
          event: "ATTENDANCE",
          studentId,
          groupId: lesson.groupId,
          refKey: `attendance:${lessonId}:${mark.membershipId}`,
          revoke: mark.status !== "PRESENT",
        });
        // "Darsga kelmaganlarga sms" / "Darsga kelganlarga sms" (A-88), once per lesson and mark.
        if (mark.status === "ABSENT" || mark.status === "PRESENT") {
          await queueAutoSms(tx, {
            event: mark.status,
            studentId,
            refKey: `${mark.status.toLowerCase()}:${lessonId}:${mark.membershipId}`,
            vars: { groupName: lesson.group.name, date: dateToIso(lesson.date) },
          });
        }
      }
    }
    await recordAudit(tx, actor, {
      action: "attendance.mark",
      entity: "Lesson",
      entityId: lessonId,
      after: { marks },
      branchId: lesson.group.branchId,
    });
  });
}

export async function setGrades(
  actor: Actor,
  lessonId: string,
  grades: Array<{ membershipId: string; score: number | null; comment?: string | null }>,
  db: DbClient = prisma,
): Promise<void> {
  authorize(actor, "groups.attendance.mark");
  const lesson = await findLessonInScope(db, actor, lessonId);
  await checkMemberships(
    db,
    lesson.groupId,
    grades.map((g) => g.membershipId),
  );
  const graded = await db.groupMembership.findMany({
    where: { id: { in: grades.map((g) => g.membershipId) } },
    select: { id: true, studentId: true },
  });
  const studentOfGrade = new Map(graded.map((m) => [m.id, m.studentId]));
  await db.$transaction(async (tx) => {
    for (const grade of grades) {
      const where = { lessonId_membershipId: { lessonId, membershipId: grade.membershipId } };
      const studentId = studentOfGrade.get(grade.membershipId);
      if (grade.score !== null && studentId) {
        // "O'quvchi baholarini yuborish" (A-88): the first grade of a lesson texts the student.
        await queueAutoSms(tx, {
          event: "GRADES",
          studentId,
          refKey: `grade:${lessonId}:${grade.membershipId}`,
          vars: {
            groupName: lesson.group.name,
            date: dateToIso(lesson.date),
            score: String(grade.score),
          },
        });
      }
      if (grade.score === null) {
        await tx.grade.deleteMany({ where: { lessonId, membershipId: grade.membershipId } });
      } else {
        await tx.grade.upsert({
          where,
          create: {
            lessonId,
            membershipId: grade.membershipId,
            score: grade.score,
            comment: grade.comment ?? null,
            gradedById: actor.userId,
          },
          update: {
            score: grade.score,
            comment: grade.comment ?? null,
            gradedById: actor.userId,
            gradedAt: new Date(),
          },
        });
      }
    }
    await recordAudit(tx, actor, {
      action: "grades.set",
      entity: "Lesson",
      entityId: lessonId,
      after: { grades },
      branchId: lesson.group.branchId,
    });
  });
}

async function checkMemberships(db: DbClient, groupId: string, membershipIds: string[]) {
  const unique = [...new Set(membershipIds)];
  const found = await db.groupMembership.count({ where: { id: { in: unique }, groupId } });
  if (found !== unique.length)
    throw AppError.validation({ membershipId: ["validation.memberUnknown"] });
}
