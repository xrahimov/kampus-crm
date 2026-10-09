import type { Prisma } from "@/generated/prisma/client";
import type { PortalTestAttemptInput } from "@/lib/validation/tests";
import { recordAudit } from "@/server/audit/audit";
import { prisma, type DbClient } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";
import { awardAutoCoins } from "@/server/services/coins/coins.service";
import { today } from "@/server/services/groups/shared";
import { dateToIso, decimalToNumber } from "@/server/services/settings/shared";
import { membershipByToken } from "@/server/services/video/video.service";

/*
 * Students take tests from their personal page (round 2 item G1, A-145).
 * An active test given to the student's group appears on the page; the student
 * starts it once, answers within the time limit and gets the score at once.
 * The countdown runs from the moment the test was first opened, kept in
 * `PortalTestStart`, so reloading the page never resets it. One attempt per
 * test per student; the teacher sees it like a result they entered themselves.
 */

/** Seconds a late hand-in is still accepted (a slow network at the last second). */
const GRACE_SECONDS = 60;

export interface PortalTestDto {
  id: string;
  name: string;
  subject: string;
  questionCount: number;
  totalPoints: number;
  timeLimitMinutes: number | null;
  passPercent: number;
  deadline: string | null;
  /** The test can still be taken: active, before its deadline, not yet handed in. */
  available: boolean;
  /** Set once the student opened the test; null when the limit has not run out. */
  startedAt: string | null;
  secondsLeft: number | null;
  attempt: {
    score: number;
    maxScore: number;
    percent: number;
    passed: boolean;
    submittedAt: string;
  } | null;
}

export interface PortalTestRunDto {
  id: string;
  name: string;
  subject: string;
  timeLimitMinutes: number | null;
  passPercent: number;
  startedAt: string;
  /** Seconds left on the countdown as the server sees it; null without a time limit. */
  secondsLeft: number | null;
  questions: Array<{ id: string; text: string; options: string[]; points: number }>;
}

export interface PortalAttemptResultDto {
  score: number;
  maxScore: number;
  percent: number;
  passed: boolean;
  coins: number;
}

const include = {
  questions: { include: { question: true }, orderBy: { sortOrder: "asc" } },
} satisfies Prisma.TestInclude;
type Row = Prisma.TestGetPayload<{ include: typeof include }>;

function openForTaking(test: { status: string; deadline: Date | null }): boolean {
  if (test.status !== "ACTIVE") return false;
  return !test.deadline || dateToIso(test.deadline) >= today();
}

const elapsedSeconds = (startedAt: Date) => Math.floor((Date.now() - startedAt.getTime()) / 1000);

function secondsLeft(test: { timeLimitMinutes: number | null }, startedAt: Date | null) {
  if (!test.timeLimitMinutes || !startedAt) return null;
  return Math.max(0, test.timeLimitMinutes * 60 - elapsedSeconds(startedAt));
}

/** Score the answers the way the teacher's entry does: points per matching option. */
export function scoreAnswers(
  questions: Array<{ questionId: string; points: number; question: { correctIndex: number } }>,
  answers: Record<string, number>,
): { score: number; maxScore: number; percent: number } {
  let score = 0;
  let maxScore = 0;
  for (const q of questions) {
    maxScore += q.points;
    if (answers[q.questionId] === q.question.correctIndex) score += q.points;
  }
  const percent = maxScore === 0 ? 0 : Math.round((score / maxScore) * 10000) / 100;
  return { score, maxScore, percent };
}

/** The tests of the student's group: open ones first, then what they already took. */
export async function listPortalTests(
  token: string,
  db: DbClient = prisma,
): Promise<PortalTestDto[] | null> {
  const membership = await membershipByToken(db, token);
  if (!membership) return null;
  const tests = await db.test.findMany({
    where: {
      groups: { some: { groupId: membership.groupId } },
      status: { in: ["ACTIVE", "CLOSED"] },
    },
    include: {
      questions: { select: { points: true } },
      attempts: {
        where: { studentId: membership.student.id },
        orderBy: { submittedAt: "desc" },
        take: 1,
      },
      portalStarts: { where: { membershipId: membership.id } },
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });
  return tests
    .map((t): PortalTestDto => {
      const attempt = t.attempts[0] ?? null;
      const start = t.portalStarts[0]?.startedAt ?? null;
      const left = secondsLeft(t, start);
      return {
        id: t.id,
        name: t.name,
        subject: t.subject,
        questionCount: t.questions.length,
        totalPoints: t.questions.reduce((s, q) => s + q.points, 0),
        timeLimitMinutes: t.timeLimitMinutes,
        passPercent: t.passPercent,
        deadline: t.deadline ? dateToIso(t.deadline) : null,
        available: !attempt && openForTaking(t) && (left === null || left > 0),
        startedAt: start ? start.toISOString() : null,
        secondsLeft: left,
        attempt: attempt
          ? {
              score: attempt.score,
              maxScore: attempt.maxScore,
              percent: decimalToNumber(attempt.percent),
              passed: decimalToNumber(attempt.percent) >= t.passPercent,
              submittedAt: attempt.submittedAt.toISOString(),
            }
          : null,
      };
    })
    .filter((t) => t.attempt || t.available || t.startedAt);
}

async function testForMembership(
  db: DbClient,
  membership: { groupId: string; student: { id: string } },
  testId: string,
): Promise<Row> {
  const test = await db.test.findFirst({
    where: { id: testId, groups: { some: { groupId: membership.groupId } } },
    include,
  });
  if (!test) throw AppError.notFound("errors.testNotFound");
  if (!openForTaking(test)) throw AppError.conflict("errors.testNotAvailable");
  const taken = await db.testAttempt.findFirst({
    where: { testId, studentId: membership.student.id },
    select: { id: true },
  });
  if (taken) throw AppError.conflict("errors.testAttempted");
  return test;
}

/**
 * The student opens the test: the questions without their answers, and the
 * countdown, which starts now or continues from the first opening.
 */
export async function startPortalTest(
  token: string,
  testId: string,
  db: DbClient = prisma,
): Promise<PortalTestRunDto> {
  const membership = await membershipByToken(db, token);
  if (!membership) throw AppError.notFound();
  const test = await testForMembership(db, membership, testId);
  const start = await db.portalTestStart.upsert({
    where: { testId_membershipId: { testId, membershipId: membership.id } },
    create: { testId, membershipId: membership.id },
    update: {},
  });
  const left = secondsLeft(test, start.startedAt);
  if (left !== null && left <= 0) throw AppError.conflict("errors.testTimeUp");
  return {
    id: test.id,
    name: test.name,
    subject: test.subject,
    timeLimitMinutes: test.timeLimitMinutes,
    passPercent: test.passPercent,
    startedAt: start.startedAt.toISOString(),
    secondsLeft: left,
    questions: test.questions.map((q) => ({
      id: q.questionId,
      text: q.question.text,
      options: q.question.options as string[],
      points: q.points,
    })),
  };
}

/** The student hands in: scored at once, coins on a pass, one attempt per test. */
export async function submitPortalAttempt(
  token: string,
  testId: string,
  input: PortalTestAttemptInput,
  db: DbClient = prisma,
): Promise<PortalAttemptResultDto> {
  const membership = await membershipByToken(db, token);
  if (!membership) throw AppError.notFound();
  const test = await testForMembership(db, membership, testId);
  const start = await db.portalTestStart.findUnique({
    where: { testId_membershipId: { testId, membershipId: membership.id } },
  });
  if (!start) throw AppError.conflict("errors.testNotStarted");
  const elapsed = elapsedSeconds(start.startedAt);
  const limit = test.timeLimitMinutes ? test.timeLimitMinutes * 60 : null;
  if (limit !== null && elapsed > limit + GRACE_SECONDS) {
    throw AppError.conflict("errors.testTimeUp");
  }
  const { score, maxScore, percent } = scoreAnswers(test.questions, input.answers);
  const passed = percent >= test.passPercent;
  const durationSeconds = Math.min(elapsed, limit ?? 86_400);
  const studentId = membership.student.id;
  return db.$transaction(async (tx) => {
    const row = await tx.testAttempt.create({
      data: {
        testId,
        studentId,
        groupId: membership.groupId,
        answers: input.answers as unknown as Prisma.InputJsonValue,
        score,
        maxScore,
        percent,
        durationSeconds,
        enteredById: null,
      },
      select: { id: true },
    });
    let coins = 0;
    if (passed) {
      await awardAutoCoins(tx, {
        event: "TEST_RESULT",
        studentId,
        groupId: membership.groupId,
        refKey: `test:${row.id}`,
      });
      const awarded = await tx.coinTransaction.findUnique({
        where: { refKey: `test:${row.id}` },
        select: { amount: true },
      });
      coins = awarded?.amount ?? 0;
    }
    await recordAudit(tx, null, {
      organizationId: test.organizationId,
      branchId: membership.group.branchId,
      action: "test.portalAttempt",
      entity: "Test",
      entityId: testId,
      after: { studentId, score, maxScore, durationSeconds },
    });
    return { score, maxScore, percent, passed, coins };
  });
}
