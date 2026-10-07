/**
 * Finance (Phase 9) against the real database: categories, the ledger,
 * the overview and plan figures, and payroll. Rows carry a run-specific
 * tag and are removed at the end.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/rbac/default-roles";
import { financeEntrySchema } from "@/lib/validation/finance";
import { prisma } from "@/server/db/prisma";
import type { Actor } from "@/server/rbac/authorize";
import {
  createCategory,
  deleteCategory,
  listCategories,
  updateCategory,
} from "@/server/services/finance/categories.service";
import {
  createEntry,
  deleteEntry,
  getFinanceOptions,
  listEntries,
  searchFinanceStudents,
  sumEntriesByType,
  updateEntry,
} from "@/server/services/finance/entries.service";
import { getFinanceOverview, getFinancePlan } from "@/server/services/finance/overview.service";
import {
  approvePayrollLine,
  getPayroll,
  listPayrollRuns,
  recalculatePayroll,
  savePayroll,
} from "@/server/services/finance/payroll.service";
import { createGroup } from "@/server/services/groups/groups.service";
import { addMember } from "@/server/services/groups/memberships.service";
import { createBranch } from "@/server/services/settings/branches.service";
import { createCourse } from "@/server/services/settings/courses.service";
import { DEMO_ORG_ID, demoBranchIds } from "./support/tenant";

const RUN = String(Date.now() % 100_000).padStart(5, "0");
const TAG = `f${RUN}`;
const phone = (n: number) => `+99896${RUN}${String(n).padStart(2, "0")}`;
const YEAR = 2025;
const MONTH = 3;
const DATE = `${YEAR}-03-10`;

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
const viewer = actor("Viewer", ["ACCOUNTANT"], ["finance.view"]);

let organizationId: string;
let branchA: string;
let branchB: string;
let groupA: string;
let studentOne: string;
let methodId: string;
let categoryId: string;
let runMonthCreated = false;

beforeAll(async () => {
  organizationId = DEMO_ORG_ID;
  const teacherRole = await prisma.role.findUniqueOrThrow({ where: { code: "TEACHER" } });
  for (const [a, n] of [
    [ceo, 1],
    [teacher, 2],
    [viewer, 3],
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
  await prisma.user.update({
    where: { id: teacher.userId },
    data: { salaryMethod: "MONTHLY", fixedSalary: 1_000_000 },
  });
  branchA = (await createBranch(ceo, { name: `${TAG} A`, isActive: true })).id;
  branchB = (await createBranch(ceo, { name: `${TAG} B`, isActive: true })).id;
  ceo.branchIds = await demoBranchIds();
  ceo.activeBranchId = branchA;
  await prisma.userBranch.createMany({
    data: [
      { userId: teacher.userId, branchId: branchA },
      { userId: viewer.userId, branchId: branchA },
    ],
  });
  teacher.branchIds = [branchA];
  viewer.branchIds = [branchA];
  methodId = (await prisma.paymentMethod.findFirstOrThrow({ where: { organizationId } })).id;
  const courseA = (
    await createCourse(ceo, {
      branchId: branchA,
      name: `${TAG} English`,
      description: undefined,
      price: 500_000,
      durationMonths: 12,
      gradingSystemId: null,
      color: null,
    })
  ).id;
  groupA = (
    await createGroup(ceo, {
      branchId: branchA,
      name: `${TAG} GE-A`,
      courseId: courseA,
      gradingSystemId: null,
      weekdayPattern: "EVEN",
      slots: [2, 4, 6].map((weekday) => ({
        weekday,
        startTime: "10:00",
        endTime: "11:30",
        roomId: null,
      })),
      teachers: [{ userId: teacher.userId, role: "MAIN", shareType: "PERCENT", shareValue: 40 }],
      startDate: `${YEAR}-01-05`,
      endDate: `${YEAR}-12-20`,
      status: "ACTIVE",
    })
  ).id;
  const one = await addMember(ceo, groupA, {
    newStudent: { fullName: `${TAG} Aziz`, phone: phone(10) },
    joinedAt: `${YEAR}-01-05`,
    customPrice: null,
    note: null,
    status: "ACTIVE",
  });
  await addMember(ceo, groupA, {
    newStudent: { fullName: `${TAG} Bobur`, phone: phone(11) },
    joinedAt: `${YEAR}-02-01`,
    customPrice: null,
    note: null,
    status: "ACTIVE",
  });
  studentOne = one.studentId;
  await prisma.payment.create({
    data: {
      studentId: studentOne,
      membershipId: one.id,
      branchId: branchA,
      paymentMethodId: methodId,
      amount: 400_000,
      effectiveMonth: new Date(`${YEAR}-03-01T00:00:00.000Z`),
      paidAt: new Date(`${DATE}T00:00:00.000Z`),
      receivedById: ceo.userId,
    },
  });
});

afterAll(async () => {
  const branches = [branchA, branchB];
  const students = await prisma.student.findMany({ where: { branchId: { in: branches } } });
  const groups = await prisma.group.findMany({ where: { branchId: { in: branches } } });
  const entries = await prisma.financeEntry.findMany({ where: { branchId: { in: branches } } });
  const categories = await prisma.financeCategory.findMany({
    where: { name: { startsWith: TAG } },
  });
  await prisma.auditLog.deleteMany({
    where: {
      OR: [
        { branchId: { in: branches } },
        { entityId: { in: [...students, ...groups, ...entries, ...categories].map((x) => x.id) } },
      ],
    },
  });
  if (runMonthCreated) {
    const run = await prisma.payrollRun.findUnique({
      where: {
        organizationId_month: { organizationId, month: new Date(`${YEAR}-03-01T00:00:00.000Z`) },
      },
    });
    if (run) {
      await prisma.auditLog.deleteMany({ where: { entityId: run.id } });
      await prisma.payrollRun.delete({ where: { id: run.id } });
    }
  }
  await prisma.financeEntry.deleteMany({ where: { branchId: { in: branches } } });
  await prisma.financeCategory.deleteMany({ where: { name: { startsWith: TAG } } });
  await prisma.payment.deleteMany({ where: { branchId: { in: branches } } });
  await prisma.group.deleteMany({ where: { branchId: { in: branches } } });
  await prisma.student.deleteMany({ where: { branchId: { in: branches } } });
  await prisma.course.deleteMany({ where: { branchId: { in: branches } } });
  const users = await prisma.user.findMany({ where: { phone: { startsWith: `+99896${RUN}` } } });
  const ids = users.map((u) => u.id);
  await prisma.payrollLine.deleteMany({ where: { userId: { in: ids } } });
  await prisma.auditLog.deleteMany({
    where: { OR: [{ actorId: { in: ids } }, { entityId: { in: ids } }] },
  });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.branch.deleteMany({ where: { id: { in: branches } } });
  await prisma.$disconnect();
});

const entry = (over: Record<string, unknown>) =>
  financeEntrySchema.parse({
    type: "EXPENSE",
    branchId: branchA,
    categoryId: categoryId,
    paymentMethodId: methodId,
    amount: 100_000,
    date: DATE,
    comment: "",
    staffId: "",
    studentId: "",
    counterparty: "",
    ...over,
  });

describe("finance validation", () => {
  it("requires a staff member for advances and a category for expenses", () => {
    const advance = financeEntrySchema.safeParse({
      type: "ADVANCE",
      branchId: "b",
      amount: 10,
      date: DATE,
    });
    expect(advance.success).toBe(false);
    expect(advance.error?.issues.map((i) => i.path.join("."))).toContain("staffId");
    const expense = financeEntrySchema.safeParse({
      type: "EXPENSE",
      branchId: "b",
      amount: 10,
      date: DATE,
    });
    expect(expense.error?.issues.map((i) => i.path.join("."))).toContain("categoryId");
    const investment = financeEntrySchema.safeParse({
      type: "INVESTMENT",
      branchId: "b",
      amount: 10,
      date: DATE,
    });
    expect(investment.error?.issues.map((i) => i.path.join("."))).toContain("counterparty");
  });
});

describe("categories and the ledger", () => {
  it("creates, renames, lists with totals and refuses to delete a used category", async () => {
    const created = await createCategory(ceo, { kind: "EXPENSE", name: `${TAG} Rent` });
    categoryId = created.id;
    await expect(
      createCategory(ceo, { kind: "EXPENSE", name: `${TAG} Rent` }),
    ).rejects.toMatchObject({
      code: "VALIDATION",
    });
    await expect(
      createCategory(viewer, { kind: "INCOME", name: `${TAG} x` }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    const renamed = await updateCategory(ceo, categoryId, { name: `${TAG} Office rent` });
    expect(renamed.name).toBe(`${TAG} Office rent`);

    const row = await createEntry(
      ceo,
      entry({ amount: 800_000, staffId: teacher.userId, comment: "March" }),
    );

    expect(row).toMatchObject({
      categoryName: `${TAG} Office rent`,
      staffName: `${TAG} Teacher`,
      amount: 800_000,
    });
    const list = await listCategories(ceo, { branchId: branchA, year: YEAR, month: MONTH });
    expect(list.find((c) => c.id === categoryId)).toMatchObject({ total: 800_000, count: 1 });
    const empty = await listCategories(ceo, { branchId: branchA, year: YEAR, month: MONTH + 1 });
    expect(empty.find((c) => c.id === categoryId)?.total).toBe(0);
    await expect(deleteCategory(ceo, categoryId)).rejects.toMatchObject({
      code: "CONFLICT",
      message: "errors.categoryHasEntries",
    });
  });

  it("keeps income categories out of expense rows and names a student counterparty", async () => {
    const income = await createCategory(ceo, { kind: "INCOME", name: `${TAG} Drinks` });
    await expect(createEntry(ceo, entry({ categoryId: income.id }))).rejects.toMatchObject({
      code: "VALIDATION",
    });
    const found = await searchFinanceStudents(ceo, "Aziz");
    expect(found.map((s) => s.id)).toContain(studentOne);
    const row = await createEntry(
      ceo,
      entry({ type: "INCOME", categoryId: income.id, amount: 50_000, studentId: studentOne }),
    );
    expect(row.studentName).toBe(`${TAG} Aziz`);
    await expect(createEntry(ceo, entry({ branchId: branchB }))).resolves.toMatchObject({
      branchId: branchB,
    });
    await expect(createEntry(viewer, entry({ branchId: branchB }))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await deleteCategory(ceo, income.id).catch(() => undefined); // still used: stays
  });

  it("lists advances, bonuses and fines by month and staff, edits and deletes", async () => {
    await createEntry(
      ceo,
      entry({ type: "ADVANCE", categoryId: "", amount: 300_000, staffId: teacher.userId }),
    );
    await createEntry(
      ceo,
      entry({ type: "BONUS", categoryId: "", amount: 200_000, staffId: teacher.userId }),
    );
    const fine = await createEntry(
      ceo,
      entry({
        type: "PENALTY",
        categoryId: "",
        amount: 50_000,
        staffId: teacher.userId,
        paymentMethodId: "",
      }),
    );
    await createEntry(ceo, entry({ type: "MARKETING", categoryId: "", amount: 1_000_000 }));
    await createEntry(
      ceo,
      entry({
        type: "INVESTMENT",
        categoryId: "",
        paymentMethodId: "",
        amount: 5_000_000,
        counterparty: "Investor",
      }),
    );
    const advances = await listEntries(ceo, {
      type: "ADVANCE",
      branchId: branchA,
      year: YEAR,
      month: MONTH,
      staffId: teacher.userId,
    });
    expect(advances.items).toHaveLength(1);
    expect(advances.total).toBe(300_000);
    const other = await listEntries(ceo, {
      type: "ADVANCE",
      branchId: branchA,
      year: YEAR,
      month: MONTH + 1,
    });
    expect(other.items).toHaveLength(0);
    const updated = await updateEntry(
      ceo,
      fine.id,
      entry({
        type: "PENALTY",
        categoryId: "",
        amount: 75_000,
        staffId: teacher.userId,
        paymentMethodId: "",
      }),
    );
    expect(updated.amount).toBe(75_000);
    await expect(
      updateEntry(
        ceo,
        fine.id,
        entry({ type: "BONUS", categoryId: "", amount: 1, staffId: teacher.userId }),
      ),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    const extra = await createEntry(ceo, entry({ type: "MARKETING", categoryId: "", amount: 1 }));
    await deleteEntry(ceo, extra.id);
    const marketing = await listEntries(ceo, { type: "MARKETING", branchId: branchA, year: YEAR });
    expect(marketing.total).toBe(1_000_000);
    const totals = await sumEntriesByType(ceo, { branchId: branchA, year: YEAR, month: MONTH });
    expect(totals).toMatchObject({
      ADVANCE: 300_000,
      BONUS: 200_000,
      PENALTY: 75_000,
      MARKETING: 1_000_000,
      INVESTMENT: 5_000_000,
    });
    const options = await getFinanceOptions(ceo);
    expect(options.staff.map((s) => s.id)).toContain(teacher.userId);
    expect(options.categories.map((c) => c.id)).toContain(categoryId);
  });
});

describe("overview and plan", () => {
  it("adds student payments and other income, subtracts outflows, and charts the year", async () => {
    const o = await getFinanceOverview(ceo, { branchId: branchA, year: YEAR, month: MONTH });
    expect(o.studentIncome).toBe(400_000);
    expect(o.otherIncome).toBe(50_000);
    expect(o.income).toBe(450_000);
    // expense 800k + marketing 1m + advance 300k + bonus 200k; the fine is not an outflow
    expect(o.expenses).toBe(2_300_000);
    expect(o.profit).toBe(450_000 - 2_300_000);
    expect(o.investments).toBe(5_000_000);
    expect(o.activeBalance).toBe(5_000_000 + 450_000 - 2_300_000);
    expect(o.paymentCount).toBe(1);
    expect(o.averagePayment).toBe(400_000);
    expect(o.byMethod[0]).toMatchObject({ id: methodId, amount: 400_000 });
    expect(o.yearly).toHaveLength(12);
    expect(o.yearly[MONTH - 1]).toMatchObject({
      month: `${YEAR}-03`,
      income: 450_000,
      expenses: 2_300_000,
    });
    const whole = await getFinanceOverview(ceo, { branchId: branchA, year: YEAR });
    expect(whole.income).toBe(450_000);
    const byMethod = await getFinanceOverview(ceo, {
      branchId: branchA,
      year: YEAR,
      paymentMethodId: "nope",
    });
    expect(byMethod.studentIncome).toBe(0);
    await expect(
      getFinanceOverview(viewer, { branchId: branchB, year: YEAR }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("computes the monthly plan from charges and payments by effect month", async () => {
    const plan = await getFinancePlan(ceo, {
      branchId: branchA,
      year: YEAR,
      month: MONTH,
      effective: true,
    });
    expect(plan.month).toBe(`${YEAR}-03`);
    expect(plan.achieved).toBe(400_000);
    expect(plan.plan).toBeGreaterThan(0); // two charged memberships
    expect(plan.expected).toBe(Math.max(plan.plan - 400_000, 0));
    expect(plan.debtors).toBeGreaterThanOrEqual(1);
    const byDate = await getFinancePlan(ceo, {
      branchId: branchA,
      year: YEAR,
      month: MONTH,
      effective: false,
    });
    expect(byDate.achieved).toBe(400_000);
  });
});

describe("payroll", () => {
  it("computes the month from the group shares, bonuses, fines and advances", async () => {
    const run = await getPayroll(ceo, `${YEAR}-03`);
    runMonthCreated = true;
    const line = run.lines.find((l) => l.userId === teacher.userId)!;
    expect(line).toBeDefined();
    // 40% of 500 000 × 2 students = 400 000; fixed 1 000 000 (MONTHLY); bonus 200 000; fine 75 000; advance 300 000
    expect(line.percent).toBe(400_000);
    expect(line.fixed).toBe(1_000_000);
    expect(line).toMatchObject({
      bonus: 200_000,
      penalty: 75_000,
      penaltyCount: 1,
      advance: 300_000,
    });
    expect(line.net).toBe(1_000_000 + 400_000 + 200_000 - 75_000 - 300_000);
    expect(line.details[0]).toMatchObject({
      groupName: `${TAG} GE-A`,
      shareType: "PERCENT",
      students: 2,
    });
    expect(line.details[0]!.lessons).toBeGreaterThan(0);
    expect(line.status).toBe("MODERATION");
    expect(run.status).toBe("DRAFT");
    const list = await listPayrollRuns(ceo);
    expect(list.find((r) => r.month === `${YEAR}-03`)?.staffCount).toBeGreaterThanOrEqual(1);
  });

  it("approves a line, keeps it through recalculation and saves the run", async () => {
    const before = await getPayroll(ceo, `${YEAR}-03`);
    const line = before.lines.find((l) => l.userId === teacher.userId)!;
    await expect(approvePayrollLine(viewer, `${YEAR}-03`, line.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    const approved = await approvePayrollLine(ceo, `${YEAR}-03`, line.id);
    expect(approved.lines.find((l) => l.id === line.id)).toMatchObject({
      status: "APPROVED",
      approvedByName: `${TAG} CEO`,
    });
    expect(approved.approvedCount).toBe(1);
    // A new bonus after approval must not change the approved line.
    await createEntry(
      ceo,
      entry({ type: "BONUS", categoryId: "", amount: 999, staffId: teacher.userId }),
    );
    const recalculated = await recalculatePayroll(ceo, `${YEAR}-03`);
    expect(recalculated.lines.find((l) => l.id === line.id)!.bonus).toBe(200_000);
    const saved = await savePayroll(ceo, `${YEAR}-03`, "SAVED");
    expect(saved.status).toBe("SAVED");
    await expect(getPayroll(viewer, `${YEAR}-03`)).resolves.toMatchObject({ status: "SAVED" });
  });
});
