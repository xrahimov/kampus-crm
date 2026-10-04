import type { Prisma } from "@/generated/prisma/client";
import type { FinanceCategoryInput, FinanceKind } from "@/lib/validation/finance";
import { recordAudit } from "@/server/audit/audit";
import { prisma, type DbClient } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";
import { authorize, type Actor } from "@/server/rbac/authorize";
import {
  decimalToNumber,
  getOrganizationId,
  mustFind,
  rethrowAsAppError,
} from "@/server/services/settings/shared";

import { financeBranch, periodRange } from "./shared";

/* "Chiqim hisoboti" / "Kirim hisoboti" categories (EXP §9 "+ BO'LIM"). */

export interface FinanceCategoryDto {
  id: string;
  kind: FinanceKind;
  name: string;
  /** Total of the category's entries in the requested period. */
  total: number;
  count: number;
}

export async function listCategories(
  actor: Actor,
  period: { branchId?: string; year: number; month?: number },
  db: DbClient = prisma,
): Promise<FinanceCategoryDto[]> {
  authorize(actor, "finance.view");
  const organizationId = await getOrganizationId(db);
  const { from, to } = periodRange(period.year, period.month);
  const [rows, sums] = await Promise.all([
    db.financeCategory.findMany({
      where: { organizationId },
      orderBy: [{ kind: "asc" }, { sortOrder: "asc" }, { name: "asc" }],
    }),
    db.financeEntry.groupBy({
      by: ["categoryId"],
      where: {
        ...financeBranch(actor, period.branchId),
        categoryId: { not: null },
        date: { gte: from, lte: to },
      },
      _sum: { amount: true },
      _count: { _all: true },
    }),
  ]);
  const byId = new Map(sums.map((s) => [s.categoryId, s]));
  return rows.map((r) => ({
    id: r.id,
    kind: r.kind,
    name: r.name,
    total: byId.get(r.id)?._sum.amount ? decimalToNumber(byId.get(r.id)!._sum.amount!) : 0,
    count: byId.get(r.id)?._count._all ?? 0,
  }));
}

export async function getCategory(
  actor: Actor,
  id: string,
  db: DbClient = prisma,
): Promise<{ id: string; kind: FinanceKind; name: string }> {
  authorize(actor, "finance.view");
  const row = await mustFind(
    db.financeCategory.findUnique({ where: { id } }),
    "errors.categoryNotFound",
  );
  return { id: row.id, kind: row.kind, name: row.name };
}

export async function createCategory(
  actor: Actor,
  input: FinanceCategoryInput,
  db: DbClient = prisma,
): Promise<{ id: string; kind: FinanceKind; name: string }> {
  authorize(actor, "finance.create");
  const organizationId = await getOrganizationId(db);
  try {
    return await db.$transaction(async (tx) => {
      const last = await tx.financeCategory.aggregate({
        where: { organizationId, kind: input.kind },
        _max: { sortOrder: true },
      });
      const row = await tx.financeCategory.create({
        data: {
          organizationId,
          kind: input.kind,
          name: input.name,
          sortOrder: (last._max.sortOrder ?? 0) + 1,
        },
      });
      await recordAudit(tx, actor, {
        action: "finance.category.create",
        entity: "FinanceCategory",
        entityId: row.id,
        after: { kind: row.kind, name: row.name },
      });
      return { id: row.id, kind: row.kind, name: row.name };
    });
  } catch (error) {
    rethrowAsAppError(error, "name");
  }
}

export async function updateCategory(
  actor: Actor,
  id: string,
  input: { name: string },
  db: DbClient = prisma,
): Promise<{ id: string; kind: FinanceKind; name: string }> {
  authorize(actor, "finance.update");
  const row = await mustFind(
    db.financeCategory.findUnique({ where: { id } }),
    "errors.categoryNotFound",
  );
  try {
    return await db.$transaction(async (tx) => {
      const updated = await tx.financeCategory.update({
        where: { id },
        data: { name: input.name },
      });
      await recordAudit(tx, actor, {
        action: "finance.category.update",
        entity: "FinanceCategory",
        entityId: id,
        before: { name: row.name },
        after: { name: updated.name },
      });
      return { id: updated.id, kind: updated.kind, name: updated.name };
    });
  } catch (error) {
    rethrowAsAppError(error, "name");
  }
}

/** A category with entries stays; move or delete its entries first. */
export async function deleteCategory(
  actor: Actor,
  id: string,
  db: DbClient = prisma,
): Promise<void> {
  authorize(actor, "finance.delete");
  const row = await mustFind(
    db.financeCategory.findUnique({ where: { id } }),
    "errors.categoryNotFound",
  );
  const used = await db.financeEntry.count({ where: { categoryId: id } });
  if (used > 0) throw AppError.conflict("errors.categoryHasEntries");
  await db.$transaction(async (tx) => {
    await tx.financeCategory.delete({ where: { id } });
    await recordAudit(tx, actor, {
      action: "finance.category.delete",
      entity: "FinanceCategory",
      entityId: id,
      before: { kind: row.kind, name: row.name },
    });
  });
}

export type CategoryWhere = Prisma.FinanceCategoryWhereInput;
