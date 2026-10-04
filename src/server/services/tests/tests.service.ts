import type { Prisma } from "@/generated/prisma/client";
import type {
  KnowledgeFilters,
  TestAttemptInput,
  TestFilters,
  TestInput,
  TestStatus,
} from "@/lib/validation/tests";
import { recordAudit } from "@/server/audit/audit";
import { prisma, type DbClient } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";
import { authorize, type Actor } from "@/server/rbac/authorize";
import { awardAutoCoins } from "@/server/services/coins/coins.service";
import { findGroupInScope, groupScope, ownGroupsOnly } from "@/server/services/groups/shared";
import {
  dateToIso,
  decimalToNumber,
  getOrganizationId,
  isoToDate,
  mustFind,
} from "@/server/services/settings/shared";
import { studentScope } from "@/server/services/students/students.service";

import { optionsOf } from "./questions.service";

/* Tests (EXP §8 Testlar, §5 TEST / BILIM TAHLILI, §6 TEST NATIJALARI). A-81, A-82. */

export interface TestDto {
  id: string;
  name: string;
  subject: string;
  timeLimitMinutes: number | null;
  passPercent: number;
  deadline: string | null;
  status: TestStatus;
  groups: Array<{ id: string; name: string }>;
  questionCount: number;
  totalPoints: number;
  attemptCount: number;
  /** Average percent over all attempts, null without attempts. */
  accuracy: number | null;
  createdAt: string;
}

export interface TestQuestionDto {
  questionId: string;
  subject: string;
  topic: string;
  text: string;
  options: string[];
  correctIndex: number;
  points: number;
}

export interface TestAttemptDto {
  id: string;
  testId: string;
  testName: string;
  subject: string;
  studentId: string;
  studentName: string;
  groupName: string | null;
  score: number;
  maxScore: number;
  percent: number;
  passed: boolean;
  durationSeconds: number | null;
  submittedAt: string;
}

export interface TestDetailDto extends TestDto {
  questions: TestQuestionDto[];
  attempts: TestAttemptDto[];
  /** Open members of the assigned groups, for "Natija kiritish". */
  candidates: Array<{ studentId: string; fullName: string; groupId: string; groupName: string }>;
}

export interface TestListDto {
  items: TestDto[];
  kpis: { total: number; active: number; attempts: number; accuracy: number | null };
}

export interface TestOptions {
  groups: Array<{ id: string; name: string; branchId: string }>;
  questions: Array<{ id: string; subject: string; topic: string; text: string }>;
  subjects: string[];
}

export interface TopicStatDto {
  subject: string;
  topic: string;
  questions: number;
  answered: number;
  correct: number;
  /** correct ÷ answered, in percent. */
  accuracy: number | null;
}

export interface GroupKnowledgeDto {
  topics: TopicStatDto[];
  tests: Array<{ id: string; name: string; subject: string }>;
  subjects: string[];
  attempts: number;
  students: number;
}

export type ThinkingLevel = "LOW" | "MEDIUM" | "HIGH";

export interface StudentTestResultsDto {
  kpis: {
    total: number;
    average: number | null;
    best: number | null;
    worst: number | null;
    averageSeconds: number | null;
  };
  /** "Fikrlash darajasi": derived from the average percent (A-82). */
  level: ThinkingLevel | null;
  problemTopics: TopicStatDto[];
  strongTopics: TopicStatDto[];
  dynamics: Array<{ date: string; percent: number; testName: string }>;
  attempts: TestAttemptDto[];
  subjects: string[];
  tests: Array<{ id: string; name: string }>;
}

const include = {
  groups: { include: { group: { select: { id: true, name: true } } } },
  questions: { select: { points: true } },
  attempts: { select: { percent: true } },
} satisfies Prisma.TestInclude;
type Row = Prisma.TestGetPayload<{ include: typeof include }>;

function avg(values: number[]): number | null {
  if (values.length === 0) return null;
  return Math.round((values.reduce((s, v) => s + v, 0) / values.length) * 10) / 10;
}

function toDto(row: Row): TestDto {
  return {
    id: row.id,
    name: row.name,
    subject: row.subject,
    timeLimitMinutes: row.timeLimitMinutes,
    passPercent: row.passPercent,
    deadline: row.deadline ? dateToIso(row.deadline) : null,
    status: row.status,
    groups: row.groups.map((g) => g.group),
    questionCount: row.questions.length,
    totalPoints: row.questions.reduce((s, q) => s + q.points, 0),
    attemptCount: row.attempts.length,
    accuracy: avg(row.attempts.map((a) => decimalToNumber(a.percent))),
    createdAt: row.createdAt.toISOString(),
  };
}

const attemptInclude = {
  test: { select: { name: true, subject: true, passPercent: true } },
  student: { select: { fullName: true } },
  group: { select: { name: true } },
} satisfies Prisma.TestAttemptInclude;

function attemptToDto(
  row: Prisma.TestAttemptGetPayload<{ include: typeof attemptInclude }>,
): TestAttemptDto {
  const percent = decimalToNumber(row.percent);
  return {
    id: row.id,
    testId: row.testId,
    testName: row.test.name,
    subject: row.test.subject,
    studentId: row.studentId,
    studentName: row.student.fullName,
    groupName: row.group?.name ?? null,
    score: row.score,
    maxScore: row.maxScore,
    percent,
    passed: percent >= row.test.passPercent,
    durationSeconds: row.durationSeconds,
    submittedAt: row.submittedAt.toISOString(),
  };
}

/** Teachers see the tests of their groups and the ones they wrote (A-81). */
function testScope(actor: Actor): Prisma.TestWhereInput {
  if (!ownGroupsOnly(actor)) return {};
  return {
    OR: [{ createdById: actor.userId }, { groups: { some: { group: groupScope(actor) } } }],
  };
}

export async function listTests(
  actor: Actor,
  filters: TestFilters,
  db: DbClient = prisma,
): Promise<TestListDto> {
  authorize(actor, "tests.view");
  const organizationId = await getOrganizationId(db);
  const where: Prisma.TestWhereInput = {
    organizationId,
    ...testScope(actor),
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.subject ? { subject: filters.subject } : {}),
    ...(filters.groupId ? { groups: { some: { groupId: filters.groupId } } } : {}),
  };
  const rows = await db.test.findMany({
    where,
    include,
    orderBy: filters.recent ? [{ createdAt: "desc" }] : [{ status: "asc" }, { name: "asc" }],
    take: 500,
  });
  const items = rows.map(toDto);
  const percents = rows.flatMap((r) => r.attempts.map((a) => decimalToNumber(a.percent)));
  return {
    items,
    kpis: {
      total: items.length,
      active: items.filter((t) => t.status === "ACTIVE").length,
      attempts: percents.length,
      accuracy: avg(percents),
    },
  };
}

async function findTestInScope(db: DbClient, actor: Actor, id: string) {
  const organizationId = await getOrganizationId(db);
  return mustFind(
    db.test.findFirst({
      where: { id, organizationId, ...testScope(actor) },
      include: {
        ...include,
        questions: {
          include: { question: true },
          orderBy: { sortOrder: "asc" },
        },
      },
    }),
    "errors.testNotFound",
  );
}

export async function getTest(
  actor: Actor,
  id: string,
  db: DbClient = prisma,
): Promise<TestDetailDto> {
  authorize(actor, "tests.view");
  const row = await findTestInScope(db, actor, id);
  const groupIds = row.groups.map((g) => g.groupId);
  const [attempts, members] = await Promise.all([
    db.testAttempt.findMany({
      where: { testId: id },
      include: attemptInclude,
      orderBy: { submittedAt: "desc" },
    }),
    db.groupMembership.findMany({
      where: {
        groupId: { in: groupIds },
        status: { notIn: ["ARCHIVED", "GRADUATED"] },
        group: groupScope(actor),
      },
      select: {
        studentId: true,
        groupId: true,
        student: { select: { fullName: true } },
        group: { select: { name: true } },
      },
      orderBy: { student: { fullName: "asc" } },
    }),
  ]);
  return {
    ...toDto({ ...row, questions: row.questions.map((q) => ({ points: q.points })) }),
    questions: row.questions.map((q) => ({
      questionId: q.questionId,
      subject: q.question.subject,
      topic: q.question.topic,
      text: q.question.text,
      options: optionsOf(q.question.options),
      correctIndex: q.question.correctIndex,
      points: q.points,
    })),
    attempts: attempts.map(attemptToDto),
    candidates: members.map((m) => ({
      studentId: m.studentId,
      fullName: m.student.fullName,
      groupId: m.groupId,
      groupName: m.group.name,
    })),
  };
}

export async function getTestOptions(actor: Actor, db: DbClient = prisma): Promise<TestOptions> {
  authorize(actor, "tests.view");
  const organizationId = await getOrganizationId(db);
  const [groups, questions] = await Promise.all([
    db.group.findMany({
      where: { ...groupScope(actor), status: { not: "ARCHIVED" } },
      select: { id: true, name: true, branchId: true },
      orderBy: { name: "asc" },
    }),
    db.questionBankItem.findMany({
      where: { organizationId },
      select: { id: true, subject: true, topic: true, text: true },
      orderBy: [{ subject: "asc" }, { topic: "asc" }, { createdAt: "asc" }],
    }),
  ]);
  return { groups, questions, subjects: [...new Set(questions.map((q) => q.subject))] };
}

async function checkGroupsAndQuestions(
  db: DbClient,
  actor: Actor,
  organizationId: string,
  input: TestInput,
): Promise<void> {
  if (input.groupIds.length > 0) {
    const visible = await db.group.count({
      where: { id: { in: input.groupIds }, ...groupScope(actor) },
    });
    if (visible !== new Set(input.groupIds).size) {
      throw AppError.validation({ groupIds: ["validation.groupUnknown"] });
    }
  }
  if (input.questions.length > 0) {
    const ids = input.questions.map((q) => q.questionId);
    const found = await db.questionBankItem.count({ where: { id: { in: ids }, organizationId } });
    if (found !== ids.length)
      throw AppError.validation({ questions: ["validation.questionUnknown"] });
  }
}

export async function createTest(
  actor: Actor,
  input: TestInput,
  db: DbClient = prisma,
): Promise<TestDto> {
  authorize(actor, "tests.create");
  const organizationId = await getOrganizationId(db);
  await checkGroupsAndQuestions(db, actor, organizationId, input);
  const id = await db.$transaction(async (tx) => {
    const row = await tx.test.create({
      data: {
        organizationId,
        name: input.name,
        subject: input.subject,
        timeLimitMinutes: input.timeLimitMinutes ?? null,
        passPercent: input.passPercent,
        deadline: input.deadline ? isoToDate(input.deadline) : null,
        status: input.status,
        createdById: actor.userId,
        groups: { create: input.groupIds.map((groupId) => ({ groupId })) },
        questions: {
          create: input.questions.map((q, i) => ({
            questionId: q.questionId,
            points: q.points,
            sortOrder: i,
          })),
        },
      },
    });
    await recordAudit(tx, actor, {
      action: "test.create",
      entity: "Test",
      entityId: row.id,
      after: input,
    });
    return row.id;
  });
  return getTest(actor, id, db);
}

export async function updateTest(
  actor: Actor,
  id: string,
  input: TestInput,
  db: DbClient = prisma,
): Promise<TestDto> {
  authorize(actor, "tests.update");
  const organizationId = await getOrganizationId(db);
  const before = await findTestInScope(db, actor, id);
  await checkGroupsAndQuestions(db, actor, organizationId, input);
  const hasAttempts = before.attempts.length > 0;
  const sameQuestions =
    before.questions.length === input.questions.length &&
    before.questions.every(
      (q, i) =>
        q.questionId === input.questions[i]?.questionId && q.points === input.questions[i]?.points,
    );
  // Submitted results are scored against the questions; keep them stable (A-82).
  if (hasAttempts && !sameQuestions) throw AppError.conflict("errors.testHasAttempts");
  await db.$transaction(async (tx) => {
    await tx.test.update({
      where: { id },
      data: {
        name: input.name,
        subject: input.subject,
        timeLimitMinutes: input.timeLimitMinutes ?? null,
        passPercent: input.passPercent,
        deadline: input.deadline ? isoToDate(input.deadline) : null,
        status: input.status,
        groups: {
          deleteMany: { groupId: { notIn: input.groupIds } },
          upsert: input.groupIds.map((groupId) => ({
            where: { testId_groupId: { testId: id, groupId } },
            update: {},
            create: { groupId },
          })),
        },
        ...(sameQuestions
          ? {}
          : {
              questions: {
                deleteMany: {},
                create: input.questions.map((q, i) => ({
                  questionId: q.questionId,
                  points: q.points,
                  sortOrder: i,
                })),
              },
            }),
      },
    });
    await recordAudit(tx, actor, {
      action: "test.update",
      entity: "Test",
      entityId: id,
      before: { name: before.name, status: before.status },
      after: input,
    });
  });
  return getTest(actor, id, db);
}

export async function setTestStatus(
  actor: Actor,
  id: string,
  status: TestStatus,
  db: DbClient = prisma,
): Promise<TestDto> {
  authorize(actor, "tests.update");
  const before = await findTestInScope(db, actor, id);
  if (status === "ACTIVE" && before.questions.length === 0) {
    throw AppError.validation({ questions: ["validation.noQuestions"] });
  }
  await db.$transaction(async (tx) => {
    await tx.test.update({ where: { id }, data: { status } });
    await recordAudit(tx, actor, {
      action: "test.status",
      entity: "Test",
      entityId: id,
      before: { status: before.status },
      after: { status },
    });
  });
  return getTest(actor, id, db);
}

export async function deleteTest(actor: Actor, id: string, db: DbClient = prisma): Promise<void> {
  authorize(actor, "tests.delete");
  const before = await findTestInScope(db, actor, id);
  if (before.attempts.length > 0) throw AppError.conflict("errors.testHasAttempts");
  await db.$transaction(async (tx) => {
    await tx.test.delete({ where: { id } });
    await recordAudit(tx, actor, {
      action: "test.delete",
      entity: "Test",
      entityId: id,
      before: { name: before.name },
    });
  });
}

/** Group → TEST tab. */
export async function listGroupTests(
  actor: Actor,
  groupId: string,
  db: DbClient = prisma,
): Promise<TestDto[]> {
  authorize(actor, "tests.view");
  await findGroupInScope(db, actor, groupId, {});
  const rows = await db.test.findMany({
    where: { groups: { some: { groupId } } },
    include,
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });
  return rows.map(toDto);
}

/** Staff enters a student's answers; the score follows the bank's correct options (A-82). */
export async function recordAttempt(
  actor: Actor,
  testId: string,
  input: TestAttemptInput,
  db: DbClient = prisma,
): Promise<TestAttemptDto> {
  authorize(actor, "tests.update");
  const test = await findTestInScope(db, actor, testId);
  if (test.status !== "ACTIVE") throw AppError.conflict("errors.testNotActive");
  const groupIds = test.groups.map((g) => g.groupId);
  const membership = await db.groupMembership.findFirst({
    where: {
      studentId: input.studentId,
      status: { notIn: ["ARCHIVED", "GRADUATED"] },
      groupId: input.groupId ? input.groupId : { in: groupIds },
      group: groupScope(actor),
    },
    select: { groupId: true },
  });
  if (!membership || (input.groupId && !groupIds.includes(input.groupId))) {
    throw AppError.validation({ studentId: ["validation.notMember"] });
  }
  let score = 0;
  let maxScore = 0;
  for (const q of test.questions) {
    maxScore += q.points;
    if (input.answers[q.questionId] === q.question.correctIndex) score += q.points;
  }
  const percent = maxScore === 0 ? 0 : Math.round((score / maxScore) * 10000) / 100;
  return db.$transaction(async (tx) => {
    const row = await tx.testAttempt.create({
      data: {
        testId,
        studentId: input.studentId,
        groupId: membership.groupId,
        answers: input.answers as unknown as Prisma.InputJsonValue,
        score,
        maxScore,
        percent,
        durationSeconds: input.durationSeconds ?? null,
        enteredById: actor.userId,
      },
      include: attemptInclude,
    });
    if (percent >= test.passPercent) {
      await awardAutoCoins(tx, {
        event: "TEST_RESULT",
        studentId: input.studentId,
        groupId: membership.groupId,
        refKey: `test:${row.id}`,
      });
    }
    await recordAudit(tx, actor, {
      action: "test.attempt",
      entity: "Test",
      entityId: testId,
      after: { studentId: input.studentId, score, maxScore },
    });
    return attemptToDto(row);
  });
}

type AttemptWithQuestions = Prisma.TestAttemptGetPayload<{
  include: {
    test: {
      select: {
        name: true;
        subject: true;
        passPercent: true;
        questions: {
          include: { question: { select: { subject: true; topic: true; correctIndex: true } } };
        };
      };
    };
  };
}>;

function topicStats(attempts: AttemptWithQuestions[]): TopicStatDto[] {
  const map = new Map<string, TopicStatDto>();
  for (const a of attempts) {
    const answers = (a.answers ?? {}) as Record<string, number>;
    for (const q of a.test.questions) {
      const key = `${q.question.subject}\u0000${q.question.topic}`;
      const stat =
        map.get(key) ??
        map
          .set(key, {
            subject: q.question.subject,
            topic: q.question.topic,
            questions: 0,
            answered: 0,
            correct: 0,
            accuracy: null,
          })
          .get(key)!;
      stat.questions += 1;
      if (q.questionId in answers) {
        stat.answered += 1;
        if (answers[q.questionId] === q.question.correctIndex) stat.correct += 1;
      }
    }
  }
  return [...map.values()]
    .map((s) => ({
      ...s,
      accuracy: s.answered === 0 ? null : Math.round((s.correct / s.answered) * 100),
    }))
    .sort((a, b) => (a.accuracy ?? 101) - (b.accuracy ?? 101) || a.topic.localeCompare(b.topic));
}

function attemptWindow(filters: KnowledgeFilters): Prisma.DateTimeFilter | undefined {
  if (!filters.from && !filters.to) return undefined;
  return {
    ...(filters.from ? { gte: isoToDate(filters.from) } : {}),
    ...(filters.to ? { lt: new Date(isoToDate(filters.to).getTime() + 86_400_000) } : {}),
  };
}

const knowledgeInclude = {
  test: {
    select: {
      name: true,
      subject: true,
      passPercent: true,
      questions: {
        include: { question: { select: { subject: true, topic: true, correctIndex: true } } },
      },
    },
  },
} satisfies Prisma.TestAttemptInclude;

/** Group → BILIM TAHLILI: accuracy per topic across the group's attempts. */
export async function getGroupKnowledge(
  actor: Actor,
  groupId: string,
  filters: KnowledgeFilters,
  db: DbClient = prisma,
): Promise<GroupKnowledgeDto> {
  authorize(actor, "tests.view");
  await findGroupInScope(db, actor, groupId, {});
  const [attempts, tests] = await Promise.all([
    db.testAttempt.findMany({
      where: {
        groupId,
        ...(filters.testId ? { testId: filters.testId } : {}),
        ...(filters.subject ? { test: { subject: filters.subject } } : {}),
        ...(attemptWindow(filters) ? { submittedAt: attemptWindow(filters) } : {}),
      },
      include: knowledgeInclude,
    }),
    db.test.findMany({
      where: { groups: { some: { groupId } } },
      select: { id: true, name: true, subject: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return {
    topics: topicStats(attempts),
    tests,
    subjects: [...new Set(tests.map((t) => t.subject))],
    attempts: attempts.length,
    students: new Set(attempts.map((a) => a.studentId)).size,
  };
}

function thinkingLevel(average: number | null): ThinkingLevel | null {
  if (average === null) return null;
  if (average < 50) return "LOW";
  if (average < 80) return "MEDIUM";
  return "HIGH";
}

/** Student → TEST NATIJALARI. */
export async function getStudentTestResults(
  actor: Actor,
  studentId: string,
  filters: KnowledgeFilters,
  db: DbClient = prisma,
): Promise<StudentTestResultsDto> {
  authorize(actor, "students.view");
  const student = await db.student.findFirst({
    where: { id: studentId, ...studentScope(actor) },
    select: { id: true },
  });
  if (!student) throw AppError.notFound("errors.studentNotFound");
  const all = await db.testAttempt.findMany({
    where: { studentId },
    include: {
      ...knowledgeInclude,
      student: { select: { fullName: true } },
      group: { select: { name: true } },
    },
    orderBy: { submittedAt: "asc" },
  });
  const window = attemptWindow(filters);
  const attempts = all.filter(
    (a) =>
      (!filters.testId || a.testId === filters.testId) &&
      (!filters.subject || a.test.subject === filters.subject) &&
      (!window?.gte || a.submittedAt >= (window.gte as Date)) &&
      (!window?.lt || a.submittedAt < (window.lt as Date)),
  );
  const percents = attempts.map((a) => decimalToNumber(a.percent));
  const durations = attempts.map((a) => a.durationSeconds).filter((d): d is number => d !== null);
  const average = avg(percents);
  const topics = topicStats(attempts);
  return {
    kpis: {
      total: attempts.length,
      average,
      best: percents.length ? Math.max(...percents) : null,
      worst: percents.length ? Math.min(...percents) : null,
      averageSeconds: durations.length
        ? Math.round(durations.reduce((s, d) => s + d, 0) / durations.length)
        : null,
    },
    level: thinkingLevel(average),
    problemTopics: topics.filter((t) => t.accuracy !== null && t.accuracy < 50),
    strongTopics: topics.filter((t) => t.accuracy !== null && t.accuracy >= 80).reverse(),
    dynamics: attempts.map((a) => ({
      date: a.submittedAt.toISOString(),
      percent: decimalToNumber(a.percent),
      testName: a.test.name,
    })),
    attempts: [...attempts].reverse().map((a) => attemptToDto(a)),
    subjects: [...new Set(all.map((a) => a.test.subject))].sort(),
    tests: [...new Map(all.map((a) => [a.testId, { id: a.testId, name: a.test.name }])).values()],
  };
}
