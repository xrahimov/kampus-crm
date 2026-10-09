import { formatMoneyUz } from "@/lib/dates";
import type { InstalmentsInput } from "@/lib/validation/students";
import { recordAudit } from "@/server/audit/audit";
import { prisma, type DbClient } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";
import { authorize, type Actor } from "@/server/rbac/authorize";
import { findGroupInScope, today } from "@/server/services/groups/shared";
import { dateToIso, decimalToNumber, isoToDate, mustFind } from "@/server/services/settings/shared";
import { queueAutoSms } from "@/server/services/sms/auto-sms.service";
import { botDate, notifyStudents } from "@/server/services/telegram/student-telegram.service";

import { membershipBalances, type MembershipBalance } from "./balances";
import { addMonthsIso, monthStart, monthsBetween } from "./fees";

/*
 * Instalments (A-123): a month's fee split into two or three parts with their
 * own due days. The balance engine counts an unpaid part as a debt only once
 * its day has passed, and the daily job reminds the student shortly before.
 */

/** Days before a part's due day that the reminder goes out. */
export const REMIND_DAYS_BEFORE = 2;

export interface InstalmentPartDto {
  id: string;
  month: string;
  dueDate: string;
  amount: number;
  /** What is still unpaid of this part. */
  remaining: number;
  paid: boolean;
}

export interface InstalmentPlanDto {
  membershipId: string;
  groupName: string;
  studentName: string;
  /** The month the plan is for. */
  month: string;
  /** Months that may be split: from the first unpaid one to the next one. */
  months: string[];
  /** The month's fee: its charge, or the monthly price when it is not charged yet. */
  amount: number;
  parts: InstalmentPartDto[];
  balance: number;
  deferred: number;
}

const membershipSelect = {
  id: true,
  studentId: true,
  groupId: true,
  status: true,
  group: { select: { name: true, branchId: true, startDate: true, endDate: true } },
  student: { select: { fullName: true } },
} as const;

async function findMembership(db: DbClient, actor: Actor, membershipId: string) {
  const m = await mustFind(
    db.groupMembership.findUnique({ where: { id: membershipId }, select: membershipSelect }),
    "errors.memberUnknown",
  );
  await findGroupInScope(db, actor, m.groupId, {});
  return m;
}

/** The months a split may be made for, oldest first; never empty. */
function splittableMonths(
  m: { group: { startDate: Date; endDate: Date } },
  balance: MembershipBalance,
): string[] {
  const current = monthStart(today());
  const start = monthStart(dateToIso(m.group.startDate));
  const end = monthStart(dateToIso(m.group.endDate));
  const from = balance.suggestedMonth < current ? balance.suggestedMonth : current;
  const to = addMonthsIso(current, 1);
  const months = monthsBetween(from < start ? start : from, to > end ? end : to);
  return months.length > 0 ? months : [current];
}

async function planFor(
  db: DbClient,
  m: Awaited<ReturnType<typeof findMembership>>,
  month: string | null | undefined,
): Promise<InstalmentPlanDto> {
  const balance = (await membershipBalances(db, [m.id])).get(m.id)!;
  const months = splittableMonths(m, balance);
  const chosen =
    month && months.includes(month)
      ? month
      : months.includes(balance.suggestedMonth)
        ? balance.suggestedMonth
        : months[0]!;
  const [charge, rows] = await Promise.all([
    db.charge.findUnique({
      where: { membershipId_month: { membershipId: m.id, month: isoToDate(chosen) } },
      select: { amount: true },
    }),
    db.instalment.findMany({
      where: { membershipId: m.id, month: isoToDate(chosen) },
      orderBy: [{ dueDate: "asc" }, { id: "asc" }],
    }),
  ]);
  const state = new Map(balance.instalments.map((p) => [p.id, p]));
  return {
    membershipId: m.id,
    groupName: m.group.name,
    studentName: m.student.fullName,
    month: chosen,
    months,
    amount: charge ? decimalToNumber(charge.amount) : balance.monthlyPrice,
    parts: rows.map((r) => {
      const p = state.get(r.id);
      const amount = decimalToNumber(r.amount);
      return {
        id: r.id,
        month: chosen,
        dueDate: dateToIso(r.dueDate),
        amount,
        remaining: p?.remaining ?? 0,
        paid: p?.paid ?? true,
      };
    }),
    balance: balance.balance,
    deferred: balance.deferred,
  };
}

export async function getInstalmentPlan(
  actor: Actor,
  membershipId: string,
  month?: string | null,
  db: DbClient = prisma,
): Promise<InstalmentPlanDto> {
  authorize(actor, "students.view");
  const m = await findMembership(db, actor, membershipId);
  return planFor(db, m, month);
}

/** Replaces the parts of one month; they must add up to the month's fee. */
export async function setInstalments(
  actor: Actor,
  membershipId: string,
  input: InstalmentsInput,
  db: DbClient = prisma,
): Promise<InstalmentPlanDto> {
  authorize(actor, "payments.create");
  const m = await findMembership(db, actor, membershipId);
  const plan = await planFor(db, m, input.month);
  if (plan.month !== input.month) throw AppError.validation({ month: ["validation.date"] });
  const parts = [...input.parts].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  if (new Set(parts.map((p) => p.dueDate)).size !== parts.length) {
    throw AppError.validation({ parts: ["validation.instalmentsDays"] });
  }
  const sum = parts.reduce((s, p) => s + p.amount, 0);
  if (Math.abs(sum - plan.amount) > 0.5) {
    throw AppError.validation({ parts: ["validation.instalmentsSum"] });
  }
  await db.$transaction(async (tx) => {
    await tx.instalment.deleteMany({ where: { membershipId, month: isoToDate(input.month) } });
    await tx.instalment.createMany({
      data: parts.map((p) => ({
        membershipId,
        month: isoToDate(input.month),
        dueDate: isoToDate(p.dueDate),
        amount: p.amount,
        createdById: actor.userId || null,
      })),
    });
    await recordAudit(tx, actor, {
      action: "instalment.set",
      entity: "GroupMembership",
      entityId: membershipId,
      before: plan.parts.length > 0 ? { month: plan.month, parts: plan.parts } : undefined,
      after: { month: input.month, parts },
      branchId: m.group.branchId,
    });
  });
  return planFor(db, m, input.month);
}

/** Removes the split of one month; the whole fee is due with the month again. */
export async function clearInstalments(
  actor: Actor,
  membershipId: string,
  month: string,
  db: DbClient = prisma,
): Promise<InstalmentPlanDto> {
  authorize(actor, "payments.create");
  const m = await findMembership(db, actor, membershipId);
  const plan = await planFor(db, m, month);
  if (plan.parts.length > 0) {
    await db.$transaction(async (tx) => {
      await tx.instalment.deleteMany({ where: { membershipId, month: isoToDate(plan.month) } });
      await recordAudit(tx, actor, {
        action: "instalment.clear",
        entity: "GroupMembership",
        entityId: membershipId,
        before: { month: plan.month, parts: plan.parts },
        branchId: m.group.branchId,
      });
    });
  }
  return planFor(db, m, plan.month);
}

const addDays = (iso: string, days: number) =>
  dateToIso(new Date(isoToDate(iso).getTime() + days * 86_400_000));

/**
 * Daily: tells students (Telegram, and SMS when the INSTALMENT_DUE text is on)
 * about a part that falls due within the next days and is still unpaid. Each
 * part is reminded once.
 */
export async function runInstalmentReminders(
  db: DbClient,
  todayIso: string = today(),
): Promise<{ reminded: number }> {
  const due = await db.instalment.findMany({
    where: {
      remindedAt: null,
      dueDate: { gte: isoToDate(todayIso), lte: isoToDate(addDays(todayIso, REMIND_DAYS_BEFORE)) },
      membership: { status: { in: ["ACTIVE", "FROZEN"] }, student: { isArchived: false } },
    },
    select: {
      id: true,
      membershipId: true,
      dueDate: true,
      membership: { select: { studentId: true, group: { select: { name: true } } } },
    },
  });
  if (due.length === 0) return { reminded: 0 };
  const balances = await membershipBalances(db, [...new Set(due.map((d) => d.membershipId))]);
  let reminded = 0;
  for (const part of due) {
    const state = balances.get(part.membershipId)?.instalments.find((p) => p.id === part.id);
    await db.$transaction(async (tx) => {
      if (state && state.remaining > 0) {
        const dueIso = dateToIso(part.dueDate);
        const groupName = part.membership.group.name;
        const amount = formatMoneyUz(state.remaining);
        await notifyStudents(tx, {
          studentIds: [part.membership.studentId],
          kind: "instalment",
          refKey: `instalment:${part.id}`,
          values: (locale) => ({ group: groupName, amount, date: botDate(locale, dueIso) }),
        });
        await queueAutoSms(tx, {
          event: "INSTALMENT_DUE",
          studentId: part.membership.studentId,
          refKey: `instalment:${part.id}`,
          vars: { groupName, amount, date: dueIso },
        });
        reminded += 1;
      }
      await tx.instalment.update({ where: { id: part.id }, data: { remindedAt: new Date() } });
    });
  }
  return { reminded };
}
