import en from "../../../../messages/en.json";
import ru from "../../../../messages/ru.json";
import uz from "../../../../messages/uz.json";

import {
  BADGE_CODES,
  PERFECT_MONTH_LESSONS,
  STREAK_LESSONS,
  type BadgeCode,
  type BadgeDto,
} from "@/lib/validation/badges";
import { prisma, type DbClient } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";
import { authorize, type Actor } from "@/server/rbac/authorize";
import { studentScope } from "@/server/services/students/students.service";
import {
  notifyStudents,
  type BotLocale,
} from "@/server/services/telegram/student-telegram.service";
import { membershipByToken } from "@/server/services/video/video.service";

/**
 * Badges (A-163, online-lessons item C6): fixed achievements on top of coins.
 * Each is earned once per student, never taken back, and announced on the
 * student's Telegram. `checkBadges` runs after the events that can earn one
 * (a homework accepted, attendance marked, an exercise or test done, coins
 * given) and is idempotent.
 */

export {
  BADGE_CODES,
  PERFECT_MONTH_LESSONS,
  STREAK_LESSONS,
  type BadgeCode,
  type BadgeDto,
} from "@/lib/validation/badges";

const MESSAGES: Record<
  BotLocale,
  { badges: { items: Record<string, { name: string; hint: string }> } }
> = { uz, ru, en };

type Earned = Map<BadgeCode, { groupId: string | null }>;

/** Which badges the student's record earns right now, from the data itself. */
async function earnedBadges(db: DbClient, studentId: string): Promise<Earned> {
  const earned: Earned = new Map();
  const [accepted, attendance, attempts, aceTest, coins] = await Promise.all([
    db.homeworkSubmission.count({ where: { status: "ACCEPTED", membership: { studentId } } }),
    db.attendance.findMany({
      where: { membership: { studentId }, status: { in: ["PRESENT", "ABSENT"] } },
      select: {
        status: true,
        membershipId: true,
        membership: { select: { groupId: true } },
        lesson: { select: { date: true } },
      },
      orderBy: { lesson: { date: "asc" } },
    }),
    db.exerciseAttempt.findMany({
      where: { membership: { studentId } },
      select: { exerciseId: true, score: true, maxScore: true },
    }),
    db.testAttempt.findFirst({
      where: { studentId, percent: { gte: 90 } },
      select: { groupId: true },
    }),
    db.coinTransaction.aggregate({
      _sum: { amount: true },
      where: { studentId, amount: { gt: 0 } },
    }),
  ]);

  if (accepted >= 1) earned.set("firstHomework", { groupId: null });
  if (accepted >= 10) earned.set("homework10", { groupId: null });

  // Streaks and months are counted within one group's lessons.
  const byMembership = new Map<string, typeof attendance>();
  for (const a of attendance) {
    const list = byMembership.get(a.membershipId) ?? [];
    list.push(a);
    byMembership.set(a.membershipId, list);
  }
  for (const marks of byMembership.values()) {
    const groupId = marks[0]!.membership.groupId;
    let run = 0;
    const months = new Map<string, { total: number; present: number }>();
    for (const a of marks) {
      run = a.status === "PRESENT" ? run + 1 : 0;
      if (run >= STREAK_LESSONS && !earned.has("streak10")) earned.set("streak10", { groupId });
      const month = a.lesson.date.toISOString().slice(0, 7);
      const m = months.get(month) ?? { total: 0, present: 0 };
      m.total += 1;
      if (a.status === "PRESENT") m.present += 1;
      months.set(month, m);
    }
    for (const m of months.values()) {
      if (
        m.total >= PERFECT_MONTH_LESSONS &&
        m.present === m.total &&
        !earned.has("perfectMonth")
      ) {
        earned.set("perfectMonth", { groupId });
      }
    }
  }

  if (new Set(attempts.map((a) => a.exerciseId)).size >= 10) {
    earned.set("exercises10", { groupId: null });
  }
  if (attempts.some((a) => a.maxScore > 0 && a.score === a.maxScore)) {
    earned.set("exerciseAce", { groupId: null });
  }
  if (aceTest) earned.set("testAce", { groupId: aceTest.groupId });
  if ((coins._sum.amount ?? 0) >= 100) earned.set("coins100", { groupId: null });
  return earned;
}

function badgeText(locale: BotLocale, code: BadgeCode): { name: string; hint: string } {
  const item = MESSAGES[locale].badges.items[code]!;
  return { name: item.name, hint: item.hint.replace("{count}", String(PERFECT_MONTH_LESSONS)) };
}

/**
 * Awards every badge the student has newly earned and tells their Telegram.
 * Safe to call often; returns the codes awarded by this call.
 */
export async function checkBadges(db: DbClient, studentId: string): Promise<BadgeCode[]> {
  const [earned, existing] = await Promise.all([
    earnedBadges(db, studentId),
    db.studentBadge.findMany({ where: { studentId }, select: { code: true } }),
  ]);
  const have = new Set(existing.map((b) => b.code));
  const fresh = BADGE_CODES.filter((code) => earned.has(code) && !have.has(code));
  if (fresh.length === 0) return [];
  await db.studentBadge.createMany({
    data: fresh.map((code) => ({ studentId, code, groupId: earned.get(code)!.groupId })),
    skipDuplicates: true,
  });
  for (const code of fresh) {
    await notifyStudents(db, {
      studentIds: [studentId],
      kind: "badgeEarned",
      refKey: `badge:${studentId}:${code}`,
      values: (locale) => badgeText(locale, code),
    });
  }
  return fresh;
}

async function badgesOf(db: DbClient, studentId: string): Promise<BadgeDto[]> {
  const rows = await db.studentBadge.findMany({
    where: { studentId },
    select: { code: true, earnedAt: true, group: { select: { name: true } } },
  });
  const byCode = new Map(rows.map((r) => [r.code, r]));
  return BADGE_CODES.map((code) => {
    const row = byCode.get(code);
    return {
      code,
      earnedAt: row ? row.earnedAt.toISOString() : null,
      groupName: row?.group?.name ?? null,
    };
  });
}

/** Student profile → Progress: every badge, earned or still locked. */
export async function listStudentBadges(
  actor: Actor,
  studentId: string,
  db: DbClient = prisma,
): Promise<BadgeDto[]> {
  authorize(actor, "students.view");
  const student = await db.student.findFirst({
    where: { id: studentId, ...studentScope(actor) },
    select: { id: true },
  });
  if (!student) throw AppError.notFound();
  return badgesOf(db, studentId);
}

/** The student's own badges on their personal page; null for an unknown link. */
export async function getPortalBadges(
  token: string,
  db: DbClient = prisma,
): Promise<BadgeDto[] | null> {
  const membership = await membershipByToken(db, token);
  if (!membership) return null;
  return badgesOf(db, membership.student.id);
}
