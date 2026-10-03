import type { Page } from "@/lib/validation/common";
import type { RoomInput } from "@/lib/validation/settings";
import { recordAudit } from "@/server/audit/audit";
import { prisma, type DbClient } from "@/server/db/prisma";
import type { ParsedList } from "@/server/http/list-query";
import { authorize, authorizeBranch, branchScope, type Actor } from "@/server/rbac/authorize";

import { mustFind, rethrowAsAppError } from "./shared";

export interface RoomDto {
  id: string;
  branchId: string;
  branchName: string;
  name: string;
  capacity: number;
}

export const ROOM_SORT_FIELDS = ["name", "capacity", "createdAt"] as const;
export type RoomSortField = (typeof ROOM_SORT_FIELDS)[number];

const include = { branch: { select: { name: true } } };
type Row = NonNullable<
  Awaited<ReturnType<typeof prisma.room.findFirst<{ include: typeof include }>>>
>;
const toDto = (row: Row): RoomDto => ({
  id: row.id,
  branchId: row.branchId,
  branchName: row.branch.name,
  name: row.name,
  capacity: row.capacity,
});

export async function listRooms(
  actor: Actor,
  query: ParsedList<RoomSortField>,
  db: DbClient = prisma,
): Promise<Page<RoomDto>> {
  authorize(actor, "settings.catalog");
  const where = {
    ...branchScope(actor),
    ...(query.q ? { name: { contains: query.q, mode: "insensitive" as const } } : {}),
  };
  const [total, rows] = await Promise.all([
    db.room.count({ where }),
    db.room.findMany({
      where,
      include,
      orderBy: { [query.sort.field]: query.sort.direction },
      skip: query.skip,
      take: query.take,
    }),
  ]);
  return { items: rows.map(toDto), page: query.page, pageSize: query.pageSize, total };
}

export async function createRoom(
  actor: Actor,
  input: RoomInput,
  db: DbClient = prisma,
): Promise<RoomDto> {
  authorize(actor, "settings.catalog");
  authorizeBranch(actor, input.branchId);
  await mustFind(
    db.branch.findFirst({ where: { id: input.branchId, isActive: true } }),
    "errors.branchNotFound",
  );
  try {
    return await db.$transaction(async (tx) => {
      const row = await tx.room.create({ data: input, include });
      const dto = toDto(row);
      await recordAudit(tx, actor, {
        action: "room.create",
        entity: "Room",
        entityId: row.id,
        after: dto,
        branchId: row.branchId,
      });
      return dto;
    });
  } catch (error) {
    rethrowAsAppError(error, "name");
  }
}

export async function updateRoom(
  actor: Actor,
  id: string,
  input: Partial<Omit<RoomInput, "branchId">>,
  db: DbClient = prisma,
): Promise<RoomDto> {
  authorize(actor, "settings.catalog");
  try {
    return await db.$transaction(async (tx) => {
      const existing = await mustFind(tx.room.findUnique({ where: { id }, include }));
      authorizeBranch(actor, existing.branchId);
      const row = await tx.room.update({ where: { id }, data: input, include });
      const after = toDto(row);
      await recordAudit(tx, actor, {
        action: "room.update",
        entity: "Room",
        entityId: id,
        before: toDto(existing),
        after,
        branchId: row.branchId,
      });
      return after;
    });
  } catch (error) {
    rethrowAsAppError(error, "name");
  }
}

export async function deleteRoom(actor: Actor, id: string, db: DbClient = prisma): Promise<void> {
  authorize(actor, "settings.catalog");
  try {
    await db.$transaction(async (tx) => {
      const existing = await mustFind(tx.room.findUnique({ where: { id }, include }));
      authorizeBranch(actor, existing.branchId);
      await tx.room.delete({ where: { id } });
      await recordAudit(tx, actor, {
        action: "room.delete",
        entity: "Room",
        entityId: id,
        before: toDto(existing),
        branchId: existing.branchId,
      });
    });
  } catch (error) {
    rethrowAsAppError(error, "name");
  }
}
