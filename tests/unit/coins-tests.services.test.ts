/**
 * Coins, marketplace, question bank and tests (Phase 10) against the real database.
 * Rows carry a run-specific tag and are removed at the end.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/rbac/default-roles";
import { giveCoinsSchema } from "@/lib/validation/coins";
import { questionSchema, testSchema } from "@/lib/validation/tests";
import { prisma } from "@/server/db/prisma";
import type { Actor } from "@/server/rbac/authorize";
import {
  createCoinReason,
  deleteCoinReason,
  getCoinSettings,
  getCoinsReport,
  giveCoins,
  listCoinReasons,
  listGroupCoins,
  listStudentCoins,
  studentBalance,
  updateCoinReason,
  updateCoinSettings,
} from "@/server/services/coins/coins.service";
import {
  createProduct,
  createProductCategory,
  createPurchaseRequest,
  decidePurchaseRequest,
  deleteProductCategory,
  listProducts,
  listPurchaseRequests,
} from "@/server/services/coins/marketplace.service";
import { createGroup } from "@/server/services/groups/groups.service";
import { markAttendance } from "@/server/services/groups/lessons.service";
import { addMember } from "@/server/services/groups/memberships.service";
import { createBranch } from "@/server/services/settings/branches.service";
import { createCourse } from "@/server/services/settings/courses.service";
import {
  createQuestion,
  deleteQuestion,
  listQuestions,
  updateQuestion,
} from "@/server/services/tests/questions.service";
import {
  createTest,
  deleteTest,
  getGroupKnowledge,
  getStudentTestResults,
  getTest,
  listGroupTests,
  listTests,
  recordAttempt,
  setTestStatus,
  updateTest,
} from "@/server/services/tests/tests.service";

const RUN = String(Date.now() % 100_000).padStart(5, "0");
const TAG = `c${RUN}`;
const phone = (n: number) => `+99896${RUN}${String(n).padStart(2, "0")}`;

const actor = (fullName: string, roles: string[], permissions: string[]): Actor => ({
  userId: "",
  fullName,
  roles,
  permissions,
  branchIds: [],
  activeBranchId: null,
});
const ceo = actor("CEO", ["CEO"], ["*"]);
const teacher = actor("Teacher", ["TEACHER"], [...DEFAULT_ROLE_PERMISSIONS.TEACHER]);
const outsider = actor("Outsider", ["TEACHER"], [...DEFAULT_ROLE_PERMISSIONS.TEACHER]);

let branchA: string;
let groupA: string;
let groupB: string;
let studentOne: string;
let studentTwo: string;
let membershipOne: string;
let reasonId: string;
let settingsBefore: boolean | null = null;
let questionA: string;
let questionB: string;
let testId: string;

beforeAll(async () => {
  const teacherRole = await prisma.role.findUniqueOrThrow({ where: { code: "TEACHER" } });
  for (const [a, n] of [
    [ceo, 1],
    [teacher, 2],
    [outsider, 3],
  ] as const) {
    const user = await prisma.user.create({
      data: { phone: phone(n), fullName: `${TAG} ${a.fullName}`, passwordHash: "x" },
    });
    a.userId = user.id;
  }
  await prisma.userRole.createMany({
    data: [teacher, outsider].map((a) => ({ userId: a.userId, roleId: teacherRole.id })),
  });
  branchA = (await createBranch(ceo, { name: `${TAG} A`, isActive: true })).id;
  ceo.activeBranchId = branchA;
  await prisma.userBranch.createMany({
    data: [teacher, outsider].map((a) => ({ userId: a.userId, branchId: branchA })),
  });
  teacher.branchIds = [branchA];
  outsider.branchIds = [branchA];
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
  const group = (teacherId: string | null, name: string) =>
    createGroup(ceo, {
      branchId: branchA,
      name,
      courseId: courseA,
      gradingSystemId: null,
      weekdayPattern: "EVEN",
      slots: [2, 4, 6].map((weekday) => ({
        weekday,
        startTime: "10:00",
        endTime: "11:30",
        roomId: null,
      })),
      teachers: teacherId
        ? [{ userId: teacherId, role: "MAIN", shareType: "PERCENT", shareValue: 40 }]
        : [],
      startDate: "2026-09-01",
      endDate: null,
      status: "ACTIVE",
    });
  groupA = (await group(teacher.userId, `${TAG} GE-A`)).id;
  groupB = (await group(outsider.userId, `${TAG} GE-B`)).id;
  const member = (name: string, n: number) =>
    addMember(ceo, groupA, {
      newStudent: { fullName: `${TAG} ${name}`, phone: phone(n) },
      joinedAt: "2026-09-01",
      customPrice: null,
      note: null,
      status: "ACTIVE",
    });
  const one = await member("Aziz", 10);
  const two = await member("Bobur", 11);
  studentOne = one.studentId;
  studentTwo = two.studentId;
  membershipOne = one.id;
  settingsBefore = (await prisma.orgSettings.findFirst())?.autoCoins ?? null;
});

afterAll(async () => {
  if (settingsBefore !== null) {
    await prisma.orgSettings.updateMany({ data: { autoCoins: settingsBefore } });
  }
  const students = await prisma.student.findMany({ where: { branchId: branchA } });
  const groups = await prisma.group.findMany({ where: { branchId: branchA } });
  await prisma.test.deleteMany({ where: { name: { startsWith: TAG } } });
  await prisma.questionBankItem.deleteMany({ where: { topic: { startsWith: TAG } } });
  await prisma.purchaseRequest.deleteMany({
    where: { studentId: { in: students.map((s) => s.id) } },
  });
  await prisma.product.deleteMany({ where: { name: { startsWith: TAG } } });
  await prisma.productCategory.deleteMany({ where: { name: { startsWith: TAG } } });
  await prisma.coinReason.deleteMany({ where: { name: { startsWith: TAG } } });
  await prisma.auditLog.deleteMany({
    where: {
      OR: [{ branchId: branchA }, { entityId: { in: [...students, ...groups].map((x) => x.id) } }],
    },
  });
  await prisma.group.deleteMany({ where: { branchId: branchA } });
  await prisma.student.deleteMany({ where: { branchId: branchA } });
  await prisma.course.deleteMany({ where: { branchId: branchA } });
  const users = await prisma.user.findMany({ where: { phone: { startsWith: `+99896${RUN}` } } });
  const ids = users.map((u) => u.id);
  await prisma.auditLog.deleteMany({ where: { actorId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.branch.deleteMany({ where: { id: branchA } });
  await prisma.$disconnect();
});

describe("validation", () => {
  it("rejects a question whose correct index is outside its options", () => {
    const bad = questionSchema.safeParse({
      subject: "English",
      topic: "T",
      text: "Q?",
      options: ["a", "b"],
      correctIndex: 2,
    });
    expect(bad.success).toBe(false);
    const good = questionSchema.safeParse({
      subject: "English",
      topic: "T",
      text: "Q?",
      options: ["a", "b"],
      correctIndex: "1",
    });
    expect(good.success && good.data.correctIndex).toBe(1);
  });

  it("rejects an active test without questions and blank coin amounts", () => {
    const base = { name: "T", subject: "S", passPercent: "50" };
    expect(testSchema.safeParse({ ...base, status: "ACTIVE" }).success).toBe(false);
    expect(testSchema.safeParse({ ...base, status: "DRAFT" }).success).toBe(true);
    expect(giveCoinsSchema.safeParse({ studentId: "s", reasonId: "r", amount: "" }).success).toBe(
      false,
    );
  });
});

describe("coin settings and reasons", () => {
  it("creates the four reference rules on first read and saves the switch", async () => {
    const settings = await getCoinSettings(ceo);
    expect(settings.rules.map((r) => r.event)).toEqual([
      "ATTENDANCE",
      "HOMEWORK",
      "TEST_RESULT",
      "BIRTHDAY",
    ]);
    const updated = await updateCoinSettings(ceo, {
      autoCoins: true,
      rules: settings.rules.map((r) => (r.event === "ATTENDANCE" ? { ...r, amount: 5 } : r)),
    });
    expect(updated.autoCoins).toBe(true);
    expect(updated.rules.find((r) => r.event === "ATTENDANCE")?.amount).toBe(5);
  });

  it("manages manual reasons and refuses to delete a used one", async () => {
    const reason = await createCoinReason(ceo, {
      name: `${TAG} Faollik`,
      maxCoins: 10,
      isActive: true,
    });
    reasonId = reason.id;
    await expect(
      createCoinReason(ceo, { name: `${TAG} Faollik`, maxCoins: 5, isActive: true }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    const renamed = await updateCoinReason(ceo, reason.id, {
      name: `${TAG} Faollik`,
      maxCoins: 10,
      isActive: true,
    });
    expect(renamed.maxCoins).toBe(10);
    expect(
      (await listCoinReasons(teacher, { activeOnly: true })).some((r) => r.id === reason.id),
    ).toBe(true);
    await expect(listCoinReasons(outsider)).resolves.toBeDefined();
    await expect(
      updateCoinReason(teacher, reason.id, { name: "x", maxCoins: 1, isActive: true }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const spare = await createCoinReason(ceo, {
      name: `${TAG} Spare`,
      maxCoins: 3,
      isActive: true,
    });
    await deleteCoinReason(ceo, spare.id);
  });
});

describe("giving coins", () => {
  it("caps teachers at the reason maximum, lets managers exceed it and ranks the group", async () => {
    await expect(
      giveCoins(teacher, {
        studentId: studentOne,
        groupId: groupA,
        reasonId,
        amount: 11,
        comment: null,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    const tx = await giveCoins(teacher, {
      studentId: studentOne,
      groupId: groupA,
      reasonId,
      amount: 8,
      comment: "Great",
    });
    expect(tx.amount).toBe(8);
    expect(tx.reasonName).toBe(`${TAG} Faollik`);
    await giveCoins(ceo, {
      studentId: studentTwo,
      groupId: groupA,
      reasonId,
      amount: 15,
      comment: null,
    });
    // A teacher of another group cannot award into this one.
    await expect(
      giveCoins(outsider, {
        studentId: studentOne,
        groupId: groupA,
        reasonId,
        amount: 1,
        comment: null,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const rows = await listGroupCoins(ceo, groupA);
    expect(rows.map((r) => [r.rank, r.studentId, r.balance])).toEqual([
      [1, studentTwo, 15],
      [2, studentOne, 8],
    ]);
    expect(rows[1]?.lastComment).toBe("Great");
    const history = await listStudentCoins(ceo, studentOne);
    expect(history.balance).toBe(8);
    expect(history.items[0]?.kind).toBe("MANUAL");
    await expect(deleteCoinReason(ceo, reasonId)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("awards attendance coins once per lesson when the switch is on and takes them back", async () => {
    const lesson = await prisma.lesson.findFirstOrThrow({
      where: { groupId: groupA },
      orderBy: { date: "asc" },
    });
    await markAttendance(ceo, lesson.id, [{ membershipId: membershipOne, status: "PRESENT" }]);
    await markAttendance(ceo, lesson.id, [{ membershipId: membershipOne, status: "PRESENT" }]);
    expect(await studentBalance(prisma, studentOne)).toBe(13);
    await markAttendance(ceo, lesson.id, [{ membershipId: membershipOne, status: "ABSENT" }]);
    expect(await studentBalance(prisma, studentOne)).toBe(8);
    const settings = await getCoinSettings(ceo);
    await updateCoinSettings(ceo, { autoCoins: false, rules: settings.rules });
    await markAttendance(ceo, lesson.id, [{ membershipId: membershipOne, status: "PRESENT" }]);
    expect(await studentBalance(prisma, studentOne)).toBe(8);
    await updateCoinSettings(ceo, { autoCoins: true, rules: settings.rules });
  });

  it("builds the coins report with KPIs and a rating", async () => {
    const report = await getCoinsReport(ceo, { branchId: branchA, period: "ALL" });
    expect(report.kpis.totalGiven).toBe(23);
    expect(report.kpis.activeStudents).toBe(2);
    expect(report.rating[0]).toMatchObject({ rank: 1, studentId: studentTwo, balance: 15 });
    const monthly = await getCoinsReport(ceo, {
      branchId: branchA,
      groupId: groupA,
      period: "MONTH",
    });
    expect(monthly.rating).toHaveLength(2);
    await expect(getCoinsReport(outsider, { period: "ALL" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("marketplace", () => {
  it("files and approves a purchase, spending coins and stock", async () => {
    const category = await createProductCategory(ceo, { name: `${TAG} Kanselyariya` });
    const product = await createProduct(ceo, {
      name: `${TAG} Daftar`,
      categoryId: category.id,
      imageUrl: null,
      priceCoins: 10,
      stock: 1,
      isActive: true,
    });
    await expect(deleteProductCategory(ceo, category.id)).rejects.toMatchObject({
      code: "CONFLICT",
    });
    // Student one has 8 coins: not enough.
    await expect(
      createPurchaseRequest(ceo, { studentId: studentOne, productId: product.id }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    const request = await createPurchaseRequest(ceo, {
      studentId: studentTwo,
      productId: product.id,
    });
    expect(request.status).toBe("PENDING");
    expect(request.coins).toBe(10);
    const approved = await decidePurchaseRequest(ceo, request.id, { status: "APPROVED" });
    expect(approved.status).toBe("APPROVED");
    expect(await studentBalance(prisma, studentTwo)).toBe(5);
    const products = await listProducts(ceo);
    expect(products.find((p) => p.id === product.id)).toMatchObject({
      stock: 0,
      purchasedCount: 1,
    });
    await expect(
      decidePurchaseRequest(ceo, request.id, { status: "REJECTED" }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
    });
    // Out of stock now.
    await expect(
      createPurchaseRequest(ceo, { studentId: studentTwo, productId: product.id }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    const pending = await listPurchaseRequests(ceo, { status: "APPROVED" });
    expect(pending.some((r) => r.id === request.id)).toBe(true);
    await expect(createProductCategory(teacher, { name: `${TAG} Nope` })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("question bank and tests", () => {
  it("creates questions, builds a test, scores an attempt and awards test coins", async () => {
    const qa = await createQuestion(teacher, {
      subject: `${TAG} English`,
      topic: `${TAG} Articles`,
      text: "___ sun rises in the east.",
      options: ["A", "An", "The"],
      correctIndex: 2,
    });
    const qb = await createQuestion(teacher, {
      subject: `${TAG} English`,
      topic: `${TAG} Present Simple`,
      text: "She ___ to school.",
      options: ["go", "goes"],
      correctIndex: 1,
    });
    questionA = qa.id;
    questionB = qb.id;
    const page = await listQuestions(
      teacher,
      { page: 1, pageSize: 20, skip: 0, take: 20, sort: { field: "createdAt", direction: "desc" } },
      { subject: `${TAG} English` },
    );
    expect(page.total).toBe(2);
    await updateQuestion(teacher, qa.id, {
      subject: `${TAG} English`,
      topic: `${TAG} Articles`,
      text: "___ sun rises in the east.",
      options: ["A", "An", "The", "—"],
      correctIndex: 2,
    });

    const test = await createTest(teacher, {
      name: `${TAG} Unit 1`,
      subject: `${TAG} English`,
      timeLimitMinutes: 20,
      passPercent: 60,
      deadline: null,
      status: "DRAFT",
      groupIds: [groupA],
      questions: [
        { questionId: qa.id, points: 2 },
        { questionId: qb.id, points: 1 },
      ],
    });
    testId = test.id;
    expect(test).toMatchObject({
      questionCount: 2,
      totalPoints: 3,
      attemptCount: 0,
      accuracy: null,
    });
    // A teacher cannot give a test to a group they do not teach.
    await expect(
      createTest(teacher, {
        name: `${TAG} Nope`,
        subject: "S",
        timeLimitMinutes: null,
        deadline: null,
        passPercent: 50,
        status: "DRAFT",
        groupIds: [groupB],
        questions: [],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(deleteQuestion(ceo, qa.id)).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      recordAttempt(teacher, test.id, {
        studentId: studentOne,
        groupId: groupA,
        answers: {},
        durationSeconds: null,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await setTestStatus(teacher, test.id, "ACTIVE");

    const before = await studentBalance(prisma, studentOne);
    const attempt = await recordAttempt(teacher, test.id, {
      studentId: studentOne,
      groupId: groupA,
      answers: { [qa.id]: 2, [qb.id]: 0 },
      durationSeconds: 600,
    });
    expect(attempt).toMatchObject({ score: 2, maxScore: 3, percent: 66.67, passed: true });
    // TEST_RESULT rule (20) fires because the switch is on and the student passed.
    expect(await studentBalance(prisma, studentOne)).toBe(before + 20);
    const failing = await recordAttempt(ceo, test.id, {
      studentId: studentTwo,
      groupId: null,
      answers: { [qa.id]: 0, [qb.id]: 1 },
      durationSeconds: null,
    });
    expect(failing).toMatchObject({ score: 1, maxScore: 3, passed: false });
    await expect(
      recordAttempt(ceo, test.id, {
        studentId: studentOne,
        groupId: groupB,
        answers: {},
        durationSeconds: null,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });

    const detail = await getTest(teacher, test.id);
    expect(detail.attempts).toHaveLength(2);
    expect(detail.accuracy).toBe(50);
    expect(detail.candidates.map((c) => c.studentId).sort()).toEqual(
      [studentOne, studentTwo].sort(),
    );
    // Questions are frozen once results exist; other fields still change.
    await expect(
      updateTest(teacher, test.id, {
        name: `${TAG} Unit 1`,
        subject: `${TAG} English`,
        timeLimitMinutes: 20,
        passPercent: 60,
        deadline: null,
        status: "ACTIVE",
        groupIds: [groupA],
        questions: [{ questionId: qa.id, points: 2 }],
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    const renamed = await updateTest(teacher, test.id, {
      name: `${TAG} Unit 1 (final)`,
      subject: `${TAG} English`,
      timeLimitMinutes: 30,
      passPercent: 60,
      deadline: "2026-12-31",
      status: "ACTIVE",
      groupIds: [groupA],
      questions: [
        { questionId: qa.id, points: 2 },
        { questionId: qb.id, points: 1 },
      ],
    });
    expect(renamed.deadline).toBe("2026-12-31");
    await expect(deleteTest(ceo, test.id)).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("scopes lists to the teacher's groups and computes KPIs", async () => {
    const mine = await listTests(teacher, { recent: true });
    expect(mine.items.some((t) => t.id === testId)).toBe(true);
    expect(mine.kpis.attempts).toBeGreaterThanOrEqual(2);
    const theirs = await listTests(outsider, { recent: false });
    expect(theirs.items.some((t) => t.id === testId)).toBe(false);
    await expect(getTest(outsider, testId)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect((await listGroupTests(ceo, groupA)).map((t) => t.id)).toContain(testId);
  });

  it("analyses topics for the group and the student", async () => {
    const knowledge = await getGroupKnowledge(ceo, groupA, {});
    expect(knowledge.attempts).toBe(2);
    expect(knowledge.students).toBe(2);
    const articles = knowledge.topics.find((x) => x.topic === `${TAG} Articles`);
    const present = knowledge.topics.find((x) => x.topic === `${TAG} Present Simple`);
    expect(articles).toMatchObject({ questions: 2, answered: 2, correct: 1, accuracy: 50 });
    expect(present).toMatchObject({ accuracy: 50 });
    const filtered = await getGroupKnowledge(ceo, groupA, { subject: "nothing" });
    expect(filtered.attempts).toBe(0);

    const results = await getStudentTestResults(ceo, studentOne, {});
    expect(results.kpis).toMatchObject({
      total: 1,
      average: 66.7,
      best: 66.67,
      worst: 66.67,
      averageSeconds: 600,
    });
    expect(results.level).toBe("MEDIUM");
    expect(results.problemTopics.map((x) => x.topic)).toEqual([`${TAG} Present Simple`]);
    expect(results.strongTopics.map((x) => x.topic)).toEqual([`${TAG} Articles`]);
    expect(results.dynamics).toHaveLength(1);
    const two = await getStudentTestResults(ceo, studentTwo, {});
    expect(two.level).toBe("LOW");
    expect(questionA && questionB).toBeTruthy();
  });
});
