import type { AutoSmsEvent } from "@/lib/validation/integrations";
import type { GroupDayOffInput } from "@/lib/validation/groups";
import { recordAudit } from "@/server/audit/audit";
import { prisma, type DbClient } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";
import { authorize, type Actor } from "@/server/rbac/authorize";
import {
  dateToIso,
  isoToDate,
  mustFind,
  prismaCode,
  rethrowAsAppError,
} from "@/server/services/settings/shared";
import { queueAutoSms } from "@/server/services/sms/auto-sms.service";
import { botDate, notifyStudents } from "@/server/services/telegram/student-telegram.service";

import { syncLessons } from "./groups.service";
import { isoWeekday } from "./schedule";
import { findGroupInScope } from "./shared";

/*
 * "Dam berish" with notice (A-53, A-117): a group skips one date; the unmarked
 * lesson of that day is removed or, when a new date and time are given, moved
 * to an extra lesson. The current students and their parents hear about it by
 * Telegram and auto-SMS, and an undone day off tells them the lesson is back.
 */

export interface GroupDayOffDto {
  id: string;
  date: string;
  reason: string;
  /** Start of the lesson that was taken off, when the schedule had one that day. */
  startTime: string | null;
  movedTo: { lessonId: string; date: string; startTime: string; endTime: string } | null;
  /** Whether at least one student or parent was told. */
  notified: boolean;
}

export type LessonChangeKind = "lessonCancelled" | "lessonMoved" | "lessonRestored";

const SMS_EVENT: Record<LessonChangeKind, AutoSmsEvent> = {
  lessonCancelled: "LESSON_CANCELLED",
  lessonMoved: "LESSON_MOVED",
  lessonRestored: "LESSON_RESTORED",
};

/** The calendar day in Tashkent (UTC+5). */
export const tashkentToday = (): string =>
  new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString().slice(0, 10);

const movedToInclude = {
  movedTo: { select: { id: true, date: true, startTime: true, endTime: true } },
} as const;

function toDto(
  row: {
    id: string;
    date: Date;
    reason: string;
    startTime: string | null;
    notifiedAt: Date | null;
    movedTo: { id: string; date: Date; startTime: string; endTime: string } | null;
  },
  notified?: boolean,
): GroupDayOffDto {
  return {
    id: row.id,
    date: dateToIso(row.date),
    reason: row.reason,
    startTime: row.startTime,
    movedTo: row.movedTo
      ? {
          lessonId: row.movedTo.id,
          date: dateToIso(row.movedTo.date),
          startTime: row.movedTo.startTime,
          endTime: row.movedTo.endTime,
        }
      : null,
    notified: notified ?? row.notifiedAt !== null,
  };
}

/**
 * Tells the group's current students, and their parents, about a cancelled,
 * moved or restored lesson: one Telegram message per linked chat and one
 * auto-SMS per phone (when that event's switch is on). Idempotent on `refKey`.
 */
export async function notifyLessonChange(
  tx: DbClient,
  input: {
    groupId: string;
    groupName: string;
    kind: LessonChangeKind;
    date: string;
    startTime: string | null;
    endTime: string | null;
    reason: string;
    moveTo: { date: string; startTime: string; endTime: string } | null;
    refKey: string;
  },
): Promise<{ telegram: number; sms: number }> {
  const members = await tx.groupMembership.findMany({
    where: { groupId: input.groupId, status: { in: ["NEW", "TRIAL", "ACTIVE"] } },
    select: { studentId: true },
  });
  const studentIds = [...new Set(members.map((m) => m.studentId))];
  if (studentIds.length === 0) return { telegram: 0, sms: 0 };
  const time = input.startTime
    ? input.endTime
      ? `${input.startTime}–${input.endTime}`
      : input.startTime
    : null;
  const newTime = input.moveTo ? `${input.moveTo.startTime}–${input.moveTo.endTime}` : "";
  const telegram = await notifyStudents(tx, {
    studentIds,
    kind: input.kind,
    refKey: input.refKey,
    values: (locale) => ({
      group: input.groupName,
      date: botDate(locale, input.date),
      time: time ?? "none",
      newDate: input.moveTo ? botDate(locale, input.moveTo.date) : "",
      newTime,
      reason: input.reason,
    }),
  });
  let sms = 0;
  for (const studentId of studentIds) {
    const queued = await queueAutoSms(tx, {
      event: SMS_EVENT[input.kind],
      studentId,
      refKey: `${input.refKey}:${studentId}`,
      vars: {
        groupName: input.groupName,
        date: input.date,
        time: time ?? "",
        newDate: input.moveTo?.date ?? "",
        newTime,
        reason: input.reason,
      },
      toParents: true,
    });
    if (queued) sms += 1;
  }
  return { telegram, sms };
}

export async function listGroupDaysOff(
  actor: Actor,
  id: string,
  db: DbClient = prisma,
): Promise<GroupDayOffDto[]> {
  authorize(actor, "groups.view");
  await findGroupInScope(db, actor, id, {});
  const rows = await db.groupDayOff.findMany({
    where: { groupId: id },
    include: movedToInclude,
    orderBy: { date: "asc" },
  });
  return rows.map((r) => toDto(r));
}

/** "Dam berish": the group skips that day; an unmarked lesson on it is removed or moved (A-53, A-117). */
export async function addGroupDayOff(
  actor: Actor,
  id: string,
  input: GroupDayOffInput,
  db: DbClient = prisma,
): Promise<GroupDayOffDto> {
  authorize(actor, "groups.update");
  const group = await findGroupInScope(db, actor, id, { slots: true });
  const date = isoToDate(input.date);
  const planned = await db.lesson.findFirst({
    where: { groupId: id, date, isExtra: false },
    select: { startTime: true, endTime: true },
  });
  const slot = group.slots.find((s) => s.weekday === isoWeekday(input.date));
  const startTime = planned?.startTime ?? slot?.startTime ?? null;
  const endTime = planned?.endTime ?? slot?.endTime ?? null;
  try {
    return await db.$transaction(async (tx) => {
      const row = await tx.groupDayOff.create({
        data: { groupId: id, date, reason: input.reason, startTime },
      });
      await tx.lesson.deleteMany({
        where: {
          groupId: id,
          date,
          isExtra: false,
          attendances: { none: {} },
          grades: { none: {} },
        },
      });
      let movedTo: GroupDayOffDto["movedTo"] = null;
      if (input.moveTo) {
        const moveTo = input.moveTo;
        const lesson = await tx.lesson
          .create({
            data: {
              groupId: id,
              date: isoToDate(moveTo.date),
              startTime: moveTo.startTime,
              endTime: moveTo.endTime,
              isExtra: true,
            },
          })
          .catch((error: unknown) => {
            if (prismaCode(error) === "P2002") {
              throw AppError.validation({ moveTo: ["validation.lessonExists"] });
            }
            throw error;
          });
        await tx.groupDayOff.update({
          where: { id: row.id },
          data: { movedToLessonId: lesson.id },
        });
        movedTo = {
          lessonId: lesson.id,
          date: moveTo.date,
          startTime: lesson.startTime,
          endTime: lesson.endTime,
        };
      }
      let notified = { telegram: 0, sms: 0 };
      if (input.notify && input.date >= tashkentToday()) {
        notified = await notifyLessonChange(tx, {
          groupId: id,
          groupName: group.name,
          kind: movedTo ? "lessonMoved" : "lessonCancelled",
          date: input.date,
          startTime,
          endTime,
          reason: input.reason,
          moveTo: input.moveTo ?? null,
          refKey: `dayoff:${row.id}`,
        });
        if (notified.telegram + notified.sms > 0) {
          await tx.groupDayOff.update({ where: { id: row.id }, data: { notifiedAt: new Date() } });
        }
      }
      const dto: GroupDayOffDto = {
        id: row.id,
        date: input.date,
        reason: input.reason,
        startTime,
        movedTo,
        notified: notified.telegram + notified.sms > 0,
      };
      await recordAudit(tx, actor, {
        action: "group.dayOff",
        entity: "Group",
        entityId: id,
        after: { ...dto, ...notified },
        branchId: group.branchId,
      });
      return dto;
    });
  } catch (error) {
    rethrowAsAppError(error, "date");
  }
}

/** Undoes a day off: the planned lesson comes back, an unmarked moved lesson goes, and the families hear (A-117). */
export async function removeGroupDayOff(
  actor: Actor,
  groupId: string,
  dayOffId: string,
  db: DbClient = prisma,
): Promise<void> {
  authorize(actor, "groups.update");
  const group = await findGroupInScope(db, actor, groupId, { slots: true });
  await db.$transaction(async (tx) => {
    const row = await mustFind(
      tx.groupDayOff.findFirst({
        where: { id: dayOffId, groupId },
        include: {
          movedTo: {
            select: { id: true, _count: { select: { attendances: true, grades: true } } },
          },
        },
      }),
    );
    await tx.groupDayOff.delete({ where: { id: row.id } });
    if (row.movedTo && row.movedTo._count.attendances === 0 && row.movedTo._count.grades === 0) {
      await tx.lesson.delete({ where: { id: row.movedTo.id } });
    }
    await syncLessons(
      tx,
      {
        id: group.id,
        branchId: group.branchId,
        startDate: group.startDate,
        endDate: group.endDate,
      },
      group.slots,
    );
    const date = dateToIso(row.date);
    const slot = group.slots.find((s) => s.weekday === isoWeekday(date));
    let notified = { telegram: 0, sms: 0 };
    if (row.notifiedAt && date >= tashkentToday()) {
      notified = await notifyLessonChange(tx, {
        groupId,
        groupName: group.name,
        kind: "lessonRestored",
        date,
        startTime: row.startTime ?? slot?.startTime ?? null,
        endTime: slot?.endTime ?? null,
        reason: row.reason,
        moveTo: null,
        refKey: `dayoff:${row.id}:restored`,
      });
    }
    await recordAudit(tx, actor, {
      action: "group.dayOffRemove",
      entity: "Group",
      entityId: groupId,
      before: { id: row.id, date, reason: row.reason, startTime: row.startTime },
      after: notified,
      branchId: group.branchId,
    });
  });
}
