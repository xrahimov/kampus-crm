import type { Prisma } from "@/generated/prisma/client";
import { APP_TIME_ZONE } from "@/lib/dates";
import type { CashCloseFilters, CashCloseInput, CashDayInput } from "@/lib/validation/finance";
import { recordAudit } from "@/server/audit/audit";
import { prisma, type DbClient } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";
import { authorize, authorizeAny, branchScope, can, type Actor } from "@/server/rbac/authorize";
import { notifyStaff } from "@/server/services/integrations/bot-recipients.service";
import { dateToIso, decimalToNumber, isoToDate, mustFind } from "@/server/services/settings/shared";

import { assertBranch, periodRange } from "./shared";

/*
 * Cashier day close (A-122). A close is one cashier's day in one branch: everything that
 * cashier recorded between 00:00 and 24:00 Tashkent time, by payment method, the cash the
 * drawer should hold, the cash counted, and the hand-over to whoever accepts it.
 */

/** One payment method's line of a day: all amounts in so'm, bonuses excluded. */
export interface CashMethodTotal {
  methodId: string | null;
  name: string | null;
  isCash: boolean;
  /** Payments received. */
  payments: number;
  /** Ledger income entries paid with this method. */
  income: number;
  /** Refunds given back. */
  refunds: number;
  /** Ledger outflows (expenses, marketing, advances, bonuses) paid with this method. */
  expenses: number;
  /** payments + income − refunds − expenses. */
  net: number;
}

export interface CashDayDto {
  branchId: string;
  branchName: string;
  cashierId: string;
  cashierName: string;
  date: string;
  methods: CashMethodTotal[];
  paymentsCount: number;
  /** Payments received over every method. */
  received: number;
  /** The net of the methods marked as cash. */
  expectedCash: number;
  /** False when no payment method is marked as cash, so expected cash is always zero. */
  hasCashMethod: boolean;
}

export interface CashCloseDto extends CashDayDto {
  id: string;
  countedCash: number;
  difference: number;
  note: string | null;
  acceptedById: string | null;
  acceptedByName: string | null;
  acceptedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

/** The dialog's preview: the day so far, and the close already saved for it, if any. */
export interface CashDayPreviewDto extends CashDayDto {
  existing: {
    id: string;
    countedCash: number;
    difference: number;
    acceptedAt: string | null;
  } | null;
}

export interface CashCloseListDto {
  items: CashCloseDto[];
  totals: { expectedCash: number; countedCash: number; difference: number; pending: number };
}

/** Ledger entry types that take money out of the drawer (the finance overview's outflows). */
const CASH_OUTFLOW = ["EXPENSE", "MARKETING", "ADVANCE", "BONUS"] as const;

const include = {
  branch: { select: { name: true } },
  cashier: { select: { fullName: true } },
  acceptedBy: { select: { fullName: true } },
} satisfies Prisma.CashCloseInclude;
type Row = Prisma.CashCloseGetPayload<{ include: typeof include }>;

const round2 = (v: number) => Math.round(v * 100) / 100;

/** The calendar day in Tashkent that `at` falls on, "YYYY-MM-DD". */
export function tashkentDate(at: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: APP_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

/** Start (inclusive) and end (exclusive) of a Tashkent calendar day; Uzbekistan keeps UTC+5 all year. */
function dayBounds(date: string): { gte: Date; lt: Date } {
  const gte = new Date(`${date}T00:00:00+05:00`);
  return { gte, lt: new Date(gte.getTime() + 24 * 60 * 60 * 1000) };
}

function sum(values: Array<{ toString(): string } | null | undefined>): number {
  let total = 0;
  for (const v of values) if (v) total += decimalToNumber(v);
  return round2(total);
}

function toDto(row: Row): CashCloseDto {
  const methods = (row.totals as unknown as CashMethodTotal[]) ?? [];
  return {
    id: row.id,
    branchId: row.branchId,
    branchName: row.branch.name,
    cashierId: row.cashierId,
    cashierName: row.cashier.fullName,
    date: dateToIso(row.date),
    methods,
    paymentsCount: row.paymentsCount,
    received: round2(methods.reduce((acc, m) => acc + m.payments, 0)),
    expectedCash: decimalToNumber(row.expectedCash),
    hasCashMethod: methods.some((m) => m.isCash),
    countedCash: decimalToNumber(row.countedCash),
    difference: decimalToNumber(row.difference),
    note: row.note,
    acceptedById: row.acceptedById,
    acceptedByName: row.acceptedBy?.fullName ?? null,
    acceptedAt: row.acceptedAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

/**
 * What one cashier recorded in one branch during one Tashkent day, by payment method: the
 * payments they received, the refunds they gave and the ledger entries they created with a
 * method. Goes by when the row was entered, not by the date typed on it: the money moved then.
 */
async function summarizeDay(
  db: DbClient,
  organizationId: string,
  branchId: string,
  cashierId: string,
  date: string,
): Promise<CashDayDto> {
  const inDay = dayBounds(date);
  const [branch, cashier, methods, payments, refunds, entries] = await Promise.all([
    db.branch.findUniqueOrThrow({ where: { id: branchId }, select: { name: true } }),
    db.user.findUniqueOrThrow({ where: { id: cashierId }, select: { fullName: true } }),
    db.paymentMethod.findMany({
      where: { organizationId },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      select: { id: true, name: true, isCash: true, isActive: true },
    }),
    db.payment.groupBy({
      by: ["paymentMethodId"],
      where: { branchId, receivedById: cashierId, createdAt: inDay },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    db.refund.findMany({
      where: { refundedById: cashierId, createdAt: inDay, payment: { branchId } },
      select: { amount: true, payment: { select: { paymentMethodId: true } } },
    }),
    db.financeEntry.groupBy({
      by: ["paymentMethodId", "type"],
      where: {
        branchId,
        createdById: cashierId,
        createdAt: inDay,
        type: { in: [...CASH_OUTFLOW, "INCOME"] },
      },
      _sum: { amount: true },
    }),
  ]);

  const lines = new Map<string | null, CashMethodTotal>();
  const line = (methodId: string | null): CashMethodTotal => {
    let l = lines.get(methodId);
    if (!l) {
      const method = methodId ? methods.find((m) => m.id === methodId) : undefined;
      l = {
        methodId,
        name: method?.name ?? null,
        isCash: method?.isCash ?? false,
        payments: 0,
        income: 0,
        refunds: 0,
        expenses: 0,
        net: 0,
      };
      lines.set(methodId, l);
    }
    return l;
  };
  for (const m of methods) if (m.isActive) line(m.id);
  let paymentsCount = 0;
  for (const p of payments) {
    line(p.paymentMethodId).payments += sum([p._sum.amount]);
    paymentsCount += p._count._all;
  }
  for (const r of refunds) line(r.payment.paymentMethodId).refunds += decimalToNumber(r.amount);
  for (const e of entries) {
    const l = line(e.paymentMethodId);
    if (e.type === "INCOME") l.income += sum([e._sum.amount]);
    else l.expenses += sum([e._sum.amount]);
  }
  const rows = [...lines.values()]
    .map((l) => ({
      ...l,
      payments: round2(l.payments),
      income: round2(l.income),
      refunds: round2(l.refunds),
      expenses: round2(l.expenses),
      net: round2(l.payments + l.income - l.refunds - l.expenses),
    }))
    // Inactive methods and "no method" show up only when something was recorded on them.
    .filter((l) => {
      const method = l.methodId ? methods.find((m) => m.id === l.methodId) : undefined;
      return method?.isActive || l.payments || l.income || l.refunds || l.expenses;
    });
  return {
    branchId,
    branchName: branch.name,
    cashierId,
    cashierName: cashier.fullName,
    date,
    methods: rows,
    paymentsCount,
    received: round2(rows.reduce((acc, l) => acc + l.payments, 0)),
    expectedCash: round2(rows.filter((l) => l.isCash).reduce((acc, l) => acc + l.net, 0)),
    hasCashMethod: methods.some((m) => m.isCash),
  };
}

function cashScope(actor: Actor, branchId?: string): Prisma.CashCloseWhereInput {
  if (branchId) {
    assertBranch(actor, branchId);
    return { branchId };
  }
  return branchScope(actor);
}

/** The day as it stands now, for the "Close the day" dialog. */
export async function previewCashDay(
  actor: Actor,
  input: CashDayInput,
  db: DbClient = prisma,
): Promise<CashDayPreviewDto> {
  authorize(actor, "payments.create");
  assertBranch(actor, input.branchId);
  if (!actor.userId) throw AppError.forbidden();
  const [day, existing] = await Promise.all([
    summarizeDay(db, actor.organizationId, input.branchId, actor.userId, input.date),
    db.cashClose.findUnique({
      where: {
        branchId_cashierId_date: {
          branchId: input.branchId,
          cashierId: actor.userId,
          date: isoToDate(input.date),
        },
      },
      select: { id: true, countedCash: true, difference: true, acceptedAt: true },
    }),
  ]);
  return {
    ...day,
    existing: existing
      ? {
          id: existing.id,
          countedCash: decimalToNumber(existing.countedCash),
          difference: decimalToNumber(existing.difference),
          acceptedAt: existing.acceptedAt?.toISOString() ?? null,
        }
      : null,
  };
}

/**
 * "Close the day": freezes the day's figures with the cash counted. A day closed but not yet
 * accepted may be closed again (the row is replaced); an accepted day may not.
 */
export async function closeCashDay(
  actor: Actor,
  input: CashCloseInput,
  db: DbClient = prisma,
): Promise<CashCloseDto> {
  authorize(actor, "payments.create");
  assertBranch(actor, input.branchId);
  if (!actor.userId) throw AppError.forbidden();
  if (input.date > tashkentDate()) throw AppError.validation({ date: ["validation.futureDate"] });
  const cashierId = actor.userId;
  const organizationId = actor.organizationId;
  const day = await summarizeDay(db, organizationId, input.branchId, cashierId, input.date);
  const key = { branchId: input.branchId, cashierId, date: isoToDate(input.date) };
  return db.$transaction(async (tx) => {
    const existing = await tx.cashClose.findUnique({
      where: { branchId_cashierId_date: key },
      include,
    });
    if (existing?.acceptedAt) throw AppError.conflict("errors.cashCloseAccepted");
    const data = {
      totals: day.methods as unknown as Prisma.InputJsonValue,
      paymentsCount: day.paymentsCount,
      expectedCash: day.expectedCash,
      countedCash: input.countedCash,
      difference: round2(input.countedCash - day.expectedCash),
      note: input.note ?? null,
    };
    const row = existing
      ? await tx.cashClose.update({ where: { id: existing.id }, data, include })
      : await tx.cashClose.create({ data: { organizationId, ...key, ...data }, include });
    const dto = toDto(row);
    const figures = (c: CashCloseDto) => ({
      date: c.date,
      payments: c.paymentsCount,
      received: c.received,
      expectedCash: c.expectedCash,
      countedCash: c.countedCash,
      difference: c.difference,
      note: c.note,
    });
    await recordAudit(tx, actor, {
      action: existing ? "cashClose.update" : "cashClose.create",
      entity: "CashClose",
      entityId: row.id,
      before: existing ? figures(toDto(existing)) : undefined,
      after: figures(dto),
      branchId: input.branchId,
    });
    // The staff Telegram feed (A-85), in the office's language like the payment lines.
    const money = (v: number) => `${new Intl.NumberFormat("ru-RU").format(v)} so'm`;
    await notifyStaff(tx, {
      organizationId,
      branchId: input.branchId,
      text:
        `Kassa yopildi: ${dto.branchName}, ${dto.date} — ${actor.fullName}. ` +
        `Naqd kutilgan ${money(dto.expectedCash)}, sanalgan ${money(dto.countedCash)}, ` +
        `farq ${money(dto.difference)}.`,
    });
    return dto;
  });
}

/** Closes in scope: `finance.view` sees every cashier's, anyone else only their own. */
export async function listCashCloses(
  actor: Actor,
  filters: CashCloseFilters = {},
  db: DbClient = prisma,
): Promise<CashCloseListDto> {
  authorizeAny(actor, ["finance.view", "payments.create"]);
  const where: Prisma.CashCloseWhereInput = {
    organizationId: actor.organizationId,
    ...cashScope(actor, filters.branchId),
  };
  if (!can(actor, "finance.view")) where.cashierId = actor.userId;
  else if (filters.cashierId) where.cashierId = filters.cashierId;
  if (filters.year) {
    const { from, to } = periodRange(filters.year, filters.month);
    where.date = { gte: from, lte: to };
  }
  const rows = await db.cashClose.findMany({
    where,
    include,
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });
  const items = rows.map(toDto);
  return {
    items,
    totals: {
      expectedCash: round2(items.reduce((acc, c) => acc + c.expectedCash, 0)),
      countedCash: round2(items.reduce((acc, c) => acc + c.countedCash, 0)),
      difference: round2(items.reduce((acc, c) => acc + c.difference, 0)),
      pending: items.filter((c) => !c.acceptedAt).length,
    },
  };
}

export async function getCashClose(
  actor: Actor,
  id: string,
  db: DbClient = prisma,
): Promise<CashCloseDto> {
  authorizeAny(actor, ["finance.view", "payments.create"]);
  const row = await mustFind(
    db.cashClose.findFirst({ where: { id, organizationId: actor.organizationId }, include }),
  );
  assertBranch(actor, row.branchId);
  if (!can(actor, "finance.view") && row.cashierId !== actor.userId) throw AppError.forbidden();
  return toDto(row);
}

/** The hand-over: whoever may change finance signs for the money. Accepting twice is a no-op. */
export async function acceptCashClose(
  actor: Actor,
  id: string,
  db: DbClient = prisma,
): Promise<CashCloseDto> {
  authorize(actor, "finance.update");
  const row = await mustFind(
    db.cashClose.findFirst({ where: { id, organizationId: actor.organizationId }, include }),
  );
  assertBranch(actor, row.branchId);
  if (row.acceptedAt) return toDto(row);
  return db.$transaction(async (tx) => {
    const updated = await tx.cashClose.update({
      where: { id },
      data: { acceptedById: actor.userId || null, acceptedAt: new Date() },
      include,
    });
    const dto = toDto(updated);
    await recordAudit(tx, actor, {
      action: "cashClose.accept",
      entity: "CashClose",
      entityId: id,
      after: {
        date: dto.date,
        cashier: dto.cashierName,
        expectedCash: dto.expectedCash,
        countedCash: dto.countedCash,
        difference: dto.difference,
      },
      branchId: row.branchId,
    });
    return dto;
  });
}

/** How many closes a period holds and how many still wait for the hand-over (finance overview card). */
export async function countCashCloses(
  actor: Actor,
  period: { branchId?: string; year: number; month?: number },
  db: DbClient = prisma,
): Promise<{ count: number; pending: number }> {
  authorizeAny(actor, ["finance.view", "payments.create"]);
  const { from, to } = periodRange(period.year, period.month);
  const where: Prisma.CashCloseWhereInput = {
    organizationId: actor.organizationId,
    ...cashScope(actor, period.branchId),
    date: { gte: from, lte: to },
  };
  if (!can(actor, "finance.view")) where.cashierId = actor.userId;
  const [count, pending] = await Promise.all([
    db.cashClose.count({ where }),
    db.cashClose.count({ where: { ...where, acceptedAt: null } }),
  ]);
  return { count, pending };
}
