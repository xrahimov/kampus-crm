import type { Prisma } from "@/generated/prisma/client";
import type { AttendanceStatus, MembershipStatus } from "@/lib/validation/groups";
import { recordAudit } from "@/server/audit/audit";
import { prisma, type DbClient } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";
import { authorize, canAccessAllBranches, type Actor } from "@/server/rbac/authorize";
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
  attendance: Record<string, { status: AttendanceStatus; comment: string | null }>;
  grades: Record<string, { score: number; comment: string | null }>;
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
}

/** One month of the grid: lessons as columns, members as rows. */
export async function getMonthGrid(
  actor: Actor,
  groupId: string,
  month: string,
  db: DbClient = prisma,
): Promise<MonthGridDto> {
  authorize(actor, "groups.view");
  await findGroupInScope(db, actor, groupId, {});
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month))
    throw AppError.validation({ month: ["validation.date"] });
  const from = isoToDate(`${month}-01`);
  const to = new Date(Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 1, 1));
  const [lessons, memberships] = await Promise.all([
    db.lesson.findMany({
      where: { groupId, date: { gte: from, lt: to } },
      include: { attendances: true, grades: true },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    }),
    db.groupMembership.findMany({
      where: { groupId, status: { not: "ARCHIVED" } },
      include: { student: { select: { fullName: true } } },
      orderBy: { student: { fullName: "asc" } },
    }),
  ]);
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
      attendance,
      grades,
    };
  });
  return {
    month,
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

type LessonRow = Prisma.LessonGetPayload<{ include: { group: { select: { branchId: true } } } }>;

async function findLessonInScope(db: DbClient, actor: Actor, lessonId: string): Promise<LessonRow> {
  const lesson = await mustFind(
    db.lesson.findUnique({
      where: { id: lessonId },
      include: { group: { select: { branchId: true } } },
    }),
  );
  if (!canAccessAllBranches(actor) && !actor.branchIds.includes(lesson.group.branchId)) {
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
  const settings = await db.orgSettings.findFirst({ select: { attendanceOnlyDuringLesson: true } });
  if (settings?.attendanceOnlyDuringLesson && dateToIso(lesson.date) !== today()) {
    throw AppError.forbidden("errors.attendanceOutsideLesson");
  }
  await checkMemberships(
    db,
    lesson.groupId,
    marks.map((m) => m.membershipId),
  );
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
  await db.$transaction(async (tx) => {
    for (const grade of grades) {
      const where = { lessonId_membershipId: { lessonId, membershipId: grade.membershipId } };
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
