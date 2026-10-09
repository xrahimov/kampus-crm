import type {
  AbsenceCaseStatus,
  AbsenceCloseReason,
  AbsenceContactOutcome,
  AbsenceReason,
  DebtContactChannel,
  Prisma,
} from "@/generated/prisma/client";
import type {
  AbsenceContactInput,
  AbsenceFilters,
  AbsenceListFilter,
  AbsenceSortField,
} from "@/lib/validation/absences";
import type { Page } from "@/lib/validation/common";
import { recordAudit } from "@/server/audit/audit";
import { prisma, type DbClient } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";
import type { ParsedList } from "@/server/http/list-query";
import { authorize, authorizeBranch, branchScope, type Actor } from "@/server/rbac/authorize";
import { notifyUsers } from "@/server/services/dashboard/notifications.service";
import { daysBetween } from "@/server/services/debts/debts.service";
import { notifyStaff } from "@/server/services/integrations/bot-recipients.service";
import { dateToIso, isoToDate, mustFind } from "@/server/services/settings/shared";
import { botDate, botText, wallClock } from "@/server/services/telegram/student-telegram.service";

/*
 * Absence follow-up (A-125). A case follows one student in one group from the
 * day they stop coming until they are back or gone. Two rules open a case, both
 * set per centre (Settings → Centre settings → Absence follow-up):
 *   STREAK  the student's last marked lessons are `absenceStreak` absences in a
 *           row (excused lessons and lessons nobody marked are skipped);
 *   SILENT  the group met at least twice in the last `absenceSilentDays` days
 *           and the student was not marked present once, whether marked absent
 *           or not marked at all.
 * Cases are reconciled whenever the list is read and once a day by the worker,
 * which also tells the branch managers about new cases; every Monday morning the
 * staff Telegram feed gets a summary per branch.
 */

export interface AbsenceRules {
  streak: number | null;
  silentDays: number | null;
}

export const DEFAULT_ABSENCE_RULES: AbsenceRules = { streak: 2, silentDays: 14 };

/** The look-back for the streak rule, in days; the silent window extends it when longer. */
const LOOKBACK_DAYS = 60;
/** Lessons the group must have held in the silent window before anyone is flagged. */
const SILENT_MIN_LESSONS = 2;
const WEEKLY_SUMMARY_HOUR = 9;
const WEEKLY_SUMMARY_NAMES = 8;

export interface AbsenceCaseDto {
  id: string;
  membershipId: string;
  studentId: string;
  studentName: string;
  phone: string | null;
  parentPhone: string | null;
  groupId: string;
  groupName: string;
  teacher: string | null;
  branchId: string;
  branchName: string;
  status: AbsenceCaseStatus;
  reason: AbsenceReason;
  /** Lessons missed in a row (STREAK) or held without a present mark (SILENT). */
  missed: number;
  /** The first lesson of the run the student missed. */
  sinceAt: string;
  /** Whole days from `sinceAt` to today, or to the day the case closed. */
  days: number;
  lastPresentAt: string | null;
  openedAt: string;
  lastContactAt: string | null;
  lastChannel: DebtContactChannel | null;
  lastOutcome: AbsenceContactOutcome | null;
  lastContactBy: string | null;
  closedAt: string | null;
  closedReason: AbsenceCloseReason | null;
  hasTelegram: boolean;
}

export interface AbsenceContactDto {
  id: string;
  channel: DebtContactChannel;
  outcome: AbsenceContactOutcome | null;
  note: string | null;
  createdBy: string | null;
  createdAt: string;
}

export interface AbsenceSummaryDto {
  open: number;
  noContact: number;
  streak: number;
  silent: number;
}

export interface AbsenceListDto extends Page<AbsenceCaseDto> {
  summary: AbsenceSummaryDto;
  rules: AbsenceRules;
}

const today = (): string => dateToIso(new Date());

const shiftIso = (iso: string, days: number): string => {
  const d = isoToDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return dateToIso(d);
};

/** The centre's two rules; a centre without a settings row runs on the defaults. */
export async function absenceRules(db: DbClient, organizationId: string): Promise<AbsenceRules> {
  const row = await db.orgSettings.findUnique({
    where: { organizationId },
    select: { absenceStreak: true, absenceSilentDays: true },
  });
  return row
    ? { streak: row.absenceStreak, silentDays: row.absenceSilentDays }
    : DEFAULT_ABSENCE_RULES;
}

interface MemberRow {
  id: string;
  studentId: string;
  groupId: string;
  branchId: string;
  /** The first day the student counts as attending: activation, else the join date. */
  start: string;
}

interface Flag {
  reason: AbsenceReason;
  missed: number;
  sinceAt: string;
}

interface Verdict {
  flag: Flag | null;
  /** The newest lesson with a present mark, if any, flagged or not. */
  lastPresentAt: string | null;
}

/**
 * Applies the two rules to the given members from the lessons their groups held
 * before today (today's lessons may still be running).
 */
async function judgeMembers(
  db: DbClient,
  members: MemberRow[],
  rules: AbsenceRules,
  todayIso: string,
): Promise<Map<string, Verdict>> {
  const verdicts = new Map<string, Verdict>();
  if (members.length === 0) return verdicts;
  const from = shiftIso(todayIso, -Math.max(LOOKBACK_DAYS, rules.silentDays ?? 0));
  const lessons = await db.lesson.findMany({
    where: {
      groupId: { in: [...new Set(members.map((m) => m.groupId))] },
      date: { gte: isoToDate(from), lt: isoToDate(todayIso) },
    },
    select: {
      id: true,
      groupId: true,
      date: true,
      attendances: {
        where: { membershipId: { in: members.map((m) => m.id) } },
        select: { membershipId: true, status: true },
      },
    },
    orderBy: [{ date: "desc" }, { startTime: "desc" }],
  });
  const byGroup = new Map<
    string,
    Array<{ id: string; date: string; marks: Map<string, string> }>
  >();
  for (const l of lessons) {
    const list = byGroup.get(l.groupId) ?? [];
    list.push({
      id: l.id,
      date: dateToIso(l.date),
      marks: new Map(l.attendances.map((a) => [a.membershipId, a.status as string])),
    });
    byGroup.set(l.groupId, list);
  }
  const windowStart = rules.silentDays !== null ? shiftIso(todayIso, -rules.silentDays) : null;

  for (const m of members) {
    const own = (byGroup.get(m.groupId) ?? []).filter((l) => l.date >= m.start);
    let streak = 0;
    let streakSince: string | null = null;
    let lastPresentAt: string | null = null;
    for (const l of own) {
      const mark = l.marks.get(m.id) ?? "NOT_MARKED";
      if (mark === "PRESENT") {
        lastPresentAt = l.date;
        break;
      }
      if (mark === "ABSENT") {
        streak += 1;
        streakSince = l.date;
      }
    }
    let flag: Flag | null = null;
    if (rules.streak !== null && streak >= rules.streak && streakSince) {
      flag = { reason: "STREAK", missed: streak, sinceAt: streakSince };
    } else if (windowStart !== null && m.start <= windowStart) {
      const inWindow = own.filter((l) => l.date >= windowStart);
      const seen = inWindow.some((l) => l.marks.get(m.id) === "PRESENT");
      if (inWindow.length >= SILENT_MIN_LESSONS && !seen) {
        flag = {
          reason: "SILENT",
          missed: inWindow.length,
          sinceAt: inWindow[inWindow.length - 1]!.date,
        };
      }
    }
    verdicts.set(m.id, { flag, lastPresentAt });
  }
  return verdicts;
}

export interface AbsenceSyncResult {
  opened: number;
  closed: number;
  /** New cases per branch, for the managers' notice. */
  openedBy: Map<string, number>;
}

/**
 * Brings the cases of the given branches (or memberships) in line with the
 * attendance: opens a case for every student the rules now flag, refreshes open
 * ones, closes them when the student is back (RETURNED), is no longer an active
 * member of an active group (LEFT) or the rules no longer apply (CLEARED).
 */
export async function syncAbsenceCases(
  db: DbClient,
  scope: { branchIds?: string[]; membershipIds?: string[] },
  rules: AbsenceRules,
  todayIso: string = today(),
): Promise<AbsenceSyncResult> {
  const result: AbsenceSyncResult = { opened: 0, closed: 0, openedBy: new Map() };
  const memberships = await db.groupMembership.findMany({
    where: {
      status: "ACTIVE",
      student: { isArchived: false },
      group: {
        status: "ACTIVE",
        ...(scope.branchIds ? { branchId: { in: scope.branchIds } } : {}),
      },
      ...(scope.membershipIds ? { id: { in: scope.membershipIds } } : {}),
    },
    select: {
      id: true,
      studentId: true,
      groupId: true,
      joinedAt: true,
      activatedAt: true,
      group: { select: { branchId: true } },
    },
  });
  const members: MemberRow[] = memberships.map((m) => ({
    id: m.id,
    studentId: m.studentId,
    groupId: m.groupId,
    branchId: m.group.branchId,
    start: dateToIso(m.activatedAt ?? m.joinedAt),
  }));
  const open = await db.absenceCase.findMany({
    where: {
      status: "OPEN",
      ...(scope.branchIds ? { branchId: { in: scope.branchIds } } : {}),
      ...(scope.membershipIds ? { membershipId: { in: scope.membershipIds } } : {}),
    },
  });
  const openByMembership = new Map(open.map((c) => [c.membershipId, c]));
  const ruled = rules.streak !== null || rules.silentDays !== null;
  const verdicts = ruled ? await judgeMembers(db, members, rules, todayIso) : new Map();
  const now = new Date();

  for (const m of members) {
    const verdict: Verdict = verdicts.get(m.id) ?? { flag: null, lastPresentAt: null };
    const existing = openByMembership.get(m.id);
    if (verdict.flag && !existing) {
      await db.absenceCase.create({
        data: {
          membershipId: m.id,
          studentId: m.studentId,
          groupId: m.groupId,
          branchId: m.branchId,
          reason: verdict.flag.reason,
          missed: verdict.flag.missed,
          sinceAt: isoToDate(verdict.flag.sinceAt),
          lastPresentAt: verdict.lastPresentAt ? isoToDate(verdict.lastPresentAt) : null,
          openedAt: isoToDate(todayIso),
        },
      });
      result.opened += 1;
      result.openedBy.set(m.branchId, (result.openedBy.get(m.branchId) ?? 0) + 1);
    } else if (verdict.flag && existing) {
      // The run keeps its first day; the count and the rule follow the marks.
      const sinceIso = dateToIso(existing.sinceAt);
      const sinceAt = verdict.flag.sinceAt < sinceIso ? verdict.flag.sinceAt : sinceIso;
      const data: Prisma.AbsenceCaseUncheckedUpdateInput = {};
      if (existing.reason !== verdict.flag.reason) data.reason = verdict.flag.reason;
      if (existing.missed !== verdict.flag.missed) data.missed = verdict.flag.missed;
      if (sinceAt !== sinceIso) data.sinceAt = isoToDate(sinceAt);
      if (Object.keys(data).length > 0) {
        await db.absenceCase.update({ where: { id: existing.id }, data });
      }
    } else if (!verdict.flag && existing) {
      const before = existing.lastPresentAt ? dateToIso(existing.lastPresentAt) : null;
      const returned =
        verdict.lastPresentAt !== null && (before === null || verdict.lastPresentAt > before);
      await db.absenceCase.update({
        where: { id: existing.id },
        data: {
          status: "CLOSED",
          closedAt: now,
          closedReason: returned ? "RETURNED" : "CLEARED",
          lastPresentAt: verdict.lastPresentAt ? isoToDate(verdict.lastPresentAt) : null,
        },
      });
      result.closed += 1;
    }
  }

  const active = new Set(members.map((m) => m.id));
  for (const c of open) {
    if (active.has(c.membershipId)) continue;
    await db.absenceCase.update({
      where: { id: c.id },
      data: { status: "CLOSED", closedAt: now, closedReason: "LEFT" },
    });
    result.closed += 1;
  }
  return result;
}

export interface AbsenceFollowUpRun {
  opened: number;
  closed: number;
  notified: number;
}

/**
 * The daily step (job `auto-sms.daily`), once per centre: reconcile the cases of
 * every branch and tell the branch's managers how many students were added today.
 */
export async function runDailyAbsenceFollowUp(
  db: DbClient,
  todayIso: string = today(),
  /** Limits the run to some branches (tests); the worker runs every centre. */
  scope: { branchIds?: string[] } = {},
): Promise<AbsenceFollowUpRun> {
  const result: AbsenceFollowUpRun = { opened: 0, closed: 0, notified: 0 };
  const orgs = await db.organization.findMany({
    select: {
      id: true,
      settings: { select: { absenceStreak: true, absenceSilentDays: true } },
      branches: { select: { id: true } },
    },
  });
  for (const org of orgs) {
    const branchIds = org.branches
      .map((b) => b.id)
      .filter((id) => !scope.branchIds || scope.branchIds.includes(id));
    if (branchIds.length === 0) continue;
    const rules: AbsenceRules = org.settings
      ? { streak: org.settings.absenceStreak, silentDays: org.settings.absenceSilentDays }
      : DEFAULT_ABSENCE_RULES;
    const synced = await syncAbsenceCases(db, { branchIds }, rules, todayIso);
    result.opened += synced.opened;
    result.closed += synced.closed;
    for (const [branchId, count] of synced.openedBy) {
      result.notified += await notifyUsers(db, {
        kind: "ABSENCES",
        params: { count, day: todayIso },
        href: `/absences?branchId=${branchId}&status=NO_CONTACT`,
        branchId,
        permission: "students.update",
      });
    }
  }
  return result;
}

/** Monday from 09:00 Tashkent time: the week's summary for the staff feed is due once. */
export function weeklyAbsenceSummaryDue(
  now: Date = new Date(),
): { date: string; key: string } | null {
  const clock = wallClock(now);
  if (isoToDate(clock.date).getUTCDay() !== 1) return null;
  if (clock.minutes < WEEKLY_SUMMARY_HOUR * 60) return null;
  return { date: clock.date, key: `absence-weekly:${clock.date}` };
}

/**
 * The Monday summary (job `telegram.absenceSummary`): per centre and branch, how
 * many students are on the list, how many nobody has called, what changed in the
 * past week and the names waiting for a call. Branches with nothing to report are
 * skipped; the texts are Uzbek like the rest of the staff feed (A-85).
 */
export async function runWeeklyAbsenceSummary(
  db: DbClient,
  dateIso: string,
  scope: { branchIds?: string[] } = {},
): Promise<number> {
  const from = shiftIso(dateIso, -7);
  const weekStart = new Date(`${from}T00:00:00+05:00`);
  let queued = 0;
  const orgs = await db.organization.findMany({
    where: { botRecipients: { some: {} } },
    select: {
      id: true,
      settings: { select: { absenceStreak: true, absenceSilentDays: true } },
      branches: { select: { id: true, name: true } },
    },
  });
  for (const org of orgs) {
    const branches = org.branches.filter((b) => !scope.branchIds || scope.branchIds.includes(b.id));
    if (branches.length === 0) continue;
    const rules: AbsenceRules = org.settings
      ? { streak: org.settings.absenceStreak, silentDays: org.settings.absenceSilentDays }
      : DEFAULT_ABSENCE_RULES;
    await syncAbsenceCases(db, { branchIds: branches.map((b) => b.id) }, rules, dateIso);
    for (const branch of branches) {
      const [open, opened, returned, left] = await Promise.all([
        db.absenceCase.findMany({
          where: { branchId: branch.id, status: "OPEN" },
          include: {
            student: { select: { fullName: true } },
            group: { select: { name: true } },
          },
          orderBy: [{ lastContactAt: { sort: "asc", nulls: "first" } }, { sinceAt: "asc" }],
        }),
        db.absenceCase.count({
          where: { branchId: branch.id, openedAt: { gte: isoToDate(from) } },
        }),
        db.absenceCase.count({
          where: { branchId: branch.id, closedReason: "RETURNED", closedAt: { gte: weekStart } },
        }),
        db.absenceCase.count({
          where: { branchId: branch.id, closedReason: "LEFT", closedAt: { gte: weekStart } },
        }),
      ]);
      if (open.length === 0 && opened === 0 && returned === 0 && left === 0) continue;
      const waiting = open.filter((c) => c.lastContactAt === null);
      const lines = [
        botText("uz", "absenceWeeklyTitle", {
          branch: branch.name,
          from: botDate("uz", from),
          to: botDate("uz", shiftIso(dateIso, -1)),
          open: open.length,
          noContact: waiting.length,
          opened,
          returned,
          left,
        }),
      ];
      for (const c of waiting.slice(0, WEEKLY_SUMMARY_NAMES)) {
        lines.push(
          botText("uz", "absenceWeeklyLine", {
            student: c.student.fullName,
            group: c.group.name,
            days: daysBetween(dateToIso(c.sinceAt), dateIso),
          }),
        );
      }
      if (waiting.length > WEEKLY_SUMMARY_NAMES) {
        lines.push(
          botText("uz", "absenceWeeklyMore", { count: waiting.length - WEEKLY_SUMMARY_NAMES }),
        );
      }
      queued += await notifyStaff(db, {
        organizationId: org.id,
        branchId: branch.id,
        text: lines.join("\n"),
      });
    }
  }
  return queued;
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
  group: {
    select: {
      name: true,
      teachers: {
        where: { role: "MAIN" },
        select: { user: { select: { fullName: true } } },
        take: 1,
      },
    },
  },
  branch: { select: { name: true } },
  contacts: {
    orderBy: { createdAt: "desc" },
    take: 1,
    select: { createdBy: { select: { fullName: true } } },
  },
} satisfies Prisma.AbsenceCaseInclude;
type CaseRow = Prisma.AbsenceCaseGetPayload<{ include: typeof caseInclude }>;

function toDto(row: CaseRow, todayIso: string): AbsenceCaseDto {
  const sinceAt = dateToIso(row.sinceAt);
  return {
    id: row.id,
    membershipId: row.membershipId,
    studentId: row.studentId,
    studentName: row.student.fullName,
    phone: row.student.phone,
    parentPhone: row.student.parents[0]?.phone ?? null,
    groupId: row.groupId,
    groupName: row.group.name,
    teacher: row.group.teachers[0]?.user.fullName ?? null,
    branchId: row.branchId,
    branchName: row.branch.name,
    status: row.status,
    reason: row.reason,
    missed: row.missed,
    sinceAt,
    days: daysBetween(sinceAt, row.closedAt ? dateToIso(row.closedAt) : todayIso),
    lastPresentAt: row.lastPresentAt ? dateToIso(row.lastPresentAt) : null,
    openedAt: dateToIso(row.openedAt),
    lastContactAt: row.lastContactAt?.toISOString() ?? null,
    lastChannel: row.lastChannel,
    lastOutcome: row.lastOutcome,
    lastContactBy: row.contacts[0]?.createdBy?.fullName ?? null,
    closedAt: row.closedAt?.toISOString() ?? null,
    closedReason: row.closedReason,
    hasTelegram: row.student.telegramChats.length > 0,
  };
}

function statusWhere(filter: AbsenceListFilter): Prisma.AbsenceCaseWhereInput {
  switch (filter) {
    case "NO_CONTACT":
      return { status: "OPEN", lastContactAt: null };
    case "CLOSED":
      return { status: "CLOSED" };
    case "ALL":
      return {};
    default:
      return { status: "OPEN" };
  }
}

function orderOf(
  field: AbsenceSortField,
  dir: "asc" | "desc",
): Prisma.AbsenceCaseOrderByWithRelationInput {
  switch (field) {
    case "fullName":
      return { student: { fullName: dir } };
    case "group":
      return { group: { name: dir } };
    case "missed":
      return { missed: dir };
    case "lastContactAt":
      return { lastContactAt: { sort: dir, nulls: "last" } };
    default:
      return { sinceAt: dir };
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

/** "/absences": the live list of the branches in scope, longest away first. */
export async function listAbsenceCases(
  actor: Actor,
  query: ParsedList<AbsenceSortField>,
  filters: AbsenceFilters,
  db: DbClient = prisma,
): Promise<AbsenceListDto> {
  authorize(actor, "students.update");
  const branchIds = scopeBranches(actor, filters.branchId);
  const todayIso = today();
  const rules = await absenceRules(db, actor.organizationId);
  await syncAbsenceCases(db, { branchIds }, rules, todayIso);
  const where: Prisma.AbsenceCaseWhereInput = {
    branchId: { in: branchIds },
    ...statusWhere(filters.status ?? "OPEN"),
    ...(filters.reason ? { reason: filters.reason } : {}),
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
  const openWhere: Prisma.AbsenceCaseWhereInput = { branchId: { in: branchIds }, status: "OPEN" };
  const [total, rows, open, noContact, streak, silent] = await Promise.all([
    db.absenceCase.count({ where }),
    db.absenceCase.findMany({
      where,
      include: caseInclude,
      orderBy: [orderOf(query.sort.field, query.sort.direction), { id: "asc" }],
      skip: query.skip,
      take: query.take,
    }),
    db.absenceCase.count({ where: openWhere }),
    db.absenceCase.count({ where: { ...openWhere, lastContactAt: null } }),
    db.absenceCase.count({ where: { ...openWhere, reason: "STREAK" } }),
    db.absenceCase.count({ where: { ...openWhere, reason: "SILENT" } }),
  ]);
  return {
    items: rows.map((r) => toDto(r, todayIso)),
    page: query.page,
    pageSize: query.pageSize,
    total,
    summary: { open, noContact, streak, silent },
    rules,
  };
}

async function findCase(db: DbClient, actor: Actor, id: string): Promise<CaseRow> {
  const row = await mustFind(db.absenceCase.findUnique({ where: { id }, include: caseInclude }));
  authorizeBranch(actor, row.branchId);
  return row;
}

export async function getAbsenceCase(
  actor: Actor,
  id: string,
  db: DbClient = prisma,
): Promise<AbsenceCaseDto> {
  authorize(actor, "students.update");
  return toDto(await findCase(db, actor, id), today());
}

/** Everything staff recorded on a case, newest first. */
export async function listAbsenceContacts(
  actor: Actor,
  caseId: string,
  db: DbClient = prisma,
): Promise<AbsenceContactDto[]> {
  authorize(actor, "students.update");
  await findCase(db, actor, caseId);
  const rows = await db.absenceContact.findMany({
    where: { caseId },
    orderBy: { createdAt: "desc" },
    include: { createdBy: { select: { fullName: true } } },
  });
  return rows.map((c) => ({
    id: c.id,
    channel: c.channel,
    outcome: c.outcome,
    note: c.note,
    createdBy: c.createdBy?.fullName ?? null,
    createdAt: c.createdAt.toISOString(),
  }));
}

/** A staff member records a call, visit, message or note with its outcome. */
export async function logAbsenceContact(
  actor: Actor,
  caseId: string,
  input: AbsenceContactInput,
  db: DbClient = prisma,
): Promise<AbsenceCaseDto> {
  authorize(actor, "students.update");
  const row = await findCase(db, actor, caseId);
  if (row.status === "CLOSED") throw AppError.conflict("errors.absenceCaseClosed");
  await db.$transaction(async (tx) => {
    await tx.absenceCase.update({
      where: { id: caseId },
      data: {
        lastContactAt: new Date(),
        lastChannel: input.channel,
        lastOutcome: input.outcome ?? null,
        contacts: {
          create: {
            channel: input.channel,
            outcome: input.outcome ?? null,
            note: input.note ?? null,
            createdById: actor.userId || null,
          },
        },
      },
    });
    await recordAudit(tx, actor, {
      action: "absence.contact",
      entity: "AbsenceCase",
      entityId: caseId,
      after: {
        student: row.student.fullName,
        group: row.group.name,
        channel: input.channel,
        outcome: input.outcome ?? null,
        note: input.note ?? null,
      },
      branchId: row.branchId,
    });
  });
  return getAbsenceCase(actor, caseId, db);
}
