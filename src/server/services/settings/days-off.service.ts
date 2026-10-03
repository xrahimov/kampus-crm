import type { Page } from "@/lib/validation/common";
import type { DayOffInput } from "@/lib/validation/settings";
import { recordAudit } from "@/server/audit/audit";
import { prisma, type DbClient } from "@/server/db/prisma";
import type { ParsedList } from "@/server/http/list-query";
import { authorize, authorizeBranch, branchScope, type Actor } from "@/server/rbac/authorize";

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
      const dto = toDto(row);
      await recordAudit(tx, actor, {
        action: "dayOff.create",
        entity: "DayOff",
        entityId: row.id,
        after: dto,
        branchId: row.branchId,
      });
      return dto;
    });
  } catch (error) {
    rethrowAsAppError(error, "date");
  }
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
    await recordAudit(tx, actor, {
      action: "dayOff.delete",
      entity: "DayOff",
      entityId: id,
      before: toDto(existing),
      branchId: existing.branchId,
    });
  });
}
