import type { Prisma } from "@/generated/prisma/client";
import type { PayrollStatus } from "@/lib/validation/finance";
import { recordAudit } from "@/server/audit/audit";
import { prisma, type DbClient } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";
import { authorize, branchScope, type Actor } from "@/server/rbac/authorize";
import { dateToIso, decimalToNumber, isoToDate, mustFind } from "@/server/services/settings/shared";

import { periodRange } from "./shared";

/* "Ish haqi hisobotlari" (EXP §9): monthly payroll computed from the pay rules of A-12. */

export interface PayrollGroupDetail {
  groupId: string;
  groupName: string;
  shareType: "PERCENT" | "PER_LESSON" | "PER_STUDENT";
  shareValue: number;
  coursePrice: number;
  students: number;
  lessons: number;
  amount: number;
}

export interface PayrollLineDto {
  id: string;
  userId: string;
  fullName: string;
  roleName: string;
  fixed: number;
  percent: number;
  perLesson: number;
  perStudent: number;
  bonus: number;
  penalty: number;
  penaltyCount: number;
  advance: number;
  net: number;
  details: PayrollGroupDetail[];
  status: "MODERATION" | "APPROVED";
  approvedByName: string | null;
  approvedAt: string | null;
}

export interface PayrollRunDto {
  id: string;
  month: string;
  status: PayrollStatus;
  computedAt: string;
  staffCount: number;
  approvedCount: number;
  totals: Omit<
    PayrollLineDto,
    | "id"
    | "userId"
    | "fullName"
    | "roleName"
    | "details"
    | "status"
    | "approvedByName"
    | "approvedAt"
  >;
  lines: PayrollLineDto[];
}

export type PayrollSummaryDto = Omit<PayrollRunDto, "lines">;

const lineInclude = {
  user: { select: { fullName: true } },
  approvedBy: { select: { fullName: true } },
} satisfies Prisma.PayrollLineInclude;
type LineRow = Prisma.PayrollLineGetPayload<{ include: typeof lineInclude }>;

const n = decimalToNumber;

function lineDto(row: LineRow): PayrollLineDto {
  return {
    id: row.id,
    userId: row.userId,
    fullName: row.user.fullName,
    roleName: row.roleName,
    fixed: n(row.fixed),
    percent: n(row.percent),
    perLesson: n(row.perLesson),
    perStudent: n(row.perStudent),
    bonus: n(row.bonus),
    penalty: n(row.penalty),
    penaltyCount: row.penaltyCount,
    advance: n(row.advance),
    net: n(row.net),
    details: (row.details as unknown as PayrollGroupDetail[]) ?? [],
    status: row.status,
    approvedByName: row.approvedBy?.fullName ?? null,
    approvedAt: row.approvedAt?.toISOString() ?? null,
  };
}

function totals(lines: PayrollLineDto[]): PayrollRunDto["totals"] {
  const sum = (key: keyof PayrollRunDto["totals"]) =>
    Math.round(lines.reduce((s, l) => s + (l[key] as number), 0) * 100) / 100;
  return {
    fixed: sum("fixed"),
    percent: sum("percent"),
    perLesson: sum("perLesson"),
    perStudent: sum("perStudent"),
    bonus: sum("bonus"),
    penalty: sum("penalty"),
    penaltyCount: lines.reduce((s, l) => s + l.penaltyCount, 0),
    advance: sum("advance"),
    net: sum("net"),
  };
}

function runDto(
  run: { id: string; month: Date; status: PayrollStatus; computedAt: Date },
  lines: PayrollLineDto[],
): PayrollRunDto {
  return {
    id: run.id,
    month: dateToIso(run.month).slice(0, 7),
    status: run.status,
    computedAt: run.computedAt.toISOString(),
    staffCount: lines.length,
    approvedCount: lines.filter((l) => l.status === "APPROVED").length,
    totals: totals(lines),
    lines,
  };
}

const round = (v: number) => Math.round(v * 100) / 100;

/**
 * Computes one month for every staff member who teaches a group or has a
 * salary method (A-12): MONTHLY fixed salary, plus per group the share set on
 * the group (PERCENT of course price × students, PER_LESSON × lessons held,
 * PER_STUDENT × students), plus bonuses, minus fines and advances.
 */
async function computeLines(
  db: DbClient,
  actor: Actor,
  monthStart: Date,
  monthEnd: Date,
): Promise<Array<Omit<PayrollLineDto, "id" | "status" | "approvedByName" | "approvedAt">>> {
  const scope = branchScope(actor);
  const settings = await db.orgSettings.findFirst({
    select: { payOnlyAttendedLessons: true, payTeacherOnGroupDayOff: true },
  });
  const users = await db.user.findMany({
    where: {
      isArchived: false,
      organizationId: actor.organizationId,
      branches: { some: scope },
      OR: [{ salaryMethod: { not: null } }, { groupsTaught: { some: {} } }],
    },
    include: {
      roles: { include: { role: { select: { name: true } } }, take: 1 },
      groupsTaught: {
        where: {
          since: { lte: monthEnd },
          group: { ...scope, startDate: { lte: monthEnd }, endDate: { gte: monthStart } },
        },
        include: {
          group: {
            select: {
              id: true,
              name: true,
              course: { select: { price: true } },
              memberships: {
                where: {
                  status: { notIn: ["NEW", "TRIAL"] },
                  joinedAt: { lte: monthEnd },
                  OR: [{ leftAt: null }, { leftAt: { gte: monthStart } }],
                },
                select: { id: true },
              },
              lessons: {
                where: { date: { gte: monthStart, lte: monthEnd } },
                select: {
                  id: true,
                  attendances: { where: { status: { not: "NOT_MARKED" } }, take: 1 },
                },
              },
              daysOff: {
                where: { date: { gte: monthStart, lte: monthEnd } },
                select: { id: true },
              },
            },
          },
        },
      },
      financeEntries: {
        where: {
          type: { in: ["BONUS", "PENALTY", "ADVANCE"] },
          date: { gte: monthStart, lte: monthEnd },
        },
        select: { type: true, amount: true },
      },
    },
    orderBy: { fullName: "asc" },
  });
  return users.map((u) => {
    const details: PayrollGroupDetail[] = u.groupsTaught.map((gt) => {
      const g = gt.group;
      const students = g.memberships.length;
      const held = settings?.payOnlyAttendedLessons
        ? g.lessons.filter((l) => l.attendances.length > 0).length
        : g.lessons.length;
      const lessons = held + (settings?.payTeacherOnGroupDayOff ? g.daysOff.length : 0);
      const value = n(gt.shareValue);
      const coursePrice = n(g.course.price);
      const amount =
        gt.shareType === "PERCENT"
          ? (value / 100) * coursePrice * students
          : gt.shareType === "PER_LESSON"
            ? value * lessons
            : value * students;
      return {
        groupId: g.id,
        groupName: g.name,
        shareType: gt.shareType,
        shareValue: value,
        coursePrice,
        students,
        lessons,
        amount: round(amount),
      };
    });
    const part = (type: PayrollGroupDetail["shareType"]) =>
      round(details.filter((d) => d.shareType === type).reduce((s, d) => s + d.amount, 0));
    const entries = (type: "BONUS" | "PENALTY" | "ADVANCE") =>
      u.financeEntries.filter((e) => e.type === type);
    const sumOf = (type: "BONUS" | "PENALTY" | "ADVANCE") =>
      round(entries(type).reduce((s, e) => s + n(e.amount), 0));
    const fixed = u.salaryMethod === "MONTHLY" && u.fixedSalary ? n(u.fixedSalary) : 0;
    const percent = part("PERCENT");
    const perLesson = part("PER_LESSON");
    const perStudent = part("PER_STUDENT");
    const bonus = sumOf("BONUS");
    const penalty = sumOf("PENALTY");
    const advance = sumOf("ADVANCE");
    return {
      userId: u.id,
      fullName: u.fullName,
      roleName: u.roles[0]?.role.name ?? "",
      fixed,
      percent,
      perLesson,
      perStudent,
      bonus,
      penalty,
      penaltyCount: entries("PENALTY").length,
      advance,
      net: round(fixed + percent + perLesson + perStudent + bonus - penalty - advance),
      details,
    };
  });
}

function monthBounds(month: string) {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const { from, to } = periodRange(y, m);
  return { from, to };
}

async function loadRun(db: DbClient, organizationId: string, monthStart: Date) {
  return db.payrollRun.findUnique({
    where: { organizationId_month: { organizationId, month: monthStart } },
    include: { lines: { include: lineInclude, orderBy: { user: { fullName: "asc" } } } },
  });
}

/** Writes computed lines, keeping approved ones untouched. */
async function writeLines(
  tx: DbClient,
  runId: string,
  computed: Awaited<ReturnType<typeof computeLines>>,
  approvedUserIds: Set<string>,
) {
  const keep = new Set(approvedUserIds);
  await tx.payrollLine.deleteMany({ where: { runId, userId: { notIn: [...keep] } } });
  for (const line of computed) {
    if (keep.has(line.userId)) continue;
    const { fullName, details, ...rest } = line;
    void fullName;
    await tx.payrollLine.create({
      data: { runId, ...rest, details: details as unknown as Prisma.InputJsonValue },
    });
  }
}

/** The payroll of a month, computed on first open ("/finance/salary-detail/:month"). */
export async function getPayroll(
  actor: Actor,
  month: string,
  db: DbClient = prisma,
): Promise<PayrollRunDto> {
  authorize(actor, "finance.view");
  const organizationId = actor.organizationId;
  const { from, to } = monthBounds(month);
  let run = await loadRun(db, organizationId, from);
  if (!run) {
    const computed = await computeLines(db, actor, from, to);
    await db.$transaction(async (tx) => {
      const created = await tx.payrollRun.create({ data: { organizationId, month: from } });
      await writeLines(tx, created.id, computed, new Set());
      await recordAudit(tx, actor, {
        action: "payroll.compute",
        entity: "PayrollRun",
        entityId: created.id,
        after: { month, staff: computed.length },
      });
    });
    run = await loadRun(db, organizationId, from);
  }
  return runDto(run!, run!.lines.map(lineDto));
}

/** "Qayta hisoblash": recomputes every line that is not approved yet. */
export async function recalculatePayroll(
  actor: Actor,
  month: string,
  db: DbClient = prisma,
): Promise<PayrollRunDto> {
  authorize(actor, "finance.update");
  const organizationId = actor.organizationId;
  const { from, to } = monthBounds(month);
  const run = await loadRun(db, organizationId, from);
  if (!run) return getPayroll(actor, month, db);
  const computed = await computeLines(db, actor, from, to);
  await db.$transaction(async (tx) => {
    await writeLines(
      tx,
      run.id,
      computed,
      new Set(run.lines.filter((l) => l.status === "APPROVED").map((l) => l.userId)),
    );
    await tx.payrollRun.update({ where: { id: run.id }, data: { computedAt: new Date() } });
    await recordAudit(tx, actor, {
      action: "payroll.recalculate",
      entity: "PayrollRun",
      entityId: run.id,
      after: { month, staff: computed.length },
    });
  });
  return getPayroll(actor, month, db);
}

/** "Vaqtincha saqlash" (DRAFT) and "Saqlash" (SAVED). */
export async function savePayroll(
  actor: Actor,
  month: string,
  status: PayrollStatus,
  db: DbClient = prisma,
): Promise<PayrollRunDto> {
  authorize(actor, "finance.update");
  const organizationId = actor.organizationId;
  const { from } = monthBounds(month);
  const run = await mustFind(loadRun(db, organizationId, from), "errors.payrollNotFound");
  await db.$transaction(async (tx) => {
    await tx.payrollRun.update({ where: { id: run.id }, data: { status } });
    await recordAudit(tx, actor, {
      action: "payroll.save",
      entity: "PayrollRun",
      entityId: run.id,
      before: { status: run.status },
      after: { status },
    });
  });
  return getPayroll(actor, month, db);
}

/** "Tasdiqlash" on one row; an approved line survives recalculation. */
export async function approvePayrollLine(
  actor: Actor,
  month: string,
  lineId: string,
  db: DbClient = prisma,
): Promise<PayrollRunDto> {
  authorize(actor, "finance.payroll.approve");
  const organizationId = actor.organizationId;
  const { from } = monthBounds(month);
  const run = await mustFind(loadRun(db, organizationId, from), "errors.payrollNotFound");
  const line = run.lines.find((l) => l.id === lineId);
  if (!line) throw AppError.notFound("errors.payrollLineNotFound");
  await db.$transaction(async (tx) => {
    await tx.payrollLine.update({
      where: { id: lineId },
      data: { status: "APPROVED", approvedById: actor.userId || null, approvedAt: new Date() },
    });
    await recordAudit(tx, actor, {
      action: "payroll.approve",
      entity: "PayrollLine",
      entityId: lineId,
      after: { userId: line.userId, net: n(line.net) },
    });
  });
  return getPayroll(actor, month, db);
}

/** "Ish haqi hisobotlari": one row per computed month, newest first. */
export async function listPayrollRuns(
  actor: Actor,
  db: DbClient = prisma,
): Promise<PayrollSummaryDto[]> {
  authorize(actor, "finance.view");
  const organizationId = actor.organizationId;
  const runs = await db.payrollRun.findMany({
    where: { organizationId },
    include: { lines: { include: lineInclude } },
    orderBy: { month: "desc" },
  });
  return runs.map((run) => {
    const { lines, ...rest } = runDto(run, run.lines.map(lineDto));
    void lines;
    return rest;
  });
}

export function monthFromIso(iso: string): string {
  return dateToIso(isoToDate(iso)).slice(0, 7);
}
