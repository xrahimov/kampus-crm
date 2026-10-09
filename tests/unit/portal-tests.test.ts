import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/rbac/default-roles";
import { prisma } from "@/server/db/prisma";
import type { Actor } from "@/server/rbac/authorize";
import { createGroup } from "@/server/services/groups/groups.service";
import { addMember } from "@/server/services/groups/memberships.service";
import { createBranch } from "@/server/services/settings/branches.service";
import { createCourse } from "@/server/services/settings/courses.service";
import {
  listPortalTests,
  scoreAnswers,
  startPortalTest,
  submitPortalAttempt,
} from "@/server/services/tests/portal-tests.service";
import { createQuestion } from "@/server/services/tests/questions.service";
import { createTest, getTest } from "@/server/services/tests/tests.service";
import { DEMO_ORG_ID, demoBranchIds } from "./support/tenant";

const RUN = String(Date.now()).slice(-7);
const TAG = `pt${RUN}`;
const phone = (n: number) => `+99897${RUN}${String(n).padStart(2, "0")}`;

const actor = (fullName: string, roles: string[], permissions: string[]): Actor => ({
  userId: "",
  fullName,
  roles,
  permissions,
  organizationId: DEMO_ORG_ID,
  branchIds: [],
  activeBranchId: null,
});
const ceo = actor("CEO", ["CEO"], ["*"]);
const teacher = actor("Teacher", ["TEACHER"], [...DEFAULT_ROLE_PERMISSIONS.TEACHER]);

let branchA: string;
let groupA: string;
let groupB: string;
let tokenA: string;
let tokenOther: string;
let questionA: string;
let questionB: string;

beforeAll(async () => {
  const teacherRole = await prisma.role.findUniqueOrThrow({ where: { code: "TEACHER" } });
  for (const [a, n] of [
    [ceo, 1],
    [teacher, 2],
  ] as const) {
    const user = await prisma.user.create({
      data: {
        phone: phone(n),
        fullName: `${TAG} ${a.fullName}`,
        passwordHash: "x",
        organizationId: DEMO_ORG_ID,
      },
    });
    a.userId = user.id;
  }
  await prisma.userRole.create({ data: { userId: teacher.userId, roleId: teacherRole.id } });
  branchA = (await createBranch(ceo, { name: `${TAG} A`, isActive: true })).id;
  ceo.branchIds = await demoBranchIds();
  ceo.activeBranchId = branchA;
  await prisma.userBranch.create({ data: { userId: teacher.userId, branchId: branchA } });
  teacher.branchIds = [branchA];
  const courseA = (
    await createCourse(ceo, {
      branchId: branchA,
      name: `${TAG} English`,
      description: undefined,
      price: 500_000,
      durationMonths: 2,
      gradingSystemId: null,
      color: null,
    })
  ).id;
  // The same teacher runs both groups, so their slots must not clash.
  const group = (name: string, startTime: string, endTime: string) =>
    createGroup(ceo, {
      branchId: branchA,
      name,
      courseId: courseA,
      gradingSystemId: null,
      weekdayPattern: "EVEN",
      slots: [2, 4, 6].map((weekday) => ({
        weekday,
        startTime,
        endTime,
        roomId: null,
      })),
      teachers: [{ userId: teacher.userId, role: "MAIN", shareType: "PERCENT", shareValue: 40 }],
      startDate: "2026-09-01",
      endDate: null,
      status: "ACTIVE",
    });
  groupA = (await group(`${TAG} GE-A`, "10:00", "11:30")).id;
  groupB = (await group(`${TAG} GE-B`, "14:00", "15:30")).id;
  const member = async (groupId: string, name: string, n: number) => {
    const m = await addMember(ceo, groupId, {
      newStudent: { fullName: `${TAG} ${name}`, phone: phone(n) },
      joinedAt: "2026-09-01",
      customPrice: null,
      note: null,
      status: "ACTIVE",
    });
    const token = `${TAG}${name}tokentokentoken`.padEnd(24, "x");
    await prisma.groupMembership.update({ where: { id: m.id }, data: { videoToken: token } });
    return token;
  };
  tokenA = await member(groupA, "Aziz", 10);
  tokenOther = await member(groupB, "Bobur", 11);
  questionA = (
    await createQuestion(teacher, {
      subject: `${TAG} English`,
      topic: `${TAG} Articles`,
      text: "___ sun rises in the east.",
      options: ["A", "An", "The"],
      correctIndex: 2,
    })
  ).id;
  questionB = (
    await createQuestion(teacher, {
      subject: `${TAG} English`,
      topic: `${TAG} Present Simple`,
      text: "She ___ to school.",
      options: ["go", "goes"],
      correctIndex: 1,
    })
  ).id;
});

afterAll(async () => {
  const students = await prisma.student.findMany({ where: { branchId: branchA } });
  const groups = await prisma.group.findMany({ where: { branchId: branchA } });
  await prisma.test.deleteMany({ where: { name: { startsWith: TAG } } });
  await prisma.questionBankItem.deleteMany({ where: { topic: { startsWith: TAG } } });
  await prisma.auditLog.deleteMany({
    where: {
      OR: [{ branchId: branchA }, { entityId: { in: [...students, ...groups].map((x) => x.id) } }],
    },
  });
  await prisma.group.deleteMany({ where: { branchId: branchA } });
  await prisma.student.deleteMany({ where: { branchId: branchA } });
  await prisma.course.deleteMany({ where: { branchId: branchA } });
  const users = await prisma.user.findMany({ where: { phone: { startsWith: `+99897${RUN}` } } });
  const ids = users.map((u) => u.id);
  await prisma.auditLog.deleteMany({ where: { actorId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.branch.deleteMany({ where: { id: branchA } });
  await prisma.$disconnect();
});

const makeTest = (
  name: string,
  status: "DRAFT" | "ACTIVE",
  extra: Partial<Parameters<typeof createTest>[1]> = {},
) =>
  createTest(teacher, {
    name: `${TAG} ${name}`,
    subject: `${TAG} English`,
    timeLimitMinutes: 20,
    passPercent: 60,
    deadline: null,
    status,
    groupIds: [groupA],
    questions: [
      { questionId: questionA, points: 2 },
      { questionId: questionB, points: 1 },
    ],
    ...extra,
  });

describe("tests on the student's page", () => {
  it("scores like the teacher's entry", () => {
    const questions = [
      { questionId: "a", points: 2, question: { correctIndex: 2 } },
      { questionId: "b", points: 1, question: { correctIndex: 1 } },
    ];
    expect(scoreAnswers(questions, { a: 2, b: 0 })).toEqual({
      score: 2,
      maxScore: 3,
      percent: 66.67,
    });
    expect(scoreAnswers(questions, {})).toEqual({ score: 0, maxScore: 3, percent: 0 });
    expect(scoreAnswers([], {})).toEqual({ score: 0, maxScore: 0, percent: 0 });
  });

  it("lists only active tests of the student's own group, hides the answers and scores a hand-in once", async () => {
    await makeTest("Draft", "DRAFT");
    const active = await makeTest("Unit 1", "ACTIVE");

    expect(await listPortalTests("not-a-real-token-at-all-x")).toBeNull();
    const before = await listPortalTests(tokenA);
    expect(before?.map((t) => t.name)).toEqual([`${TAG} Unit 1`]);
    expect(before?.[0]).toMatchObject({
      questionCount: 2,
      totalPoints: 3,
      timeLimitMinutes: 20,
      passPercent: 60,
      available: true,
      startedAt: null,
      attempt: null,
    });
    // Another group's student sees nothing and cannot open it.
    expect(await listPortalTests(tokenOther)).toEqual([]);
    await expect(startPortalTest(tokenOther, active.id)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    // Handing in before opening is refused: the clock has not started.
    await expect(submitPortalAttempt(tokenA, active.id, { answers: {} })).rejects.toMatchObject({
      code: "CONFLICT",
      message: "errors.testNotStarted",
    });

    const run = await startPortalTest(tokenA, active.id);
    expect(run.questions.map((q) => q.id)).toEqual([questionA, questionB]);
    expect(run.questions[0]).toEqual({
      id: questionA,
      text: "___ sun rises in the east.",
      options: ["A", "An", "The"],
      points: 2,
    });
    expect(JSON.stringify(run)).not.toContain("correctIndex");
    expect(run.secondsLeft).toBeGreaterThan(19 * 60);
    // Opening again continues the same clock.
    const again = await startPortalTest(tokenA, active.id);
    expect(again.startedAt).toBe(run.startedAt);
    const listed = await listPortalTests(tokenA);
    expect(listed?.[0]?.startedAt).toBe(run.startedAt);

    const result = await submitPortalAttempt(tokenA, active.id, {
      answers: { [questionA]: 2, [questionB]: 0 },
    });
    expect(result).toMatchObject({ score: 2, maxScore: 3, percent: 66.67, passed: true });
    const detail = await getTest(teacher, active.id);
    expect(detail.attempts).toHaveLength(1);
    expect(detail.attempts[0]).toMatchObject({ score: 2, maxScore: 3 });
    const row = await prisma.testAttempt.findFirstOrThrow({ where: { testId: active.id } });
    expect(row.enteredById).toBeNull();
    expect(row.durationSeconds).toBeGreaterThanOrEqual(0);
    const coins = await prisma.coinTransaction.findUnique({ where: { refKey: `test:${row.id}` } });
    expect(result.coins).toBe(coins?.amount ?? 0);
    const audit = await prisma.auditLog.findFirst({
      where: { action: "test.portalAttempt", entityId: active.id },
    });
    expect(audit?.actorId).toBeNull();

    // Once only; the list now shows the result instead of the Start button.
    await expect(
      submitPortalAttempt(tokenA, active.id, { answers: { [questionA]: 2 } }),
    ).rejects.toMatchObject({ code: "CONFLICT", message: "errors.testAttempted" });
    const after = await listPortalTests(tokenA);
    expect(after?.[0]).toMatchObject({
      available: false,
      attempt: { score: 2, maxScore: 3, percent: 66.67, passed: true },
    });
  });

  it("refuses a test past its deadline or its time limit", async () => {
    const late = await makeTest("Late", "ACTIVE", { deadline: "2026-01-01" });
    expect((await listPortalTests(tokenA))?.some((t) => t.id === late.id)).toBe(false);
    await expect(startPortalTest(tokenA, late.id)).rejects.toMatchObject({
      code: "CONFLICT",
      message: "errors.testNotAvailable",
    });

    const timed = await makeTest("Timed", "ACTIVE", { timeLimitMinutes: 1 });
    await startPortalTest(tokenA, timed.id);
    const membership = await prisma.groupMembership.findUniqueOrThrow({
      where: { videoToken: tokenA },
      select: { id: true },
    });
    await prisma.portalTestStart.update({
      where: { testId_membershipId: { testId: timed.id, membershipId: membership.id } },
      data: { startedAt: new Date(Date.now() - 3 * 60 * 1000) },
    });
    await expect(startPortalTest(tokenA, timed.id)).rejects.toMatchObject({
      message: "errors.testTimeUp",
    });
    await expect(submitPortalAttempt(tokenA, timed.id, { answers: {} })).rejects.toMatchObject({
      message: "errors.testTimeUp",
    });
    const listed = (await listPortalTests(tokenA))?.find((t) => t.id === timed.id);
    expect(listed).toMatchObject({ available: false, secondsLeft: 0, attempt: null });
  });
});
