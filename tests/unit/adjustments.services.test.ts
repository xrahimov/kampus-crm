/**
 * Opening balances and corrections (A-109) against the real database: the hand
 * adjustment, the balance engine and the Excel import with its preview.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/server/db/prisma";
import { mapColumns, parseSignedMoney } from "@/server/excel/import-columns";
import type { Actor } from "@/server/rbac/authorize";
import { createGroup } from "@/server/services/groups/groups.service";
import { createBranch } from "@/server/services/settings/branches.service";
import { createCourse } from "@/server/services/settings/courses.service";
import {
  createAdjustment,
  deleteAdjustment,
  importOpeningBalances,
  listStudentAdjustments,
} from "@/server/services/students/adjustments.service";
import { membershipBalances } from "@/server/services/students/balances";
import {
  createStudent,
  getStudent,
  listStudentHistory,
} from "@/server/services/students/students.service";

import { DEMO_ORG_ID, demoBranchIds } from "./support/tenant";

const RUN = String(Date.now() % 100_000).padStart(5, "0");
const TAG = `adj${RUN}`;
const phone = (n: number) => `+99894${RUN}${String(n).padStart(2, "0")}`;

const ceo: Actor = {
  userId: "",
  fullName: "CEO",
  roles: ["CEO"],
  permissions: ["*"],
  organizationId: DEMO_ORG_ID,
  branchIds: [],
  activeBranchId: null,
};
const cashier: Actor = {
  ...ceo,
  fullName: "Cashier",
  roles: ["CASHIER"],
  permissions: ["students.view", "payments.create"],
};

let branchId: string;
let groupA: string;
let groupB: string;

beforeAll(async () => {
  for (const [a, n] of [
    [ceo, 1],
    [cashier, 2],
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
  branchId = (await createBranch(ceo, { name: `${TAG} Branch`, isActive: true })).id;
  ceo.branchIds = await demoBranchIds();
  ceo.activeBranchId = branchId;
  cashier.branchIds = [branchId];
  await prisma.userBranch.create({ data: { userId: cashier.userId, branchId } });
  const courseId = (
    await createCourse(ceo, {
      branchId,
      name: `${TAG} Course`,
      description: undefined,
      price: 400_000,
      durationMonths: 3,
      gradingSystemId: null,
      color: null,
    })
  ).id;
  const teacher = await prisma.user.create({
    data: {
      phone: phone(3),
      fullName: `${TAG} Teacher`,
      passwordHash: "x",
      organizationId: DEMO_ORG_ID,
    },
  });
  const teacherRole = await prisma.role.findUniqueOrThrow({ where: { code: "TEACHER" } });
  await prisma.userRole.create({ data: { userId: teacher.id, roleId: teacherRole.id } });
  const slots = [1, 3, 5].map((weekday) => ({
    weekday,
    startTime: "10:00",
    endTime: "11:30",
    roomId: null,
  }));
  const group = (name: string) =>
    createGroup(ceo, {
      branchId,
      name,
      courseId,
      gradingSystemId: null,
      weekdayPattern: "ODD",
      slots,
      teachers: [{ userId: teacher.id, role: "MAIN", shareType: "PERCENT", shareValue: 40 }],
      startDate: "2026-10-01",
      endDate: null,
      status: "ACTIVE",
      // The same teacher at the same hour twice: the clash check (A-116) has its own suite.
      ignoreClashes: true,
    });
  groupA = (await group(`${TAG} Group A`)).id;
  groupB = (await group(`${TAG} Group B`)).id;
});

afterAll(async () => {
  const students = await prisma.student.findMany({ where: { branchId }, select: { id: true } });
  const ids = students.map((s) => s.id);
  await prisma.auditLog.deleteMany({
    where: { OR: [{ branchId }, { actorId: { in: [ceo.userId, cashier.userId] } }] },
  });
  await prisma.balanceAdjustment.deleteMany({ where: { branchId } });
  await prisma.groupMembership.deleteMany({ where: { studentId: { in: ids } } });
  await prisma.group.deleteMany({ where: { branchId } });
  await prisma.student.deleteMany({ where: { branchId } });
  await prisma.course.deleteMany({ where: { branchId } });
  await prisma.userBranch.deleteMany({ where: { branchId } });
  await prisma.userRole.deleteMany({ where: { user: { phone: { startsWith: `+99894${RUN}` } } } });
  await prisma.user.deleteMany({ where: { phone: { startsWith: `+99894${RUN}` } } });
  await prisma.branch.deleteMany({ where: { id: branchId } });
  await prisma.$disconnect();
});

const student = (name: string, n: number, groupId: string) =>
  createStudent(ceo, {
    branchId,
    fullName: `${TAG} ${name}`,
    phone: phone(n),
    birthDate: null,
    gender: "MALE",
    photoUrl: null,
    password: null,
    sourceId: null,
    schoolId: null,
    note: null,
    membership: {
      groupId,
      joinedAt: "2026-10-01",
      customPrice: null,
      note: null,
      status: "ACTIVE",
    },
  });

describe("parsing helpers", () => {
  it("reads money with separators, signs and brackets", () => {
    expect(parseSignedMoney("-1 200 000")).toBe(-1_200_000);
    expect(parseSignedMoney("−500000")).toBe(-500_000);
    expect(parseSignedMoney("1,200,000.50")).toBe(1_200_000.5);
    expect(parseSignedMoney("(300000)")).toBe(-300_000);
    expect(parseSignedMoney("500 000 so'm")).toBe(500_000);
    expect(parseSignedMoney("abc")).toBeNull();
  });

  it("finds columns by header in any language or alias, else assumes the template order", () => {
    const specs = [
      { key: "fullName", aliases: ["fio"] },
      { key: "phone" },
      { key: "balance" },
      { key: "debt", aliases: ["qarz"] },
    ];
    const byHeader = mapColumns(["Telefon", "F.I.O.", "Qarz"], specs);
    expect(byHeader.byHeader).toBe(true);
    expect(byHeader.index).toEqual({ phone: 0, fullName: 1, debt: 2 });
    const positional = mapColumns(["Alice", "+998901234567", "-5000"], specs);
    expect(positional.byHeader).toBe(false);
    expect(positional.index).toEqual({ fullName: 0, phone: 1, balance: 2, debt: 3 });
  });
});

describe("opening balances (A-109)", () => {
  it("adds a hand adjustment to the balance and the history, and removes it again", async () => {
    const dto = await student("Alice", 10, groupA);
    const membershipId = dto.groups[0]!.membershipId;
    const before = (await membershipBalances(prisma, [membershipId])).get(membershipId)!;

    const adjustment = await createAdjustment(cashier, {
      membershipId,
      amount: -250_000,
      kind: "OPENING",
      date: "2026-10-01",
      comment: "from the old CRM",
    });
    expect(adjustment).toMatchObject({ amount: -250_000, kind: "OPENING", groupId: groupA });
    const after = (await membershipBalances(prisma, [membershipId])).get(membershipId)!;
    expect(after.adjusted).toBe(-250_000);
    expect(after.balance).toBe(before.balance - 250_000);
    expect((await getStudent(ceo, dto.id)).balance).toBe(before.balance - 250_000);
    expect(await listStudentAdjustments(ceo, dto.id)).toHaveLength(1);
    const history = await listStudentHistory(ceo, dto.id, {
      page: 1,
      pageSize: 10,
      skip: 0,
      take: 10,
    });
    expect(history.items.map((h) => h.action)).toContain("balance.adjust");

    await expect(deleteAdjustment(cashier, adjustment.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await deleteAdjustment(ceo, adjustment.id);
    expect(await listStudentAdjustments(ceo, dto.id)).toHaveLength(0);
    expect((await membershipBalances(prisma, [membershipId])).get(membershipId)!.balance).toBe(
      before.balance,
    );
  });

  it("refuses a zero amount and a membership outside the actor's branches", async () => {
    const dto = await student("Zed", 11, groupA);
    const membershipId = dto.groups[0]!.membershipId;
    const outsider: Actor = { ...cashier, branchIds: [] };
    await expect(
      createAdjustment(outsider, {
        membershipId,
        amount: -1000,
        kind: "OPENING",
        date: "2026-10-01",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("imports a debtor list with a preview first, by phone, id or name, and never twice", async () => {
    const bob = await student("Bob", 20, groupA);
    const carol = await student("Carol", 21, groupB);
    const dave = await student("Dave", 22, groupA);
    // Dave is in both groups, so his row needs the group column.
    await prisma.groupMembership.create({
      data: {
        groupId: groupB,
        studentId: dave.id,
        status: "ACTIVE",
        joinedAt: new Date("2026-10-01"),
        activatedAt: new Date("2026-10-01"),
      },
    });
    const rows = [
      ["Ism", "Telefon", "Guruh", "Qarz", "Izoh"],
      ["", phone(20), "", "500 000", "old debt"], // Bob by phone, debt column: owes 500k
      [`${TAG} Carol`, "", "", "-120000", ""], // Carol by name, credit (negative debt)
      [`${TAG} Dave`, "", "", "10000", ""], // Dave: two groups, no group given
      [`${TAG} Dave`, "", `${TAG} Group B`, "10000", ""],
      ["Nobody Here", "", "", "100", ""],
      [`${TAG} Bob`, phone(20), "", "0", ""],
    ];
    const preview = await importOpeningBalances(cashier, { branchId, dryRun: true }, rows);
    expect(preview.dryRun).toBe(true);
    expect(preview.byHeader).toBe(true);
    expect(preview.imported).toBe(3);
    expect(preview.matched.map((m) => m.row)).toEqual([2, 3, 5]);
    expect(preview.skipped).toEqual([
      { row: 4, reason: "errors.importGroupRequired" },
      { row: 6, reason: "errors.studentNotFound" },
      { row: 7, reason: "errors.importZero" },
    ]);
    expect(await prisma.balanceAdjustment.count({ where: { branchId } })).toBe(0);

    const result = await importOpeningBalances(cashier, { branchId, dryRun: false }, rows);
    expect(result.imported).toBe(3);
    const bobMembership = bob.groups[0]!.membershipId;
    const carolMembership = carol.groups[0]!.membershipId;
    const balances = await membershipBalances(prisma, [bobMembership, carolMembership]);
    expect(balances.get(bobMembership)!.adjusted).toBe(-500_000);
    expect(balances.get(carolMembership)!.adjusted).toBe(120_000);
    const daveRows = await listStudentAdjustments(ceo, dave.id);
    expect(daveRows).toHaveLength(1);
    expect(daveRows[0]).toMatchObject({ groupId: groupB, amount: -10_000, comment: null });

    // The same file again changes nothing.
    const again = await importOpeningBalances(cashier, { branchId, dryRun: false }, rows);
    expect(again.imported).toBe(0);
    expect(again.skipped.filter((s) => s.reason === "errors.importBalanceExists")).toHaveLength(3);

    // A file with the template's headers, students found by Kampus id.
    const erin = await student("Erin", 23, groupB);
    const byId = await importOpeningBalances(cashier, { branchId, dryRun: false }, [
      ["Kampus ID", "Full name", "Phone", "Group", "Balance", "Date", "Comment"],
      [bob.id, "", "", `${TAG} Group A`, "-1", "2026-09-30", "dup"],
      [erin.id, "", "", "", "-77000", "01.10.2026", "from the old CRM"],
    ]);
    expect(byId.byHeader).toBe(true);
    expect(byId.skipped).toEqual([{ row: 2, reason: "errors.importBalanceExists" }]);
    expect(byId.imported).toBe(1);
    expect((await listStudentAdjustments(ceo, erin.id))[0]).toMatchObject({
      amount: -77_000,
      date: "2026-10-01",
      comment: "from the old CRM",
    });
  });
});
