import type { Prisma } from "@/generated/prisma/client";
import type { ChurnFilters, LeaveReasonInput } from "@/lib/validation/reports";
import { recordAudit } from "@/server/audit/audit";
import { prisma, type DbClient } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";
import { authorize, type Actor } from "@/server/rbac/authorize";
import { mustFind, rethrowAsAppError } from "@/server/services/settings/shared";

import {
  branchIn,
  countBy,
  dateToIso,
  isoToDate,
  monthsBetween,
  num,
  pct,
  reportBranch,
  round1,
} from "./shared";

/* "Ketish va guruh o'zgarishi tahlili" (EXP §10 left-student-reports). */

export const TRANSFER_REASON = "transfer";

export interface LeaveReasonDto {
  id: string;
  name: string;
  kind: "LEAVE" | "TRANSFER";
  isActive: boolean;
}

export interface LeftStudentRowDto {
  membershipId: string;
  studentId: string;
  fullName: string;
  groupId: string;
  groupName: string;
  courseName: string;
  branchName: string;
  hasDiscount: boolean;
  teacherName: string | null;
  reason: string | null;
  leftAt: string;
  leftByName: string | null;
  note: string | null;
  lifetimeMonths: number;
  monthlyPrice: number;
}

export interface NamedCount {
  name: string;
  count: number;
}

export interface ChurnReportDto {
  from: string;
  to: string;
  kpis: {
    churnRate: number;
    leftCount: number;
    activeAtStart: number;
    lostRevenue: number;
    avgLifetimeMonths: number | null;
  };
  /** Students who left per day of the period. */
  dynamics: Array<{ date: string; count: number }>;
  breakdown: {
    course: NamedCount[];
    teacher: NamedCount[];
    branch: NamedCount[];
    status: NamedCount[];
    reason: NamedCount[];
    joinedThisMonth: number;
  };
  transfers: {
    total: number;
    leftAfterPercent: number;
    reasons: NamedCount[];
  };
  discounts: { withDiscount: number; fullPrice: number };
  rows: LeftStudentRowDto[];
  reasons: LeaveReasonDto[];
}

const include = {
  student: { select: { id: true, fullName: true } },
  leftBy: { select: { fullName: true } },
  discounts: { select: { id: true }, take: 1 },
  group: {
    select: {
      id: true,
      name: true,
      status: true,
      branch: { select: { name: true } },
      course: { select: { name: true, price: true } },
      teachers: {
        where: { role: "MAIN" as const },
        select: { user: { select: { fullName: true } } },
        take: 1,
      },
    },
  },
} satisfies Prisma.GroupMembershipInclude;

type Row = Prisma.GroupMembershipGetPayload<{ include: typeof include }>;

function toRow(m: Row): LeftStudentRowDto {
  return {
    membershipId: m.id,
    studentId: m.studentId,
    fullName: m.student.fullName,
    groupId: m.group.id,
    groupName: m.group.name,
    courseName: m.group.course.name,
    branchName: m.group.branch.name,
    hasDiscount: m.discounts.length > 0,
    teacherName: m.group.teachers[0]?.user.fullName ?? null,
    reason: m.leaveReason,
    leftAt: dateToIso(m.leftAt!),
    leftByName: m.leftBy?.fullName ?? null,
    note: m.note,
    lifetimeMonths: monthsBetween(m.joinedAt, m.leftAt!),
    monthlyPrice: m.customPrice ? num(m.customPrice) : num(m.group.course.price),
  };
}

/** Default period: the current month ("Joriy oy"). */
function periodOf(filters: ChurnFilters): { from: string; to: string } {
  const now = new Date(Date.now() + 5 * 60 * 60 * 1000);
  const first = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
  const last = dateToIso(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)));
  const from = filters.from ?? first;
  const to = filters.to ?? last;
  if (to < from) throw AppError.validation({ to: ["validation.endAfterStart"] });
  return { from, to };
}

export async function getChurnReport(
  actor: Actor,
  filters: ChurnFilters,
  db: DbClient = prisma,
): Promise<ChurnReportDto> {
  authorize(actor, "reports.view");
  const scope = reportBranch(actor, filters.branchId);
  const { from, to } = periodOf(filters);
  const fromDate = isoToDate(from);
  const toDate = isoToDate(to);
  const group: Prisma.GroupWhereInput = { ...branchIn(scope) };
  if (filters.courseId) group.courseId = filters.courseId;
  if (filters.teacherId) group.teachers = { some: { userId: filters.teacherId } };
  if (filters.groupId) group.id = filters.groupId;

  const closed = await db.groupMembership.findMany({
    where: { group, status: "ARCHIVED", leftAt: { gte: fromDate, lte: toDate } },
    include,
    orderBy: [{ leftAt: "desc" }, { id: "asc" }],
  });
  const transfers = closed.filter((m) => m.leaveReason === TRANSFER_REASON);
  let left = closed.filter((m) => m.leaveReason !== TRANSFER_REASON);
  if (filters.reason) left = left.filter((m) => (m.leaveReason ?? "") === filters.reason);
  if (filters.discount === "yes") left = left.filter((m) => m.discounts.length > 0);
  if (filters.discount === "no") left = left.filter((m) => m.discounts.length === 0);

  // Everyone who was in a group when the period started.
  const activeAtStart = await db.groupMembership.count({
    where: {
      group,
      joinedAt: { lt: fromDate },
      OR: [{ leftAt: null }, { leftAt: { gte: fromDate } }],
    },
  });

  // "O'zgargandan keyin ketish %": of the students who changed group, how many then left for good.
  const transferredStudents = [...new Set(transfers.map((m) => m.studentId))];
  const leftAfterTransfer = transferredStudents.length
    ? await db.groupMembership.count({
        where: {
          studentId: { in: transferredStudents },
          status: "ARCHIVED",
          leaveReason: { not: TRANSFER_REASON },
          leftAt: { gte: fromDate },
        },
      })
    : 0;

  const rows = left.map(toRow);
  const dynamics = new Map<string, number>();
  for (let d = fromDate; d <= toDate; d = new Date(d.getTime() + 86_400_000))
    dynamics.set(dateToIso(d), 0);
  for (const r of rows) dynamics.set(r.leftAt, (dynamics.get(r.leftAt) ?? 0) + 1);
  const lifetimes = rows.map((r) => r.lifetimeMonths);
  const reasons = await listLeaveReasons(actor, db);

  return {
    from,
    to,
    kpis: {
      churnRate: pct(rows.length, activeAtStart),
      leftCount: rows.length,
      activeAtStart,
      lostRevenue: rows.reduce((s, r) => s + r.monthlyPrice, 0),
      avgLifetimeMonths: lifetimes.length
        ? round1(lifetimes.reduce((s, x) => s + x, 0) / lifetimes.length)
        : null,
    },
    dynamics: [...dynamics.entries()].map(([date, count]) => ({ date, count })),
    breakdown: {
      course: countBy(rows, (r) => r.courseName),
      teacher: countBy(rows, (r) => r.teacherName),
      branch: countBy(rows, (r) => r.branchName),
      status: countBy(left, (m) => m.group.status),
      reason: countBy(rows, (r) => r.reason),
      joinedThisMonth: left.filter((m) => m.joinedAt >= fromDate).length,
    },
    transfers: {
      total: transfers.length,
      leftAfterPercent: pct(leftAfterTransfer, transferredStudents.length),
      reasons: countBy(transfers, (m) => m.note),
    },
    discounts: {
      withDiscount: rows.filter((r) => r.hasDiscount).length,
      fullPrice: rows.filter((r) => !r.hasDiscount).length,
    },
    rows,
    reasons,
  };
}

/* "SABABLARNI SOZLASH": the reasons offered in the remove and transfer dialogs. */

const reasonDto = (r: {
  id: string;
  name: string;
  kind: "LEAVE" | "TRANSFER";
  isActive: boolean;
}): LeaveReasonDto => ({
  id: r.id,
  name: r.name,
  kind: r.kind,
  isActive: r.isActive,
});

export async function listLeaveReasons(
  actor: Actor,
  db: DbClient = prisma,
): Promise<LeaveReasonDto[]> {
  authorize(actor, "groups.view");
  const organizationId = actor.organizationId;
  const rows = await db.leaveReason.findMany({
    where: { organizationId },
    orderBy: [{ kind: "asc" }, { name: "asc" }],
  });
  return rows.map(reasonDto);
}

export async function createLeaveReason(
  actor: Actor,
  input: LeaveReasonInput,
  db: DbClient = prisma,
): Promise<LeaveReasonDto> {
  authorize(actor, "settings.catalog");
  const organizationId = actor.organizationId;
  try {
    return await db.$transaction(async (tx) => {
      const row = await tx.leaveReason.create({ data: { organizationId, ...input } });
      await recordAudit(tx, actor, {
        action: "leaveReason.create",
        entity: "LeaveReason",
        entityId: row.id,
        after: input,
      });
      return reasonDto(row);
    });
  } catch (error) {
    rethrowAsAppError(error, "name");
  }
}

export async function updateLeaveReason(
  actor: Actor,
  id: string,
  input: Partial<LeaveReasonInput>,
  db: DbClient = prisma,
): Promise<LeaveReasonDto> {
  authorize(actor, "settings.catalog");
  const before = await mustFind(
    db.leaveReason.findFirst({ where: { id, organizationId: actor.organizationId } }),
  );
  try {
    return await db.$transaction(async (tx) => {
      const row = await tx.leaveReason.update({ where: { id }, data: input });
      await recordAudit(tx, actor, {
        action: "leaveReason.update",
        entity: "LeaveReason",
        entityId: id,
        before: reasonDto(before),
        after: reasonDto(row),
      });
      return reasonDto(row);
    });
  } catch (error) {
    rethrowAsAppError(error, "name");
  }
}

export async function deleteLeaveReason(
  actor: Actor,
  id: string,
  db: DbClient = prisma,
): Promise<void> {
  authorize(actor, "settings.catalog");
  const before = await mustFind(
    db.leaveReason.findFirst({ where: { id, organizationId: actor.organizationId } }),
  );
  await db.$transaction(async (tx) => {
    await tx.leaveReason.delete({ where: { id } });
    await recordAudit(tx, actor, {
      action: "leaveReason.delete",
      entity: "LeaveReason",
      entityId: id,
      before: reasonDto(before),
    });
  });
}
