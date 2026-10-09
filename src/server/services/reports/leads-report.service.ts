import type { Prisma } from "@/generated/prisma/client";
import type { LeadsReportFilters } from "@/lib/validation/reports";
import { prisma, type DbClient } from "@/server/db/prisma";
import { authorize, type Actor } from "@/server/rbac/authorize";

import {
  branchIn,
  countBy,
  dateToIso,
  monthKey,
  monthPeriod,
  monthsOfYear,
  reportBranch,
  type Period,
} from "./shared";

/* "Lidlar hisoboti" (EXP §10 lid-statements): KPIs, the funnel and three charts. */

export interface LeadReportRowDto {
  id: string;
  fullName: string;
  phone: string | null;
  columnName: string;
  sourceName: string | null;
  teacherName: string | null;
  status: "NEW" | "CONTACTED" | "UNREACHABLE" | "LOST";
  converted: boolean;
  createdByName: string | null;
  createdAt: string;
  convertedAt: string | null;
}

export interface LeadsReportDto {
  year: number;
  month: number;
  kpis: {
    newLeads: number;
    conversions: number;
    lost: number;
    bestSource: { name: string; count: number } | null;
    bestSalesperson: { name: string; count: number } | null;
    /** Trial lessons dated in the month (A-131), cancelled ones excluded, and how many visitors came. */
    trials: number;
    trialsAttended: number;
  };
  /** Leads created in the month by where they are now. */
  funnel: Array<{
    stage: "NEW" | "CONTACTED" | "UNREACHABLE" | "LOST" | "CONVERTED";
    count: number;
  }>;
  byMonth: Array<{ month: string; created: number; lost: number; converted: number }>;
  byCourse: Array<{ name: string; count: number }>;
  bySource: Array<{ name: string; count: number }>;
  /** Per source: the month's new leads, its trial visits, who came and who became a student (A-131). */
  trialsBySource: Array<{
    name: string | null;
    leads: number;
    trials: number;
    attended: number;
    converted: number;
  }>;
  rows: LeadReportRowDto[];
  sources: Array<{ id: string; name: string }>;
}

const include = {
  column: { select: { name: true } },
  source: { select: { name: true } },
  teacher: { select: { fullName: true } },
  createdBy: { select: { fullName: true } },
  phones: { orderBy: { sortOrder: "asc" as const }, take: 1 },
  student: {
    select: {
      memberships: {
        select: { group: { select: { course: { select: { name: true } } } } },
        orderBy: { createdAt: "asc" as const },
        take: 1,
      },
    },
  },
} satisfies Prisma.LeadInclude;

type Row = Prisma.LeadGetPayload<{ include: typeof include }>;

const inRange = (p: Period) => ({ gte: p.from, lte: new Date(p.to.getTime() + 86_400_000 - 1) });

export async function getLeadsReport(
  actor: Actor,
  filters: LeadsReportFilters,
  db: DbClient = prisma,
): Promise<LeadsReportDto> {
  authorize(actor, "reports.leads");
  const scope = reportBranch(actor, filters.branchId);
  const period = monthPeriod(filters.year, filters.month);
  const base: Prisma.LeadWhereInput = {
    ...branchIn(scope),
    ...(filters.sourceId ? { sourceId: filters.sourceId } : {}),
  };
  const yearFrom = new Date(Date.UTC(period.year, 0, 1));
  const yearTo = new Date(Date.UTC(period.year + 1, 0, 1));
  const [
    created,
    convertedInMonth,
    lostInMonth,
    yearCreated,
    yearConverted,
    yearLost,
    sources,
    trials,
  ] = await Promise.all([
    db.lead.findMany({
      where: { ...base, createdAt: inRange(period) },
      include,
      orderBy: { createdAt: "desc" },
    }),
    db.lead.findMany({ where: { ...base, convertedAt: inRange(period) }, include }),
    db.lead.count({
      where: { ...base, status: "LOST", studentId: null, updatedAt: inRange(period) },
    }),
    db.lead.findMany({
      where: { ...base, createdAt: { gte: yearFrom, lt: yearTo } },
      select: { createdAt: true },
    }),
    db.lead.findMany({
      where: { ...base, convertedAt: { gte: yearFrom, lt: yearTo } },
      select: { convertedAt: true },
    }),
    db.lead.findMany({
      where: {
        ...base,
        status: "LOST",
        studentId: null,
        updatedAt: { gte: yearFrom, lt: yearTo },
      },
      select: { updatedAt: true },
    }),
    db.leadSource.findMany({
      where: { organizationId: actor.organizationId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.trialBooking.findMany({
      where: { lead: base, date: inRange(period), status: { not: "CANCELLED" } },
      select: { status: true, lead: { select: { source: { select: { name: true } } } } },
    }),
  ]);

  const toRow = (l: Row): LeadReportRowDto => ({
    id: l.id,
    fullName: l.fullName,
    phone: l.phones[0]?.phone ?? null,
    columnName: l.column.name,
    sourceName: l.source?.name ?? null,
    teacherName: l.teacher?.fullName ?? null,
    status: l.status,
    converted: l.studentId !== null,
    createdByName: l.createdBy?.fullName ?? null,
    createdAt: l.createdAt.toISOString(),
    convertedAt: l.convertedAt?.toISOString() ?? null,
  });

  const bySourceConv = countBy(convertedInMonth, (l) => l.source?.name).filter((x) => x.name);
  const bySourceNew = countBy(created, (l) => l.source?.name).filter((x) => x.name);
  const bySeller = countBy(convertedInMonth, (l) => l.createdBy?.fullName).filter((x) => x.name);
  const funnelStages = ["NEW", "CONTACTED", "UNREACHABLE", "LOST"] as const;
  const funnel: LeadsReportDto["funnel"] = [
    ...funnelStages.map((stage) => ({
      stage,
      count: created.filter((l) => l.studentId === null && l.status === stage).length,
    })),
    { stage: "CONVERTED", count: created.filter((l) => l.studentId !== null).length },
  ];
  // Trials by source: every source that had a new lead, a trial or a conversion this month.
  const sourceNames = new Set<string | null>([
    ...created.map((l) => l.source?.name ?? null),
    ...convertedInMonth.map((l) => l.source?.name ?? null),
    ...trials.map((t) => t.lead.source?.name ?? null),
  ]);
  const trialsBySource = [...sourceNames]
    .map((name) => {
      const own = trials.filter((t) => (t.lead.source?.name ?? null) === name);
      return {
        name,
        leads: created.filter((l) => (l.source?.name ?? null) === name).length,
        trials: own.length,
        attended: own.filter((t) => t.status === "ATTENDED" || t.status === "CONVERTED").length,
        converted: convertedInMonth.filter((l) => (l.source?.name ?? null) === name).length,
      };
    })
    .filter((r) => r.leads + r.trials + r.converted > 0)
    .sort(
      (a, b) =>
        b.leads - a.leads || b.trials - a.trials || (a.name ?? "").localeCompare(b.name ?? ""),
    );
  const months = monthsOfYear(period.year);
  const byMonth = months.map((month) => ({
    month,
    created: yearCreated.filter((l) => monthKey(l.createdAt) === month).length,
    lost: yearLost.filter((l) => monthKey(l.updatedAt) === month).length,
    converted: yearConverted.filter((l) => l.convertedAt && monthKey(l.convertedAt) === month)
      .length,
  }));

  return {
    year: period.year,
    month: period.month,
    kpis: {
      newLeads: created.length,
      conversions: convertedInMonth.length,
      lost: lostInMonth,
      bestSource: bySourceConv[0] ?? bySourceNew[0] ?? null,
      bestSalesperson: bySeller[0] ?? null,
      trials: trials.length,
      trialsAttended: trials.filter((t) => t.status === "ATTENDED" || t.status === "CONVERTED")
        .length,
    },
    funnel,
    byMonth,
    byCourse: countBy(convertedInMonth, (l) => l.student?.memberships[0]?.group.course.name).filter(
      (x) => x.name,
    ),
    bySource: bySourceNew,
    trialsBySource,
    rows: created.map(toRow),
    sources,
  };
}

export { dateToIso };
