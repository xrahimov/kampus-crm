import type {
  DebtCaseStatus,
  DebtCloseReason,
  DebtContactChannel,
  DebtContactOutcome,
  Prisma,
} from "@/generated/prisma/client";
import { formatMoneyUz } from "@/lib/dates";
import type { Page } from "@/lib/validation/common";
import type {
  DebtContactInput,
  DebtFilters,
  DebtListFilter,
  DebtSortField,
} from "@/lib/validation/debts";
import { recordAudit } from "@/server/audit/audit";
import { prisma, type DbClient } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";
import type { ParsedList } from "@/server/http/list-query";
import { authorize, authorizeBranch, branchScope, type Actor } from "@/server/rbac/authorize";
import { notifyUsers } from "@/server/services/dashboard/notifications.service";
import { dateToIso, decimalToNumber, isoToDate, mustFind } from "@/server/services/settings/shared";
import { queueAutoSms } from "@/server/services/sms/auto-sms.service";
import { membershipBalances } from "@/server/services/students/balances";
import { notifyStudents } from "@/server/services/telegram/student-telegram.service";

/*
 * Debt collection (A-112). A case follows one student's debt in one branch from
 * the day the balance turns short until it is paid: who was contacted, what was
 * promised and which automatic reminders went out. Cases are reconciled with the
 * balance engine whenever they are listed, after every payment or correction,
 * and once a day by the worker, which also runs the reminder cadence
 * (Telegram → SMS → task for the branch managers).
 */

export interface DebtGroupDto {
  membershipId: string;
  groupId: string;
  groupName: string;
  balance: number;
}

export interface DebtCaseDto {
  id: string;
  studentId: string;
  studentName: string;
  phone: string | null;
  parentPhone: string | null;
  branchId: string;
  branchName: string;
  groups: DebtGroupDto[];
  /** What the student owes in this branch, as a positive amount. */
  amount: number;
  openedAt: string;
  daysOverdue: number;
  status: DebtCaseStatus;
  promisedAt: string | null;
  promisedAmount: number | null;
  /** The promised day has passed and the case is open again. */
  promiseMissed: boolean;
  brokenPromises: number;
  lastContactAt: string | null;
  lastChannel: DebtContactChannel | null;
  lastOutcome: DebtContactOutcome | null;
  lastContactBy: string | null;
  /** The cadence asked the managers to call and nobody has logged a contact since. */
  needsCall: boolean;
  telegramAt: string | null;
  smsAt: string | null;
  closedAt: string | null;
  closedReason: DebtCloseReason | null;
  hasTelegram: boolean;
}

export interface DebtContactDto {
  id: string;
  channel: DebtContactChannel;
  outcome: DebtContactOutcome | null;
  promisedAt: string | null;
  promisedAmount: number | null;
  note: string | null;
  auto: boolean;
  createdBy: string | null;
  createdAt: string;
}

export interface DebtSummaryDto {
  debtors: number;
  amount: number;
  promised: number;
  needsCall: number;
}

export interface DebtListDto extends Page<DebtCaseDto> {
  summary: DebtSummaryDto;
}

const CENTS = 0.005;
const today = (): string => dateToIso(new Date());
const keyOf = (studentId: string, branchId: string) => `${studentId}:${branchId}`;

/** Whole days from one calendar day to another, never negative. */
export function daysBetween(fromIso: string, toIso: string): number {
  const ms = isoToDate(toIso).getTime() - isoToDate(fromIso).getTime();
  return Math.max(0, Math.round(ms / 86_400_000));
}

interface DebtTotal {
  studentId: string;
  branchId: string;
  amount: number;
  /** The first unpaid month, when the engine knows it. */
  since: string | null;
  groups: DebtGroupDto[];
}

/**
 * Every student who owes money in the given branches, from the same balance
 * engine the profile uses (A-59): memberships of any status count, so a debt
 * left on a finished group is still collected, but archived students are not.
 */
async function debtTotals(
  db: DbClient,
  scope: { branchIds?: string[]; studentIds?: string[] },
): Promise<Map<string, DebtTotal>> {
  const memberships = await db.groupMembership.findMany({
    where: {
      student: {
        isArchived: false,
        ...(scope.studentIds ? { id: { in: scope.studentIds } } : {}),
      },
      ...(scope.branchIds ? { group: { branchId: { in: scope.branchIds } } } : {}),
    },
    select: {
      id: true,
      studentId: true,
      group: { select: { id: true, name: true, branchId: true } },
    },
  });
  const balances = await membershipBalances(
    db,
    memberships.map((m) => m.id),
  );
  const totals = new Map<string, DebtTotal & { total: number }>();
  for (const m of memberships) {
    const b = balances.get(m.id);
    if (!b) continue;
    const key = keyOf(m.studentId, m.group.branchId);
    const t = totals.get(key) ?? {
      studentId: m.studentId,
      branchId: m.group.branchId,
      total: 0,
      amount: 0,
      since: null,
      groups: [],
    };
    t.total += b.balance;
    t.groups.push({
      membershipId: m.id,
      groupId: m.group.id,
      groupName: m.group.name,
      balance: b.balance,
    });
    // A short membership's next payment date is its first unpaid month.
    if (b.balance < 0 && b.nextPaymentDate && (!t.since || b.nextPaymentDate < t.since)) {
      t.since = b.nextPaymentDate;
    }
    totals.set(key, t);
  }
  const debtors = new Map<string, DebtTotal>();
  for (const [key, t] of totals) {
    if (t.total >= -CENTS) continue;
    debtors.set(key, {
      studentId: t.studentId,
      branchId: t.branchId,
      amount: Math.round(-t.total * 100) / 100,
      since: t.since,
      groups: t.groups,
    });
  }
  return debtors;
}

export interface DebtSyncResult {
  opened: number;
  closed: number;
  totals: Map<string, DebtTotal>;
}

/**
 * Brings the cases of the given branches (or students) in line with the balances:
 * opens a case for every new debtor, refreshes amounts, settles promises and
 * closes cases whose debt is gone.
 */
export async function syncDebtCases(
  db: DbClient,
  scope: { branchIds?: string[]; studentIds?: string[] },
  todayIso: string = today(),
): Promise<DebtSyncResult> {
  const totals = await debtTotals(db, scope);
  const open = await db.debtCase.findMany({
    where: {
      status: { not: "CLOSED" },
      ...(scope.branchIds ? { branchId: { in: scope.branchIds } } : {}),
      ...(scope.studentIds ? { studentId: { in: scope.studentIds } } : {}),
    },
    include: { student: { select: { fullName: true, isArchived: true } } },
  });
  const byKey = new Map(open.map((c) => [keyOf(c.studentId, c.branchId), c]));
  const now = new Date();
  let opened = 0;
  let closed = 0;

  for (const [key, t] of totals) {
    const existing = byKey.get(key);
    if (!existing) {
      await db.debtCase.create({
        data: {
          studentId: t.studentId,
          branchId: t.branchId,
          openedAt: isoToDate(t.since ?? todayIso),
          amount: t.amount,
        },
      });
      opened += 1;
      continue;
    }
    const data: Prisma.DebtCaseUncheckedUpdateInput = {};
    if (Math.abs(decimalToNumber(existing.amount) - t.amount) > CENTS) data.amount = t.amount;
    if (existing.status === "PROMISED") {
      const promised = existing.promisedAmount ? decimalToNumber(existing.promisedAmount) : null;
      const before = existing.amountAtPromise ? decimalToNumber(existing.amountAtPromise) : null;
      const promisedAt = existing.promisedAt ? dateToIso(existing.promisedAt) : null;
      if (promised !== null && before !== null && before - t.amount >= promised - CENTS) {
        // The promised sum arrived but the debt is not gone: back to the ordinary cadence.
        Object.assign(data, {
          status: "OPEN",
          promisedAt: null,
          promisedAmount: null,
          amountAtPromise: null,
          contacts: { create: { channel: "NOTE", outcome: "PROMISE_KEPT", auto: true } },
        } satisfies Prisma.DebtCaseUncheckedUpdateInput);
      } else if (promisedAt && promisedAt < todayIso) {
        Object.assign(data, {
          status: "OPEN",
          brokenPromises: { increment: 1 },
          amountAtPromise: null,
          taskAt: now,
          contacts: { create: { channel: "NOTE", outcome: "PROMISE_BROKEN", auto: true } },
        } satisfies Prisma.DebtCaseUncheckedUpdateInput);
        await notifyUsers(db, {
          kind: "DEBT_PROMISE_BROKEN",
          params: { name: existing.student.fullName, amount: t.amount, date: promisedAt },
          href: `/debts?status=OPEN&q=${encodeURIComponent(existing.student.fullName)}`,
          branchId: t.branchId,
          permission: "payments.create",
        });
      }
    }
    if (Object.keys(data).length > 0) {
      await db.debtCase.update({ where: { id: existing.id }, data });
    }
  }

  for (const c of open) {
    if (totals.has(keyOf(c.studentId, c.branchId))) continue;
    const reason: DebtCloseReason = c.student.isArchived
      ? "LEFT"
      : c.status === "PROMISED"
        ? "PROMISE_KEPT"
        : "PAID";
    await db.debtCase.update({
      where: { id: c.id },
      data: { status: "CLOSED", closedAt: now, closedReason: reason, taskAt: null },
    });
    closed += 1;
  }
  return { opened, closed, totals };
}

/** Keeps a student's cases in step right after a payment, refund or correction. */
export async function refreshStudentDebts(tx: DbClient, studentId: string): Promise<void> {
  await syncDebtCases(tx, { studentIds: [studentId] });
}

const DEFAULT_CADENCE = { debtTelegramDays: 1, debtSmsDays: 3, debtTaskDays: 7 };

export interface DebtCollectionRun {
  opened: number;
  closed: number;
  telegram: number;
  sms: number;
  tasks: number;
}

/** Names of the groups the student is short in, for the reminder texts. */
function shortGroups(total: DebtTotal | undefined): string {
  return (total?.groups ?? [])
    .filter((g) => g.balance < 0)
    .map((g) => g.groupName)
    .join(", ");
}

/**
 * The daily cadence (job `auto-sms.daily`), once per centre: reconcile the cases,
 * then for every open case send the Telegram reminder after `debtTelegramDays`,
 * the debtor SMS after `debtSmsDays` (the Auto SMS switch and text still apply),
 * and after `debtTaskDays` without a contact flag the case and tell the branch
 * managers once per day. A promise pauses all three until its day.
 */
export async function runDailyDebtCollection(
  db: DbClient,
  todayIso: string = today(),
  /** Limits the run to some branches (tests); the worker runs every centre. */
  scope: { branchIds?: string[] } = {},
): Promise<DebtCollectionRun> {
  const result: DebtCollectionRun = { opened: 0, closed: 0, telegram: 0, sms: 0, tasks: 0 };
  const orgs = await db.organization.findMany({
    select: {
      id: true,
      settings: { select: { debtTelegramDays: true, debtSmsDays: true, debtTaskDays: true } },
      branches: { select: { id: true } },
    },
  });
  for (const org of orgs) {
    const branchIds = org.branches
      .map((b) => b.id)
      .filter((id) => !scope.branchIds || scope.branchIds.includes(id));
    if (branchIds.length === 0) continue;
    const synced = await syncDebtCases(db, { branchIds }, todayIso);
    result.opened += synced.opened;
    result.closed += synced.closed;
    const cadence = org.settings ?? DEFAULT_CADENCE;
    const cases = await db.debtCase.findMany({
      where: { status: "OPEN", branchId: { in: branchIds } },
    });
    const tasks = new Map<string, number>();
    for (const c of cases) {
      const openedAt = dateToIso(c.openedAt);
      const days = daysBetween(openedAt, todayIso);
      const total = synced.totals.get(keyOf(c.studentId, c.branchId));
      const amount = total?.amount ?? decimalToNumber(c.amount);
      const groups = shortGroups(total);
      await db.$transaction(async (tx) => {
        const data: Prisma.DebtCaseUncheckedUpdateInput = {};
        const contacts: Array<{ channel: DebtContactChannel; auto: boolean }> = [];
        if (
          cadence.debtTelegramDays !== null &&
          days >= cadence.debtTelegramDays &&
          !c.telegramAt
        ) {
          const queued = await notifyStudents(tx, {
            studentIds: [c.studentId],
            kind: "debtor",
            refKey: `debt:${c.id}:telegram`,
            values: { group: groups, debt: formatMoneyUz(amount) },
          });
          data.telegramAt = new Date();
          if (queued > 0) {
            contacts.push({ channel: "TELEGRAM", auto: true });
            result.telegram += 1;
          }
        }
        if (cadence.debtSmsDays !== null && days >= cadence.debtSmsDays && !c.smsAt) {
          const ok = await queueAutoSms(tx, {
            event: "DEBTOR",
            studentId: c.studentId,
            refKey: `debt:${c.id}:sms`,
            vars: { groupName: groups, debt: String(Math.round(amount)) },
          });
          data.smsAt = new Date();
          if (ok) {
            contacts.push({ channel: "SMS", auto: true });
            result.sms += 1;
          }
        }
        if (cadence.debtTaskDays !== null && !c.taskAt) {
          // Counted from the last time somebody spoke to the student, or from the debt's start.
          const lastContact = c.lastContactAt ? dateToIso(c.lastContactAt) : null;
          const since = lastContact && lastContact > openedAt ? lastContact : openedAt;
          if (daysBetween(since, todayIso) >= cadence.debtTaskDays) {
            data.taskAt = new Date();
            tasks.set(c.branchId, (tasks.get(c.branchId) ?? 0) + 1);
            result.tasks += 1;
          }
        }
        if (Object.keys(data).length === 0) return;
        await tx.debtCase.update({
          where: { id: c.id },
          data: { ...data, ...(contacts.length > 0 ? { contacts: { create: contacts } } : {}) },
        });
      });
    }
    for (const [branchId, count] of tasks) {
      await notifyUsers(db, {
        kind: "DEBT_TASK",
        params: { count, days: cadence.debtTaskDays ?? 0, day: todayIso },
        href: `/debts?branchId=${branchId}&status=NEEDS_CALL`,
        branchId,
        permission: "payments.create",
      });
    }
  }
  return result;
}

// --- Reading and working the cases -----------------------------------------------

const caseInclude = {
  student: {
    select: {
      fullName: true,
      phone: true,
      telegramChats: { select: { id: true }, take: 1 },
      parents: { select: { phone: true }, take: 1, orderBy: { createdAt: "asc" } },
    },
  },
  branch: { select: { name: true } },
  contacts: {
    where: { auto: false },
    orderBy: { createdAt: "desc" },
    take: 1,
    select: { createdBy: { select: { fullName: true } } },
  },
} satisfies Prisma.DebtCaseInclude;
type CaseRow = Prisma.DebtCaseGetPayload<{ include: typeof caseInclude }>;

function toDto(row: CaseRow, groups: DebtGroupDto[], todayIso: string): DebtCaseDto {
  const openedAt = dateToIso(row.openedAt);
  const promisedAt = row.promisedAt ? dateToIso(row.promisedAt) : null;
  return {
    id: row.id,
    studentId: row.studentId,
    studentName: row.student.fullName,
    phone: row.student.phone,
    parentPhone: row.student.parents[0]?.phone ?? null,
    branchId: row.branchId,
    branchName: row.branch.name,
    groups,
    amount: decimalToNumber(row.amount),
    openedAt,
    daysOverdue: daysBetween(openedAt, row.closedAt ? dateToIso(row.closedAt) : todayIso),
    status: row.status,
    promisedAt,
    promisedAmount: row.promisedAmount ? decimalToNumber(row.promisedAmount) : null,
    // A promise date left on an open case can only be a missed one: kept promises clear it.
    promiseMissed: row.status === "OPEN" && promisedAt !== null,
    brokenPromises: row.brokenPromises,
    lastContactAt: row.lastContactAt?.toISOString() ?? null,
    lastChannel: row.lastChannel,
    lastOutcome: row.lastOutcome,
    lastContactBy: row.contacts[0]?.createdBy?.fullName ?? null,
    needsCall: row.status === "OPEN" && row.taskAt !== null,
    telegramAt: row.telegramAt?.toISOString() ?? null,
    smsAt: row.smsAt?.toISOString() ?? null,
    closedAt: row.closedAt?.toISOString() ?? null,
    closedReason: row.closedReason,
    hasTelegram: row.student.telegramChats.length > 0,
  };
}

function statusWhere(filter: DebtListFilter): Prisma.DebtCaseWhereInput {
  switch (filter) {
    case "OPEN":
      return { status: "OPEN" };
    case "PROMISED":
      return { status: "PROMISED" };
    case "NEEDS_CALL":
      return { status: "OPEN", taskAt: { not: null } };
    case "CLOSED":
      return { status: "CLOSED" };
    case "ALL":
      return {};
    default:
      return { status: { in: ["OPEN", "PROMISED"] } };
  }
}

function orderOf(
  field: DebtSortField,
  dir: "asc" | "desc",
): Prisma.DebtCaseOrderByWithRelationInput {
  switch (field) {
    case "fullName":
      return { student: { fullName: dir } };
    case "amount":
      return { amount: dir };
    case "promisedAt":
      return { promisedAt: { sort: dir, nulls: "last" } };
    case "lastContactAt":
      return { lastContactAt: { sort: dir, nulls: "last" } };
    default:
      return { openedAt: dir };
  }
}

/** The branches the list may show: the actor's scope, narrowed to one when asked. */
function scopeBranches(actor: Actor, branchId?: string): string[] {
  const scope = branchScope(actor);
  const ids = typeof scope.branchId === "string" ? [scope.branchId] : scope.branchId.in;
  if (!branchId) return ids;
  if (!ids.includes(branchId)) throw AppError.forbidden("errors.branchForbidden");
  return [branchId];
}

/** "/debts": the live debtor list of the branches in scope, longest overdue first. */
export async function listDebtCases(
  actor: Actor,
  query: ParsedList<DebtSortField>,
  filters: DebtFilters,
  db: DbClient = prisma,
): Promise<DebtListDto> {
  authorize(actor, "payments.create");
  const branchIds = scopeBranches(actor, filters.branchId);
  const todayIso = today();
  const { totals } = await syncDebtCases(db, { branchIds }, todayIso);
  const where: Prisma.DebtCaseWhereInput = {
    branchId: { in: branchIds },
    ...statusWhere(filters.status ?? "ACTIVE"),
    ...(query.q
      ? {
          student: {
            OR: [
              { fullName: { contains: query.q, mode: "insensitive" } },
              { phone: { contains: query.q } },
            ],
          },
        }
      : {}),
  };
  const active: Prisma.DebtCaseWhereInput = {
    branchId: { in: branchIds },
    status: { in: ["OPEN", "PROMISED"] },
  };
  const [total, rows, debtors, promised, needsCall, sum] = await Promise.all([
    db.debtCase.count({ where }),
    db.debtCase.findMany({
      where,
      include: caseInclude,
      orderBy: [orderOf(query.sort.field, query.sort.direction), { id: "asc" }],
      skip: query.skip,
      take: query.take,
    }),
    db.debtCase.count({ where: active }),
    db.debtCase.count({ where: { branchId: { in: branchIds }, status: "PROMISED" } }),
    db.debtCase.count({
      where: { branchId: { in: branchIds }, status: "OPEN", taskAt: { not: null } },
    }),
    db.debtCase.aggregate({ where: active, _sum: { amount: true } }),
  ]);
  return {
    items: rows.map((r) =>
      toDto(r, totals.get(keyOf(r.studentId, r.branchId))?.groups ?? [], todayIso),
    ),
    page: query.page,
    pageSize: query.pageSize,
    total,
    summary: {
      debtors,
      amount: sum._sum.amount ? decimalToNumber(sum._sum.amount) : 0,
      promised,
      needsCall,
    },
  };
}

async function findCase(db: DbClient, actor: Actor, id: string): Promise<CaseRow> {
  const row = await mustFind(db.debtCase.findUnique({ where: { id }, include: caseInclude }));
  authorizeBranch(actor, row.branchId);
  return row;
}

export async function getDebtCase(
  actor: Actor,
  id: string,
  db: DbClient = prisma,
): Promise<DebtCaseDto> {
  authorize(actor, "payments.create");
  const row = await findCase(db, actor, id);
  const totals = await debtTotals(db, { studentIds: [row.studentId] });
  return toDto(row, totals.get(keyOf(row.studentId, row.branchId))?.groups ?? [], today());
}

const toContactDto = (c: {
  id: string;
  channel: DebtContactChannel;
  outcome: DebtContactOutcome | null;
  promisedAt: Date | null;
  promisedAmount: Prisma.Decimal | null;
  note: string | null;
  auto: boolean;
  createdAt: Date;
  createdBy: { fullName: string } | null;
}): DebtContactDto => ({
  id: c.id,
  channel: c.channel,
  outcome: c.outcome,
  promisedAt: c.promisedAt ? dateToIso(c.promisedAt) : null,
  promisedAmount: c.promisedAmount ? decimalToNumber(c.promisedAmount) : null,
  note: c.note,
  auto: c.auto,
  createdBy: c.createdBy?.fullName ?? null,
  createdAt: c.createdAt.toISOString(),
});

/** Everything that happened on a case, newest first: staff contacts and automatic rows. */
export async function listDebtContacts(
  actor: Actor,
  caseId: string,
  db: DbClient = prisma,
): Promise<DebtContactDto[]> {
  authorize(actor, "payments.create");
  await findCase(db, actor, caseId);
  const rows = await db.debtContact.findMany({
    where: { caseId },
    orderBy: { createdAt: "desc" },
    include: { createdBy: { select: { fullName: true } } },
  });
  return rows.map(toContactDto);
}

/**
 * A staff member records a call, visit, message or note. "Promised to pay" moves the
 * case to PROMISED with the date and amount; any contact clears the manager's task.
 */
export async function logDebtContact(
  actor: Actor,
  caseId: string,
  input: DebtContactInput,
  db: DbClient = prisma,
): Promise<DebtCaseDto> {
  authorize(actor, "payments.create");
  const row = await findCase(db, actor, caseId);
  if (row.status === "CLOSED") throw AppError.conflict("errors.debtCaseClosed");
  const now = new Date();
  const promised = input.outcome === "PROMISED" && !!input.promisedAt;
  const promisedAt = promised ? isoToDate(input.promisedAt!) : null;
  const promisedAmount = promised ? (input.promisedAmount ?? null) : null;
  await db.$transaction(async (tx) => {
    await tx.debtCase.update({
      where: { id: caseId },
      data: {
        lastContactAt: now,
        lastChannel: input.channel,
        lastOutcome: input.outcome ?? null,
        taskAt: null,
        ...(promised
          ? { status: "PROMISED", promisedAt, promisedAmount, amountAtPromise: row.amount }
          : {}),
        contacts: {
          create: {
            channel: input.channel,
            outcome: input.outcome ?? null,
            promisedAt,
            promisedAmount,
            note: input.note ?? null,
            createdById: actor.userId || null,
          },
        },
      },
    });
    await recordAudit(tx, actor, {
      action: "debt.contact",
      entity: "DebtCase",
      entityId: caseId,
      after: {
        student: row.student.fullName,
        channel: input.channel,
        outcome: input.outcome ?? null,
        promisedAt: input.promisedAt ?? null,
        promisedAmount: promisedAmount,
        note: input.note ?? null,
      },
      branchId: row.branchId,
    });
  });
  return getDebtCase(actor, caseId, db);
}

/** "Send a Telegram reminder" from the row: the debtor text to every chat the student linked. */
export async function sendDebtReminder(
  actor: Actor,
  caseId: string,
  db: DbClient = prisma,
): Promise<{ queued: number }> {
  authorize(actor, "payments.create");
  const row = await findCase(db, actor, caseId);
  if (row.status === "CLOSED") throw AppError.conflict("errors.debtCaseClosed");
  const totals = await debtTotals(db, { studentIds: [row.studentId] });
  const total = totals.get(keyOf(row.studentId, row.branchId));
  const amount = total?.amount ?? decimalToNumber(row.amount);
  return db.$transaction(async (tx) => {
    const queued = await notifyStudents(tx, {
      studentIds: [row.studentId],
      kind: "debtor",
      refKey: `debt:${caseId}:manual:${Date.now()}`,
      values: { group: shortGroups(total), debt: formatMoneyUz(amount) },
    });
    if (queued === 0) return { queued };
    const now = new Date();
    await tx.debtCase.update({
      where: { id: caseId },
      data: {
        lastContactAt: now,
        lastChannel: "TELEGRAM",
        lastOutcome: null,
        taskAt: null,
        telegramAt: row.telegramAt ?? now,
        contacts: { create: { channel: "TELEGRAM", createdById: actor.userId || null } },
      },
    });
    await recordAudit(tx, actor, {
      action: "debt.remind",
      entity: "DebtCase",
      entityId: caseId,
      after: { student: row.student.fullName, chats: queued },
      branchId: row.branchId,
    });
    return { queued };
  });
}
