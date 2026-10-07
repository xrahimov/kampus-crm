import type { Prisma } from "@/generated/prisma/client";
import type {
  FaceIdWebhookInput,
  ManualCheckInput,
  StaffAttendanceFilters,
  WorkScheduleInput,
} from "@/lib/validation/integrations";
import { recordAudit } from "@/server/audit/audit";
import { prisma, type DbClient } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";
import { authorize, canAccessAllBranches, type Actor } from "@/server/rbac/authorize";
import { loadIntegrationConfig } from "@/server/services/integrations/integrations.service";
import { dateToIso, isoToDate, mustFind } from "@/server/services/settings/shared";

/* Reports → "Hodimlar davomati" (EXP §10) fed by FaceID check-ins (A-87). */

/** Uzbekistan has one time zone (UTC+5) and no DST; check-in times are shown in it. */
export const LOCAL_OFFSET_MINUTES = 300;

export type DayStatus = "PRESENT" | "LATE" | "ABSENT" | "NOT_WORKING_DAY" | "NO_SCHEDULE";

export interface StaffDayRowDto {
  userId: string;
  fullName: string;
  branchName: string | null;
  expectedIn: string | null;
  expectedOut: string | null;
  checkIn: string | null; // HH:mm local
  checkOut: string | null;
  lateMinutes: number;
  earlyLeaveMinutes: number;
  workedMinutes: number;
  status: DayStatus;
  source: "FACE_ID" | "MANUAL" | null;
}

export interface StaffWeekRowDto {
  userId: string;
  fullName: string;
  days: Array<{ date: string; status: DayStatus; checkIn: string | null }>;
}

export interface StaffMonthRowDto {
  userId: string;
  fullName: string;
  branchName: string | null;
  workingDays: number;
  presentDays: number;
  lateDays: number;
  absentDays: number;
  workedMinutes: number;
  lateMinutes: number;
}

export interface ScheduleRowDto {
  userId: string;
  fullName: string;
  days: Array<{ weekday: number; start: string; end: string } | null>; // index = weekday 0..6
}

export interface StaffAttendanceReportDto {
  year: number;
  month: number;
  date: string;
  branchId: string | null;
  kpis: { total: number; cameToday: number; lateToday: number; absentToday: number };
  daily: StaffDayRowDto[];
  weekly: { from: string; to: string; rows: StaffWeekRowDto[] };
  monthly: StaffMonthRowDto[];
  statistics: {
    punctualityRate: number; // % of working days with an on-time check-in
    attendanceRate: number; // % of working days with any check-in
    avgWorkedMinutes: number;
    byDay: Array<{ date: string; present: number; late: number; absent: number }>;
  };
  schedules: ScheduleRowDto[];
  lateAfterMinutes: number;
}

function toLocalHm(at: Date): string {
  const t = new Date(at.getTime() + LOCAL_OFFSET_MINUTES * 60_000);
  return `${String(t.getUTCHours()).padStart(2, "0")}:${String(t.getUTCMinutes()).padStart(2, "0")}`;
}

/** The local calendar day an instant belongs to. */
export function localDateIso(at: Date): string {
  return new Date(at.getTime() + LOCAL_OFFSET_MINUTES * 60_000).toISOString().slice(0, 10);
}

const toMinutes = (hm: string) => Number(hm.slice(0, 2)) * 60 + Number(hm.slice(3, 5));

function addDays(iso: string, days: number): string {
  const d = isoToDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return dateToIso(d);
}

interface StaffRow {
  id: string;
  fullName: string;
  branchName: string | null;
  branchIds: string[];
}

async function loadStaff(db: DbClient, actor: Actor, branchId: string | null): Promise<StaffRow[]> {
  const where: Prisma.UserWhereInput = {
    isArchived: false,
    roles: { some: { role: { code: { not: "PARENT" } } } },
  };
  if (branchId) where.branches = { some: { branchId } };
  else if (!canAccessAllBranches(actor)) {
    where.branches = { some: { branchId: { in: actor.branchIds } } };
  }
  where.organizationId = actor.organizationId;
  const users = await db.user.findMany({
    where,
    select: {
      id: true,
      fullName: true,
      branches: { select: { branchId: true, branch: { select: { name: true } } } },
    },
    orderBy: { fullName: "asc" },
  });
  return users.map((u) => ({
    id: u.id,
    fullName: u.fullName,
    branchName: u.branches[0]?.branch.name ?? null,
    branchIds: u.branches.map((b) => b.branchId),
  }));
}

type Check = { checkIn: Date | null; checkOut: Date | null; source: "FACE_ID" | "MANUAL" };
type Schedule = { start: string; end: string };

function evaluateDay(
  schedule: Schedule | undefined,
  check: Check | undefined,
  lateAfter: number,
): Omit<StaffDayRowDto, "userId" | "fullName" | "branchName"> {
  const checkIn = check?.checkIn ? toLocalHm(check.checkIn) : null;
  const checkOut = check?.checkOut ? toLocalHm(check.checkOut) : null;
  const worked =
    check?.checkIn && check.checkOut
      ? Math.max(0, Math.round((check.checkOut.getTime() - check.checkIn.getTime()) / 60_000))
      : 0;
  if (!schedule) {
    return {
      expectedIn: null,
      expectedOut: null,
      checkIn,
      checkOut,
      lateMinutes: 0,
      earlyLeaveMinutes: 0,
      workedMinutes: worked,
      status: checkIn ? "NO_SCHEDULE" : "NOT_WORKING_DAY",
      source: check?.source ?? null,
    };
  }
  const late = checkIn ? Math.max(0, toMinutes(checkIn) - toMinutes(schedule.start)) : 0;
  const early = checkOut ? Math.max(0, toMinutes(schedule.end) - toMinutes(checkOut)) : 0;
  return {
    expectedIn: schedule.start,
    expectedOut: schedule.end,
    checkIn,
    checkOut,
    lateMinutes: late,
    earlyLeaveMinutes: early,
    workedMinutes: worked,
    status: !checkIn ? "ABSENT" : late > lateAfter ? "LATE" : "PRESENT",
    source: check?.source ?? null,
  };
}

export async function getStaffAttendanceReport(
  actor: Actor,
  filters: StaffAttendanceFilters,
  db: DbClient = prisma,
): Promise<StaffAttendanceReportDto> {
  authorize(actor, "reports.view");
  const todayIso = localDateIso(new Date());
  const year = filters.year ?? Number(todayIso.slice(0, 4));
  const month = filters.month ?? Number(todayIso.slice(5, 7));
  const monthPrefix = `${year}-${String(month).padStart(2, "0")}`;
  const monthStart = `${monthPrefix}-01`;
  const monthEnd = dateToIso(new Date(Date.UTC(year, month, 0)));
  const date =
    filters.date && filters.date.startsWith(monthPrefix)
      ? filters.date
      : todayIso.startsWith(monthPrefix)
        ? todayIso
        : monthStart;
  const branchId = filters.branchId ?? null;
  if (branchId && !actor.branchIds.includes(branchId)) {
    throw AppError.forbidden("errors.branchForbidden");
  }
  const faceId = await loadIntegrationConfig(db, "FACE_ID");
  const lateAfter = Number((faceId as { lateAfterMinutes?: number } | null)?.lateAfterMinutes ?? 0);

  const staff = await loadStaff(db, actor, branchId);
  const userIds = staff.map((s) => s.id);
  const [checks, schedules] = await Promise.all([
    db.staffAttendance.findMany({
      where: {
        userId: { in: userIds },
        date: { gte: isoToDate(monthStart), lte: isoToDate(monthEnd) },
      },
    }),
    db.workSchedule.findMany({ where: { userId: { in: userIds } } }),
  ]);
  const checkOf = new Map<string, Check>();
  for (const c of checks) {
    checkOf.set(`${c.userId}:${dateToIso(c.date)}`, {
      checkIn: c.checkIn,
      checkOut: c.checkOut,
      source: c.source,
    });
  }
  const scheduleOf = new Map<string, Schedule>();
  for (const s of schedules)
    scheduleOf.set(`${s.userId}:${s.weekday}`, { start: s.start, end: s.end });
  const weekdayOf = (iso: string) => isoToDate(iso).getUTCDay();
  const dayFor = (userId: string, iso: string) =>
    evaluateDay(
      scheduleOf.get(`${userId}:${weekdayOf(iso)}`),
      checkOf.get(`${userId}:${iso}`),
      lateAfter,
    );

  // KPIs are about today, as in the reference ("Bugun kelganlar" …).
  const kpis = { total: staff.length, cameToday: 0, lateToday: 0, absentToday: 0 };
  if (todayIso.startsWith(monthPrefix)) {
    for (const s of staff) {
      const d = dayFor(s.id, todayIso);
      if (d.checkIn) kpis.cameToday += 1;
      if (d.status === "LATE") kpis.lateToday += 1;
      if (d.status === "ABSENT") kpis.absentToday += 1;
    }
  }

  const daily: StaffDayRowDto[] = staff.map((s) => ({
    userId: s.id,
    fullName: s.fullName,
    branchName: s.branchName,
    ...dayFor(s.id, date),
  }));

  // Week (Monday to Sunday) containing the chosen date, clipped to the month.
  const wd = weekdayOf(date);
  const weekFrom = addDays(date, -((wd + 6) % 7));
  const weekDates = Array.from({ length: 7 }, (_, i) => addDays(weekFrom, i));
  const weekly = {
    from: weekFrom,
    to: weekDates[6]!,
    rows: staff.map((s) => ({
      userId: s.id,
      fullName: s.fullName,
      days: weekDates.map((iso) => {
        const d = dayFor(s.id, iso);
        return { date: iso, status: d.status, checkIn: d.checkIn };
      }),
    })),
  };

  // Month: every day up to today (future days are not "absent" yet).
  const lastDay =
    todayIso < monthEnd ? (todayIso.startsWith(monthPrefix) ? todayIso : monthEnd) : monthEnd;
  const monthDates: string[] = [];
  for (let iso = monthStart; iso <= lastDay && iso.startsWith(monthPrefix); iso = addDays(iso, 1)) {
    monthDates.push(iso);
  }
  const byDay = monthDates.map((iso) => ({ date: iso, present: 0, late: 0, absent: 0 }));
  let workingTotal = 0;
  let onTimeTotal = 0;
  let anyCheckTotal = 0;
  let workedTotal = 0;
  let workedCount = 0;
  const monthly: StaffMonthRowDto[] = staff.map((s) => {
    const row: StaffMonthRowDto = {
      userId: s.id,
      fullName: s.fullName,
      branchName: s.branchName,
      workingDays: 0,
      presentDays: 0,
      lateDays: 0,
      absentDays: 0,
      workedMinutes: 0,
      lateMinutes: 0,
    };
    monthDates.forEach((iso, i) => {
      const d = dayFor(s.id, iso);
      if (d.status === "NOT_WORKING_DAY") return;
      if (d.status !== "NO_SCHEDULE") row.workingDays += 1;
      if (d.status === "PRESENT" || d.status === "NO_SCHEDULE") {
        row.presentDays += 1;
        byDay[i]!.present += 1;
      }
      if (d.status === "LATE") {
        row.lateDays += 1;
        byDay[i]!.late += 1;
      }
      if (d.status === "ABSENT") {
        row.absentDays += 1;
        byDay[i]!.absent += 1;
      }
      row.workedMinutes += d.workedMinutes;
      row.lateMinutes += d.lateMinutes;
      if (d.workedMinutes > 0) {
        workedTotal += d.workedMinutes;
        workedCount += 1;
      }
    });
    workingTotal += row.workingDays;
    onTimeTotal += row.presentDays - (row.workingDays === 0 ? row.presentDays : 0);
    anyCheckTotal += row.presentDays + row.lateDays;
    return row;
  });
  const pct = (n: number, d: number) => (d === 0 ? 0 : Math.round((n / d) * 100));

  const schedulesRows: ScheduleRowDto[] = staff.map((s) => ({
    userId: s.id,
    fullName: s.fullName,
    days: Array.from({ length: 7 }, (_, weekday) => {
      const sch = scheduleOf.get(`${s.id}:${weekday}`);
      return sch ? { weekday, ...sch } : null;
    }),
  }));

  return {
    year,
    month,
    date,
    branchId,
    kpis,
    daily,
    weekly,
    monthly,
    statistics: {
      punctualityRate: pct(onTimeTotal, workingTotal),
      attendanceRate: pct(anyCheckTotal, workingTotal),
      avgWorkedMinutes: workedCount === 0 ? 0 : Math.round(workedTotal / workedCount),
      byDay,
    },
    schedules: schedulesRows,
    lateAfterMinutes: lateAfter,
  };
}

/** "Ish jadvallari": replaces one staff member's weekly schedule. */
export async function setWorkSchedule(
  actor: Actor,
  input: WorkScheduleInput,
  db: DbClient = prisma,
): Promise<void> {
  authorize(actor, "staff.update");
  await mustFind(
    db.user.findFirst({
      where: { id: input.userId, isArchived: false, organizationId: actor.organizationId },
    }),
    "errors.staffNotFound",
  );
  await db.$transaction(async (tx) => {
    const before = await tx.workSchedule.findMany({ where: { userId: input.userId } });
    await tx.workSchedule.deleteMany({ where: { userId: input.userId } });
    if (input.days.length > 0) {
      await tx.workSchedule.createMany({
        data: input.days.map((d) => ({ userId: input.userId, ...d })),
      });
    }
    await recordAudit(tx, actor, {
      action: "workSchedule.set",
      entity: "User",
      entityId: input.userId,
      before: before.map(({ weekday, start, end }) => ({ weekday, start, end })),
      after: input.days,
      branchId: null,
    });
  });
}

function localDateTime(dateIso: string, hm: string): Date {
  return new Date(isoToDate(dateIso).getTime() + (toMinutes(hm) - LOCAL_OFFSET_MINUTES) * 60_000);
}

/** A manager fixes a missed or wrong check (A-87). */
export async function setManualCheck(
  actor: Actor,
  input: ManualCheckInput,
  db: DbClient = prisma,
): Promise<void> {
  authorize(actor, "staff.update");
  const user = await mustFind(
    db.user.findFirst({
      where: { id: input.userId, isArchived: false, organizationId: actor.organizationId },
      include: { branches: true },
    }),
    "errors.staffNotFound",
  );
  const branchId = user.branches[0]?.branchId;
  if (!branchId) throw AppError.validation({ userId: ["validation.branchesMin"] });
  const data = {
    checkIn: input.checkIn ? localDateTime(input.date, input.checkIn) : null,
    checkOut: input.checkOut ? localDateTime(input.date, input.checkOut) : null,
    source: "MANUAL" as const,
  };
  await db.$transaction(async (tx) => {
    const row = await tx.staffAttendance.upsert({
      where: { userId_date: { userId: input.userId, date: isoToDate(input.date) } },
      create: { userId: input.userId, branchId, date: isoToDate(input.date), ...data },
      update: data,
    });
    await recordAudit(tx, actor, {
      action: "staffAttendance.set",
      entity: "StaffAttendance",
      entityId: row.id,
      after: {
        userId: input.userId,
        date: input.date,
        checkIn: input.checkIn,
        checkOut: input.checkOut,
      },
      branchId,
    });
  });
}

/** `/webhooks/face-id`: the terminal reports who passed and when. */
export async function recordFaceIdCheck(
  db: DbClient,
  input: FaceIdWebhookInput,
): Promise<{ matched: boolean }> {
  const user = await db.user.findFirst({
    where: { phone: input.phone, isArchived: false },
    include: { branches: true },
  });
  const branchId = user?.branches[0]?.branchId;
  if (!user || !branchId) return { matched: false };
  const at = new Date(input.at);
  const date = isoToDate(localDateIso(at));
  const existing = await db.staffAttendance.findUnique({
    where: { userId_date: { userId: user.id, date } },
  });
  const checkIn =
    input.kind === "IN"
      ? existing?.checkIn && existing.checkIn < at
        ? existing.checkIn
        : at
      : (existing?.checkIn ?? null);
  const checkOut =
    input.kind === "OUT"
      ? existing?.checkOut && existing.checkOut > at
        ? existing.checkOut
        : at
      : (existing?.checkOut ?? null);
  await db.staffAttendance.upsert({
    where: { userId_date: { userId: user.id, date } },
    create: {
      userId: user.id,
      branchId,
      date,
      checkIn,
      checkOut,
      source: "FACE_ID",
      deviceId: input.deviceId,
    },
    update: { checkIn, checkOut, source: "FACE_ID", deviceId: input.deviceId },
  });
  return { matched: true };
}
