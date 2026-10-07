import type { Page } from "@/lib/validation/common";
import type { SchoolInput } from "@/lib/validation/settings";
import { recordAudit } from "@/server/audit/audit";
import { prisma, type DbClient } from "@/server/db/prisma";
import type { ParsedList } from "@/server/http/list-query";
import { authorize, type Actor } from "@/server/rbac/authorize";

import { mustFind, rethrowAsAppError } from "./shared";

export interface SchoolDto {
  id: string;
  name: string;
  /** Students are added in Phase 6; until then this is always 0. */
  studentsCount: number;
}

export const SCHOOL_SORT_FIELDS = ["name", "createdAt"] as const;
export type SchoolSortField = (typeof SCHOOL_SORT_FIELDS)[number];

const select = { id: true, name: true } as const;
const toDto = (row: { id: string; name: string }): SchoolDto => ({ ...row, studentsCount: 0 });

/** Schools are organisation-wide (EXP §8 shows no branch column). */
export async function listSchools(
  actor: Actor,
  query: ParsedList<SchoolSortField>,
  db: DbClient = prisma,
): Promise<Page<SchoolDto>> {
  authorize(actor, "settings.catalog");
  const organizationId = actor.organizationId;
  const where = {
    organizationId,
    ...(query.q ? { name: { contains: query.q, mode: "insensitive" as const } } : {}),
  };
  const [total, rows] = await Promise.all([
    db.school.count({ where }),
    db.school.findMany({
      where,
      select,
      orderBy: { [query.sort.field]: query.sort.direction },
      skip: query.skip,
      take: query.take,
    }),
  ]);
  return { items: rows.map(toDto), page: query.page, pageSize: query.pageSize, total };
}

export async function createSchool(
  actor: Actor,
  input: SchoolInput,
  db: DbClient = prisma,
): Promise<SchoolDto> {
  authorize(actor, "settings.catalog");
  const organizationId = actor.organizationId;
  try {
    return await db.$transaction(async (tx) => {
      const row = await tx.school.create({ data: { organizationId, ...input }, select });
      await recordAudit(tx, actor, {
        action: "school.create",
        entity: "School",
        entityId: row.id,
        after: row,
        branchId: null,
      });
      return toDto(row);
    });
  } catch (error) {
    rethrowAsAppError(error, "name");
  }
}

export async function updateSchool(
  actor: Actor,
  id: string,
  input: Partial<SchoolInput>,
  db: DbClient = prisma,
): Promise<SchoolDto> {
  authorize(actor, "settings.catalog");
  try {
    return await db.$transaction(async (tx) => {
      const before = await mustFind(
        tx.school.findFirst({ where: { id, organizationId: actor.organizationId }, select }),
      );
      const after = await tx.school.update({ where: { id }, data: input, select });
      await recordAudit(tx, actor, {
        action: "school.update",
        entity: "School",
        entityId: id,
        before,
        after,
        branchId: null,
      });
      return toDto(after);
    });
  } catch (error) {
    rethrowAsAppError(error, "name");
  }
}

export async function deleteSchool(actor: Actor, id: string, db: DbClient = prisma): Promise<void> {
  authorize(actor, "settings.catalog");
  try {
    await db.$transaction(async (tx) => {
      const before = await mustFind(
        tx.school.findFirst({ where: { id, organizationId: actor.organizationId }, select }),
      );
      await tx.school.delete({ where: { id } });
      await recordAudit(tx, actor, {
        action: "school.delete",
        entity: "School",
        entityId: id,
        before,
        branchId: null,
      });
    });
  } catch (error) {
    rethrowAsAppError(error, "name");
  }
}
