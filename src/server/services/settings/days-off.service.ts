import type { Page } from "@/lib/validation/common";
import type { DayOffInput } from "@/lib/validation/settings";
import { recordAudit } from "@/server/audit/audit";
import { prisma, type DbClient } from "@/server/db/prisma";
import type { ParsedList } from "@/server/http/list-query";
import { authorize, authorizeBranch, branchScope, type Actor } from "@/server/rbac/authorize";
import { notifyLessonChange, tashkentToday } from "@/server/services/groups/day-off.service";
import { syncLessons } from "@/server/services/groups/groups.service";
import { isoWeekday } from "@/server/services/groups/schedule";

import { dateToIso, isoToDate, mustFind, rethrowAsAppError } from "./shared";

export interface DayOffDto {
  id: string;
  branchId: string;
  branchName: string;
  date: string; // YYYY-MM-DD
  reason: string;
}

export const DAY_OFF_SORT_FIELDS = ["date", "createdAt"] as const;
export type DayOffSortField = (typeof DAY_OFF_SORT_FIELDS)[number];

const include = { branch: { select: { name: true } } };
type Row = NonNullable<
  Awaited<ReturnType<typeof prisma.dayOff.findFirst<{ include: typeof include }>>>
>;
const toDto = (row: Row): DayOffDto => ({
  id: row.id,
  branchId: row.branchId,
  branchName: row.branch.name,
  date: dateToIso(row.date),
  reason: row.reason,
});

export async function listDaysOff(
  actor: Actor,
  query: ParsedList<DayOffSortField>,
  db: DbClient = prisma,
): Promise<Page<DayOffDto>> {
  authorize(actor, "settings.catalog");
  const where = {
    ...branchScope(actor),
    ...(query.q ? { reason: { contains: query.q, mode: "insensitive" as const } } : {}),
  };
  const [total, rows] = await Promise.all([
    db.dayOff.count({ where }),
    db.dayOff.findMany({
      where,
      include,
      orderBy: { [query.sort.field]: query.sort.direction },
      skip: query.skip,
      take: query.take,
    }),
  ]);
  return { items: rows.map(toDto), page: query.page, pageSize: query.pageSize, total };
}

export async function createDayOff(
  actor: Actor,
  input: DayOffInput,
  db: DbClient = prisma,
): Promise<DayOffDto> {
  authorize(actor, "settings.catalog");
  authorizeBranch(actor, input.branchId);
  await mustFind(
    db.branch.findFirst({ where: { id: input.branchId, isActive: true } }),
    "errors.branchNotFound",
  );
  try {
    return await db.$transaction(async (tx) => {
      const row = await tx.dayOff.create({
        data: { branchId: input.branchId, date: isoToDate(input.date), reason: input.reason },
        include,
      });
      // The groups meeting that day lose the lesson (A-53) and may hear why (A-117).
      const groups = await groupsMeetingOn(tx, input.branchId, input.date);
      await tx.lesson.deleteMany({
        where: {
          groupId: { in: groups.map((g) => g.id) },
          date: isoToDate(input.date),
          isExtra: false,
          attendances: { none: {} },
          grades: { none: {} },
        },
      });
      const notified = { telegram: 0, sms: 0 };
      if (input.notify && input.date >= tashkentToday()) {
        for (const g of groups) {
          const n = await notifyLessonChange(tx, {
            groupId: g.id,
            groupName: g.name,
            kind: "lessonCancelled",
            date: input.date,
            startTime: g.slots[0]?.startTime ?? null,
            endTime: g.slots[0]?.endTime ?? null,
            reason: input.reason,
            moveTo: null,
            refKey: `holiday:${row.id}:${g.id}`,
          });
          notified.telegram += n.telegram;
          notified.sms += n.sms;
        }
        if (notified.telegram + notified.sms > 0) {
          await tx.dayOff.update({ where: { id: row.id }, data: { notifiedAt: new Date() } });
        }
      }
      const dto = toDto(row);
      await recordAudit(tx, actor, {
        action: "dayOff.create",
        entity: "DayOff",
        entityId: row.id,
        after: { ...dto, groups: groups.length, ...notified },
        branchId: row.branchId,
      });
      return dto;
    });
  } catch (error) {
    rethrowAsAppError(error, "date");
  }
}

/** The branch's current groups with a lesson planned on that date, with that day's slot first. */
async function groupsMeetingOn(tx: DbClient, branchId: string, date: string) {
  const weekday = isoWeekday(date);
  const groups = await tx.group.findMany({
    where: {
      branchId,
      status: { in: ["ACTIVE", "FROZEN", "TRIAL"] },
      startDate: { lte: isoToDate(date) },
      endDate: { gte: isoToDate(date) },
      slots: { some: { weekday } },
    },
    select: {
      id: true,
      name: true,
      branchId: true,
      startDate: true,
      endDate: true,
      slots: { select: { weekday: true, startTime: true, endTime: true } },
    },
  });
  return groups.map((g) => ({
    ...g,
    slots: [...g.slots].sort((a, b) =>
      a.weekday === weekday ? -1 : b.weekday === weekday ? 1 : 0,
    ),
  }));
}

export async function updateDayOff(
  actor: Actor,
  id: string,
  input: Partial<Omit<DayOffInput, "branchId">>,
  db: DbClient = prisma,
): Promise<DayOffDto> {
  authorize(actor, "settings.catalog");
  try {
    return await db.$transaction(async (tx) => {
      const existing = await mustFind(tx.dayOff.findUnique({ where: { id }, include }));
      authorizeBranch(actor, existing.branchId);
      const row = await tx.dayOff.update({
        where: { id },
        data: {
          ...(input.date !== undefined ? { date: isoToDate(input.date) } : {}),
          ...(input.reason !== undefined ? { reason: input.reason } : {}),
        },
        include,
      });
      const after = toDto(row);
      await recordAudit(tx, actor, {
        action: "dayOff.update",
        entity: "DayOff",
        entityId: id,
        before: toDto(existing),
        after,
        branchId: row.branchId,
      });
      return after;
    });
  } catch (error) {
    rethrowAsAppError(error, "date");
  }
}

export async function deleteDayOff(actor: Actor, id: string, db: DbClient = prisma): Promise<void> {
  authorize(actor, "settings.catalog");
  await db.$transaction(async (tx) => {
    const existing = await mustFind(tx.dayOff.findUnique({ where: { id }, include }));
    authorizeBranch(actor, existing.branchId);
    await tx.dayOff.delete({ where: { id } });
    // The lessons come back (A-54) and, when the families were told, so does the word (A-117).
    const date = dateToIso(existing.date);
    const groups = await groupsMeetingOn(tx, existing.branchId, date);
    const notified = { telegram: 0, sms: 0 };
    for (const g of groups) {
      await syncLessons(tx, g, g.slots);
      if (existing.notifiedAt && date >= tashkentToday()) {
        const n = await notifyLessonChange(tx, {
          groupId: g.id,
          groupName: g.name,
          kind: "lessonRestored",
          date,
          startTime: g.slots[0]?.startTime ?? null,
          endTime: g.slots[0]?.endTime ?? null,
          reason: existing.reason,
          moveTo: null,
          refKey: `holiday:${existing.id}:${g.id}:restored`,
        });
        notified.telegram += n.telegram;
        notified.sms += n.sms;
      }
    }
    await recordAudit(tx, actor, {
      action: "dayOff.delete",
      entity: "DayOff",
      entityId: id,
      before: toDto(existing),
      after: { groups: groups.length, ...notified },
      branchId: existing.branchId,
    });
  });
}
