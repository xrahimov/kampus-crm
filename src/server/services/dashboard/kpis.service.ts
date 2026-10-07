import type { Prisma } from "@/generated/prisma/client";
import type { DashboardKpiFilters } from "@/lib/validation/dashboard";
import { prisma, type DbClient } from "@/server/db/prisma";
import { authorize, can, type Actor } from "@/server/rbac/authorize";
import { today } from "@/server/services/groups/shared";
import { getCenterStatistics } from "@/server/services/reports/statistics.service";
import { branchIn, reportBranch } from "@/server/services/reports/shared";
import { membershipBalances } from "@/server/services/students/balances";
import { TEACHER_ROLE_CODES } from "@/server/services/staff/staff.service";

/* EXP §1: the twelve KPI cards and the "MARKAZ FOYDALILIGI" badge (A-96). */

export interface DashboardKpisDto {
  activeLeads: number;
  groups: number;
  remainingDebt: number;
  debtors: number;
  dueSoon: number;
  activeStudents: number;
  studentsInGroups: number;
  trial: number;
  leftThisMonth: number;
  teachers: number;
  exams: number;
  newAdmissions: number;
  /** Room utilisation % from the center statistics, null without `reports.view`. */
  utilisation: number | null;
}

const OPEN = ["NEW", "TRIAL", "ACTIVE", "FROZEN"] as const;
const DUE_SOON_DAYS = 3;

function addDays(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00.000Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function getDashboardKpis(
  actor: Actor,
  filters: DashboardKpiFilters,
  db: DbClient = prisma,
): Promise<DashboardKpisDto> {
  authorize(actor, "dashboard.view");
  const scope = reportBranch(actor, filters.branchId);
  const where = branchIn(scope);
  const todayIso = today();
  const monthStart = `${todayIso.slice(0, 7)}-01`;
  const openGroup: Prisma.GroupWhereInput = { ...where, status: { not: "ARCHIVED" } };
  const [activeLeads, groups, memberships, leftThisMonth, teachers, exams] = await Promise.all([
    db.lead.count({
      where: { ...where, isArchived: false, convertedAt: null, status: { not: "LOST" } },
    }),
    db.group.count({ where: { ...where, status: "ACTIVE" } }),
    db.groupMembership.findMany({
      where: { group: openGroup, status: { in: [...OPEN] } },
      select: { id: true, studentId: true, status: true },
    }),
    db.groupMembership.count({
      where: {
        group: where,
        status: "ARCHIVED",
        leftAt: { gte: new Date(`${monthStart}T00:00:00.000Z`) },
      },
    }),
    db.user.count({
      where: {
        organizationId: actor.organizationId,
        isArchived: false,
        roles: { some: { role: { code: { in: [...TEACHER_ROLE_CODES] } } } },
        ...("branchId" in scope
          ? {
              branches: {
                some: {
                  branchId:
                    typeof scope.branchId === "string" ? scope.branchId : { in: scope.branchId.in },
                },
              },
            }
          : {}),
      },
    }),
    db.exam.count({
      where: {
        ...where,
        status: "NOT_STARTED",
        date: { gte: new Date(`${todayIso}T00:00:00.000Z`) },
      },
    }),
  ]);

  const activeIds = memberships.filter((m) => m.status === "ACTIVE").map((m) => m.id);
  const balances = await membershipBalances(db, activeIds);
  const perStudent = new Map<string, { balance: number; next: string | null }>();
  for (const m of memberships) {
    const b = balances.get(m.id);
    if (!b) continue;
    const row = perStudent.get(m.studentId) ?? { balance: 0, next: null };
    row.balance += b.balance;
    if (b.nextPaymentDate && (!row.next || b.nextPaymentDate < row.next))
      row.next = b.nextPaymentDate;
    perStudent.set(m.studentId, row);
  }
  const soon = addDays(todayIso, DUE_SOON_DAYS);
  let remainingDebt = 0;
  let debtors = 0;
  let dueSoon = 0;
  for (const s of perStudent.values()) {
    if (s.balance < 0) {
      debtors += 1;
      remainingDebt += -s.balance;
    } else if (s.next && s.next <= soon) {
      dueSoon += 1;
    }
  }
  const distinct = (status?: (typeof OPEN)[number]) =>
    new Set(memberships.filter((m) => !status || m.status === status).map((m) => m.studentId)).size;

  let utilisation: number | null = null;
  if (can(actor, "reports.view")) {
    const stats = await getCenterStatistics(actor, { branchId: filters.branchId }, db);
    utilisation = stats.kpis.utilisation;
  }

  return {
    activeLeads,
    groups,
    remainingDebt: Math.round(remainingDebt),
    debtors,
    dueSoon,
    activeStudents: distinct("ACTIVE"),
    studentsInGroups: distinct(),
    trial: distinct("TRIAL"),
    leftThisMonth,
    teachers,
    exams,
    newAdmissions: distinct("NEW"),
    utilisation,
  };
}
