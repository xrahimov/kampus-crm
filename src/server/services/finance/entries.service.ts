import type { Prisma } from "@/generated/prisma/client";
import {
  CATEGORY_ENTRY_TYPES,
  STAFF_ENTRY_TYPES,
  type FinanceEntryFilters,
  type FinanceEntryInput,
  type FinanceEntryType,
} from "@/lib/validation/finance";
import { recordAudit } from "@/server/audit/audit";
import { prisma, type DbClient } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";
import { authorize, branchScope, canAccessAllBranches, type Actor } from "@/server/rbac/authorize";
import {
  dateToIso,
  decimalToNumber,
  getOrganizationId,
  isoToDate,
  mustFind,
} from "@/server/services/settings/shared";

import { assertBranch, financeBranch, periodRange } from "./shared";

/* The finance ledger (EXP §9 sub-pages): advances, marketing, category rows, bonuses, fines, investments. */

export interface FinanceEntryDto {
  id: string;
  type: FinanceEntryType;
  branchId: string;
  branchName: string;
  categoryId: string | null;
  categoryName: string | null;
  paymentMethodId: string | null;
  paymentMethodName: string | null;
  amount: number;
  date: string;
  comment: string | null;
  staffId: string | null;
  staffName: string | null;
  studentId: string | null;
  studentName: string | null;
  counterparty: string | null;
  createdByName: string | null;
  createdAt: string;
}

export interface FinanceEntryListDto {
  items: FinanceEntryDto[];
  total: number;
}

export interface FinanceOptions {
  staff: Array<{ id: string; fullName: string }>;
  paymentMethods: Array<{ id: string; name: string }>;
  categories: Array<{ id: string; kind: "EXPENSE" | "INCOME"; name: string }>;
  branches: Array<{ id: string; name: string }>;
}

const include = {
  branch: { select: { name: true } },
  category: { select: { name: true } },
  paymentMethod: { select: { name: true } },
  staff: { select: { fullName: true } },
  student: { select: { fullName: true } },
  createdBy: { select: { fullName: true } },
} satisfies Prisma.FinanceEntryInclude;
type Row = Prisma.FinanceEntryGetPayload<{ include: typeof include }>;

function toDto(row: Row): FinanceEntryDto {
  return {
    id: row.id,
    type: row.type,
    branchId: row.branchId,
    branchName: row.branch.name,
    categoryId: row.categoryId,
    categoryName: row.category?.name ?? null,
    paymentMethodId: row.paymentMethodId,
    paymentMethodName: row.paymentMethod?.name ?? null,
    amount: decimalToNumber(row.amount),
    date: dateToIso(row.date),
    comment: row.comment,
    staffId: row.staffId,
    staffName: row.staff?.fullName ?? null,
    studentId: row.studentId,
    studentName: row.student?.fullName ?? null,
    counterparty: row.counterparty,
    createdByName: row.createdBy?.fullName ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export async function listEntries(
  actor: Actor,
  filters: FinanceEntryFilters,
  db: DbClient = prisma,
): Promise<FinanceEntryListDto> {
  authorize(actor, "finance.view");
  const where: Prisma.FinanceEntryWhereInput = {
    ...financeBranch(actor, filters.branchId),
    type: filters.type,
    ...(filters.categoryId ? { categoryId: filters.categoryId } : {}),
    ...(filters.paymentMethodId ? { paymentMethodId: filters.paymentMethodId } : {}),
    ...(filters.staffId ? { staffId: filters.staffId } : {}),
  };
  if (filters.year) {
    const { from, to } = periodRange(filters.year, filters.month);
    where.date = { gte: from, lte: to };
  }
  const [rows, sum] = await Promise.all([
    db.financeEntry.findMany({
      where,
      include,
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    }),
    db.financeEntry.aggregate({ where, _sum: { amount: true } }),
  ]);
  return { items: rows.map(toDto), total: sum._sum.amount ? decimalToNumber(sum._sum.amount) : 0 };
}

async function checkRefs(db: DbClient, input: FinanceEntryInput) {
  if (input.categoryId) {
    const category = await mustFind(
      db.financeCategory.findUnique({ where: { id: input.categoryId } }),
      "errors.categoryNotFound",
    );
    if (category.kind !== input.type) {
      throw AppError.validation({ categoryId: ["validation.categoryKind"] });
    }
  }
  if (input.paymentMethodId) {
    const n = await db.paymentMethod.count({ where: { id: input.paymentMethodId } });
    if (n === 0) throw AppError.validation({ paymentMethodId: ["validation.required"] });
  }
  if (input.staffId) {
    const n = await db.user.count({ where: { id: input.staffId, isArchived: false } });
    if (n === 0) throw AppError.validation({ staffId: ["validation.staffUnknown"] });
  }
  if (input.studentId) {
    const n = await db.student.count({ where: { id: input.studentId, branchId: input.branchId } });
    if (n === 0) throw AppError.validation({ studentId: ["validation.studentRequired"] });
  }
}

function entryData(input: FinanceEntryInput, createdById: string | null) {
  const staffOnly = STAFF_ENTRY_TYPES.includes(input.type);
  return {
    type: input.type,
    branchId: input.branchId,
    categoryId: CATEGORY_ENTRY_TYPES.includes(input.type) ? (input.categoryId ?? null) : null,
    paymentMethodId: input.paymentMethodId ?? null,
    amount: input.amount,
    date: isoToDate(input.date),
    comment: input.comment ?? null,
    staffId: input.staffId ?? null,
    studentId: staffOnly ? null : (input.studentId ?? null),
    counterparty: input.type === "INVESTMENT" ? (input.counterparty ?? null) : null,
    ...(createdById ? { createdById } : {}),
  };
}

export async function createEntry(
  actor: Actor,
  input: FinanceEntryInput,
  db: DbClient = prisma,
): Promise<FinanceEntryDto> {
  authorize(actor, "finance.create");
  assertBranch(actor, input.branchId);
  await checkRefs(db, input);
  return db.$transaction(async (tx) => {
    const row = await tx.financeEntry.create({
      data: entryData(input, actor.userId || null),
      include,
    });
    const dto = toDto(row);
    await recordAudit(tx, actor, {
      action: "finance.entry.create",
      entity: "FinanceEntry",
      entityId: row.id,
      after: dto,
      branchId: input.branchId,
    });
    return dto;
  });
}

async function findEntry(db: DbClient, actor: Actor, id: string): Promise<Row> {
  const row = await mustFind(
    db.financeEntry.findFirst({ where: { id, ...(branchScope(actor) ?? {}) }, include }),
    "errors.entryNotFound",
  );
  return row;
}

export async function updateEntry(
  actor: Actor,
  id: string,
  input: FinanceEntryInput,
  db: DbClient = prisma,
): Promise<FinanceEntryDto> {
  authorize(actor, "finance.update");
  const row = await findEntry(db, actor, id);
  if (input.type !== row.type) throw AppError.validation({ type: ["validation.entryType"] });
  assertBranch(actor, input.branchId);
  await checkRefs(db, input);
  return db.$transaction(async (tx) => {
    const updated = await tx.financeEntry.update({
      where: { id },
      data: entryData(input, null),
      include,
    });
    const dto = toDto(updated);
    await recordAudit(tx, actor, {
      action: "finance.entry.update",
      entity: "FinanceEntry",
      entityId: id,
      before: toDto(row),
      after: dto,
      branchId: input.branchId,
    });
    return dto;
  });
}

export async function deleteEntry(actor: Actor, id: string, db: DbClient = prisma): Promise<void> {
  authorize(actor, "finance.delete");
  const row = await findEntry(db, actor, id);
  await db.$transaction(async (tx) => {
    await tx.financeEntry.delete({ where: { id } });
    await recordAudit(tx, actor, {
      action: "finance.entry.delete",
      entity: "FinanceEntry",
      entityId: id,
      before: toDto(row),
      branchId: row.branchId,
    });
  });
}

/** Selects for the entry dialogs: staff, payment methods, categories, branches. */
export async function getFinanceOptions(
  actor: Actor,
  db: DbClient = prisma,
): Promise<FinanceOptions> {
  authorize(actor, "finance.view");
  const organizationId = await getOrganizationId(db);
  const scope = branchScope(actor) ?? {};
  const [staff, paymentMethods, categories, branches] = await Promise.all([
    db.user.findMany({
      where: {
        isArchived: false,
        ...(Object.keys(scope).length ? { branches: { some: scope } } : {}),
      },
      select: { id: true, fullName: true },
      orderBy: { fullName: "asc" },
    }),
    db.paymentMethod.findMany({
      where: { organizationId, isActive: true },
      select: { id: true, name: true },
      orderBy: { sortOrder: "asc" },
    }),
    db.financeCategory.findMany({
      where: { organizationId },
      select: { id: true, kind: true, name: true },
      orderBy: [{ kind: "asc" }, { sortOrder: "asc" }],
    }),
    db.branch.findMany({
      where: {
        organizationId,
        isActive: true,
        ...(canAccessAllBranches(actor) ? {} : { id: { in: actor.branchIds } }),
      },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return { staff, paymentMethods, categories, branches };
}

/** "TALABA" counterparty picker: students of the actor's branches by name or phone. */
export async function searchFinanceStudents(
  actor: Actor,
  q: string,
  db: DbClient = prisma,
): Promise<Array<{ id: string; fullName: string; phone: string | null; branchId: string }>> {
  authorize(actor, "finance.view");
  if (q.trim().length < 2) return [];
  return db.student.findMany({
    where: {
      ...(branchScope(actor) ?? {}),
      isArchived: false,
      OR: [{ fullName: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }],
    },
    select: { id: true, fullName: true, phone: true, branchId: true },
    orderBy: { fullName: "asc" },
    take: 10,
  });
}

/** Totals per entry type for the overview cards (advances, marketing, bonuses, fines, investments). */
export async function sumEntriesByType(
  actor: Actor,
  period: { branchId?: string; year: number; month?: number },
  db: DbClient = prisma,
): Promise<Record<FinanceEntryType, number>> {
  authorize(actor, "finance.view");
  const { from, to } = periodRange(period.year, period.month);
  const rows = await db.financeEntry.groupBy({
    by: ["type"],
    where: { ...financeBranch(actor, period.branchId), date: { gte: from, lte: to } },
    _sum: { amount: true },
  });
  const out = Object.fromEntries(
    ["EXPENSE", "INCOME", "ADVANCE", "MARKETING", "BONUS", "PENALTY", "INVESTMENT"].map((t) => [
      t,
      0,
    ]),
  ) as Record<FinanceEntryType, number>;
  for (const r of rows) out[r.type] = r._sum.amount ? decimalToNumber(r._sum.amount) : 0;
  return out;
}
