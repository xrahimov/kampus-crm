import type { PayrollStatus } from "@/lib/validation/finance";
import type { SalaryMethod } from "@/lib/validation/staff";
import { prisma, type DbClient } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";
import type { Actor } from "@/server/rbac/authorize";
import { dateToIso, decimalToNumber } from "@/server/services/settings/shared";

import { computePayrollLines, monthBounds, type PayrollComputedLine } from "./payroll.service";

/* "My salary" (A-127): a staff member's own pay for a month, computed the payroll way. */

export interface MySalaryDto {
  /** "YYYY-MM". */
  month: string;
  /** Whether the person is paid at all: a salary rule, or a group to teach. */
  paid: boolean;
  /** The default rule from the staff card and its rate (percent, or so'm). */
  method: SalaryMethod | null;
  rate: number | null;
  /** The running figures of the month, group by group. */
  line: PayrollComputedLine;
  /** The accountant's line for the month, once the payroll was opened. */
  official: {
    status: "MODERATION" | "APPROVED";
    net: number;
    approvedAt: string | null;
    approvedBy: string | null;
    runStatus: PayrollStatus;
  } | null;
  /** Bonuses, fines and advances of the month, newest first. */
  entries: Array<{
    id: string;
    type: "BONUS" | "PENALTY" | "ADVANCE";
    date: string;
    amount: number;
    comment: string | null;
  }>;
  /** Earlier months the accountant computed, newest first. */
  history: Array<{
    month: string;
    net: number;
    status: "MODERATION" | "APPROVED";
    runStatus: PayrollStatus;
  }>;
  rules: { payOnlyAttendedLessons: boolean; payTeacherOnGroupDayOff: boolean };
}

const n = decimalToNumber;

function rateOf(user: {
  salaryMethod: SalaryMethod | null;
  fixedSalary: unknown;
  percentShare: unknown;
  perLessonFee: unknown;
  perStudentFee: unknown;
}): number | null {
  const value = {
    MONTHLY: user.fixedSalary,
    PERCENT: user.percentShare,
    PER_LESSON: user.perLessonFee,
    PER_STUDENT: user.perStudentFee,
  }[user.salaryMethod ?? "MONTHLY"];
  return user.salaryMethod && value !== null && value !== undefined
    ? n(value as Parameters<typeof n>[0])
    : null;
}

/** The signed-in person's own pay for `month` ("YYYY-MM"); no permission beyond being signed in. */
export async function getMySalary(
  actor: Actor,
  month: string,
  db: DbClient = prisma,
): Promise<MySalaryDto> {
  if (!actor.userId) throw AppError.unauthenticated();
  const { from, to } = monthBounds(month);
  const organizationId = actor.organizationId;
  const [user, settings, computed, official, entries, history] = await Promise.all([
    db.user.findUniqueOrThrow({
      where: { id: actor.userId },
      select: {
        salaryMethod: true,
        fixedSalary: true,
        percentShare: true,
        perLessonFee: true,
        perStudentFee: true,
        _count: { select: { groupsTaught: true } },
      },
    }),
    db.orgSettings.findFirst({
      where: { organizationId },
      select: { payOnlyAttendedLessons: true, payTeacherOnGroupDayOff: true },
    }),
    computePayrollLines(db, actor, from, to, { userId: actor.userId }),
    db.payrollLine.findFirst({
      where: { userId: actor.userId, run: { organizationId, month: from } },
      include: { run: { select: { status: true } }, approvedBy: { select: { fullName: true } } },
    }),
    db.financeEntry.findMany({
      where: {
        staffId: actor.userId,
        type: { in: ["BONUS", "PENALTY", "ADVANCE"] },
        date: { gte: from, lte: to },
      },
      orderBy: [{ date: "desc" }, { createdAt: "desc" }],
      select: { id: true, type: true, date: true, amount: true, comment: true },
    }),
    db.payrollLine.findMany({
      where: { userId: actor.userId, run: { organizationId } },
      include: { run: { select: { month: true, status: true } } },
      orderBy: { run: { month: "desc" } },
      take: 12,
    }),
  ]);
  const line: PayrollComputedLine = computed[0] ?? {
    userId: actor.userId,
    fullName: actor.fullName,
    roleName: "",
    fixed: 0,
    percent: 0,
    perLesson: 0,
    perStudent: 0,
    bonus: 0,
    penalty: 0,
    penaltyCount: 0,
    advance: 0,
    net: 0,
    details: [],
  };
  return {
    month,
    paid: user.salaryMethod !== null || user._count.groupsTaught > 0,
    method: user.salaryMethod,
    rate: rateOf(user),
    line,
    official: official
      ? {
          status: official.status,
          net: n(official.net),
          approvedAt: official.approvedAt?.toISOString() ?? null,
          approvedBy: official.approvedBy?.fullName ?? null,
          runStatus: official.run.status,
        }
      : null,
    entries: entries.map((e) => ({
      id: e.id,
      type: e.type as "BONUS" | "PENALTY" | "ADVANCE",
      date: dateToIso(e.date),
      amount: n(e.amount),
      comment: e.comment,
    })),
    history: history.map((h) => ({
      month: dateToIso(h.run.month).slice(0, 7),
      net: n(h.net),
      status: h.status,
      runStatus: h.run.status,
    })),
    rules: {
      payOnlyAttendedLessons: settings?.payOnlyAttendedLessons ?? false,
      payTeacherOnGroupDayOff: settings?.payTeacherOnGroupDayOff ?? false,
    },
  };
}
