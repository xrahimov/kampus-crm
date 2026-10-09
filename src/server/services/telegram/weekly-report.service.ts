import { formatMoneyUz } from "@/lib/dates";
import type { DbClient } from "@/server/db/prisma";
import { studentBalance } from "@/server/services/coins/coins.service";
import { telegramConfigFor } from "@/server/services/integrations/integrations.service";
import { dateToIso, isoToDate } from "@/server/services/settings/shared";
import { membershipBalances } from "@/server/services/students/balances";

import {
  botDate,
  botText,
  notifyStudents,
  wallClock,
  type BotLocale,
} from "./student-telegram.service";

/*
 * Weekly parent report (A-118): every Sunday from WEEKLY_REPORT_HOUR Tashkent
 * time, each chat linked to a student gets the week's attendance, grades,
 * homework, coins and money in its own language. The worker queues one job per
 * Sunday (`tg-weekly:<date>`) and the job one message per chat
 * (`tg:weekly:<date>:<chat>`), so nothing goes out twice.
 */

export const WEEKLY_REPORT_HOUR = 18;

/** The Sunday a report is due for when `now` is a Sunday at or after the hour; null otherwise. */
export function weeklyReportDue(now: Date = new Date()): { date: string; key: string } | null {
  const clock = wallClock(now);
  if (isoToDate(clock.date).getUTCDay() !== 0) return null;
  if (clock.minutes < WEEKLY_REPORT_HOUR * 60) return null;
  return { date: clock.date, key: `tg-weekly:${clock.date}` };
}

export interface WeeklyGroupReport {
  group: string;
  /** Lessons held in the week. */
  lessons: number;
  attended: number;
  missed: number;
  excused: number;
  grades: string[];
  homeworkSet: number;
  homeworkDone: number;
}

export interface WeeklyReport {
  student: string;
  from: string;
  to: string;
  groups: WeeklyGroupReport[];
  coinsEarned: number;
  coinsTotal: number;
  balance: number;
  nextPaymentDate: string | null;
}

const shiftIso = (iso: string, days: number): string => {
  const d = isoToDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return dateToIso(d);
};

const formatScore = (score: unknown): string => {
  const n = Number(score);
  return Number.isInteger(n) ? String(n) : n.toFixed(1);
};

/** The week `from`–`to` of one student, or null when they are in no current group. */
export async function buildWeeklyReport(
  db: DbClient,
  student: { id: string; fullName: string },
  from: string,
  to: string,
): Promise<WeeklyReport | null> {
  const memberships = await db.groupMembership.findMany({
    where: { studentId: student.id, status: { in: ["NEW", "TRIAL", "ACTIVE"] } },
    select: { id: true, groupId: true, group: { select: { name: true } } },
    orderBy: { group: { name: "asc" } },
  });
  if (memberships.length === 0) return null;
  const membershipIds = memberships.map((m) => m.id);
  const lessons = await db.lesson.findMany({
    where: {
      groupId: { in: memberships.map((m) => m.groupId) },
      date: { gte: isoToDate(from), lte: isoToDate(to) },
    },
    select: {
      groupId: true,
      date: true,
      attendances: {
        where: { membershipId: { in: membershipIds } },
        select: { membershipId: true, status: true },
      },
      grades: {
        where: { membershipId: { in: membershipIds } },
        select: { membershipId: true, score: true },
      },
      homework: {
        select: {
          submissions: {
            where: { membershipId: { in: membershipIds } },
            select: { membershipId: true, status: true },
          },
        },
      },
    },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
  });
  const groups: WeeklyGroupReport[] = memberships.map((m) => {
    const own = lessons.filter((l) => l.groupId === m.groupId);
    const report: WeeklyGroupReport = {
      group: m.group.name,
      lessons: own.length,
      attended: 0,
      missed: 0,
      excused: 0,
      grades: [],
      homeworkSet: 0,
      homeworkDone: 0,
    };
    for (const lesson of own) {
      const mark = lesson.attendances.find((a) => a.membershipId === m.id)?.status;
      if (mark === "PRESENT") report.attended += 1;
      else if (mark === "ABSENT") report.missed += 1;
      else if (mark === "EXCUSED") report.excused += 1;
      const grade = lesson.grades.find((g) => g.membershipId === m.id);
      if (grade) report.grades.push(formatScore(grade.score));
      if (lesson.homework) {
        report.homeworkSet += 1;
        const submission = lesson.homework.submissions.find((s) => s.membershipId === m.id);
        if (submission && submission.status !== "RETURNED") report.homeworkDone += 1;
      }
    }
    return report;
  });

  // Coins earned Monday 00:00 to Sunday 23:59 Tashkent time, and the balance in all.
  const [earned, coinsTotal, balances] = await Promise.all([
    db.coinTransaction.aggregate({
      where: {
        studentId: student.id,
        amount: { gt: 0 },
        createdAt: {
          gte: new Date(`${from}T00:00:00+05:00`),
          lte: new Date(`${to}T23:59:59+05:00`),
        },
      },
      _sum: { amount: true },
    }),
    studentBalance(db, student.id),
    membershipBalances(db, membershipIds),
  ]);
  let balance = 0;
  let nextPaymentDate: string | null = null;
  for (const b of balances.values()) {
    balance += b.balance;
    if (b.nextPaymentDate && (!nextPaymentDate || b.nextPaymentDate < nextPaymentDate)) {
      nextPaymentDate = b.nextPaymentDate;
    }
  }
  return {
    student: student.fullName,
    from,
    to,
    groups,
    coinsEarned: earned._sum.amount ?? 0,
    coinsTotal,
    balance,
    nextPaymentDate,
  };
}

const orNone = (value: string | number): string =>
  value === 0 || value === "" ? "none" : String(value);

/** The report as the bot sends it, one line per part, in the chat's language. */
export function weeklyReportText(locale: BotLocale, report: WeeklyReport): string {
  const lines = [
    botText(locale, "weeklyTitle", {
      student: report.student,
      from: botDate(locale, report.from),
      to: botDate(locale, report.to),
    }),
  ];
  for (const g of report.groups) {
    lines.push(
      g.lessons === 0
        ? botText(locale, "weeklyNoLessons", { group: g.group })
        : botText(locale, "weeklyGroup", {
            group: g.group,
            lessons: g.lessons,
            attended: g.attended,
            missed: orNone(g.missed),
            excused: orNone(g.excused),
            grades: orNone(g.grades.join(", ")),
            homework: g.homeworkSet > 0 ? `${g.homeworkDone}/${g.homeworkSet}` : "none",
          }),
    );
  }
  if (report.coinsEarned > 0 || report.coinsTotal > 0) {
    lines.push(
      botText(locale, "weeklyCoins", { earned: report.coinsEarned, total: report.coinsTotal }),
    );
  }
  lines.push(
    report.balance < 0
      ? botText(locale, "weeklyDebt", { debt: formatMoneyUz(-report.balance) })
      : botText(locale, "weeklyBalance", {
          balance: formatMoneyUz(report.balance),
          next: report.nextPaymentDate ? botDate(locale, report.nextPaymentDate) : "none",
        }),
  );
  return lines.join("\n");
}

/**
 * Queues the report for the week ending on `sundayIso` to every chat linked to a
 * student of a centre whose bot is enabled with the weekly report switched on.
 */
export async function runWeeklyReports(
  db: DbClient,
  sundayIso: string,
): Promise<{ students: number; queued: number }> {
  const from = shiftIso(sundayIso, -6);
  const chats = await db.studentTelegramChat.findMany({
    where: { student: { isArchived: false } },
    distinct: ["studentId"],
    select: {
      studentId: true,
      student: {
        select: { fullName: true, branch: { select: { organizationId: true } } },
      },
    },
  });
  const centreOn = new Map<string, boolean>();
  let students = 0;
  let queued = 0;
  for (const chat of chats) {
    const organizationId = chat.student.branch.organizationId;
    let on = centreOn.get(organizationId);
    if (on === undefined) {
      const effective = await telegramConfigFor(db, organizationId);
      on = Boolean(effective?.config.weeklyReport);
      centreOn.set(organizationId, on);
    }
    if (!on) continue;
    const report = await buildWeeklyReport(
      db,
      { id: chat.studentId, fullName: chat.student.fullName },
      from,
      sundayIso,
    );
    if (!report) continue;
    students += 1;
    queued += await db.$transaction((tx) =>
      notifyStudents(tx, {
        studentIds: [chat.studentId],
        kind: "weeklyTitle",
        refKey: `weekly:${sundayIso}`,
        text: (locale) => weeklyReportText(locale, report),
      }),
    );
  }
  return { students, queued };
}
