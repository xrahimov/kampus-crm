/**
 * Revenue forecast (A-133) against the real database: expected charges for
 * this month and the next as the fee engine computes them, collected payments
 * by effect month, the splits by course and branch, and the permission.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/server/db/prisma";
import type { Actor } from "@/server/rbac/authorize";
import { getRevenueForecast } from "@/server/services/finance/forecast.service";
import { createGroup } from "@/server/services/groups/groups.service";
import { addMember } from "@/server/services/groups/memberships.service";
import { createBranch } from "@/server/services/settings/branches.service";
import { createCourse } from "@/server/services/settings/courses.service";
import { addMonthsIso, monthStart } from "@/server/services/students/fees";

import { DEMO_ORG_ID, demoBranchIds } from "./support/tenant";

const RUN = String(Date.now() % 100_000).padStart(5, "0");
const TAG = `fc${RUN}`;
const phone = (n: number) => `+99890${RUN}${String(n).padStart(2, "0")}`;
const TODAY = new Date().toISOString().slice(0, 10);
const CURRENT = monthStart(TODAY);
const NEXT = addMonthsIso(CURRENT, 1);

const ceo: Actor = {
  userId: "",
  fullName: "CEO",
  roles: ["CEO"],
  permissions: ["*"],
  organizationId: DEMO_ORG_ID,
  branchIds: [],
  activeBranchId: null,
};
const viewer: Actor = {
  ...ceo,
  fullName: "Viewer",
  roles: ["VIEWER"],
  permissions: ["dashboard.view"],
};

let branchId: string;
let methodId: string;
let groupId: string;

beforeAll(async () => {
  const user = await prisma.user.create({
    data: {
      phone: phone(1),
      fullName: `${TAG} CEO`,
      passwordHash: "x",
      organizationId: DEMO_ORG_ID,
    },
  });
  ceo.userId = user.id;
  branchId = (await createBranch(ceo, { name: `${TAG} Branch`, isActive: true })).id;
  ceo.branchIds = await demoBranchIds();
  ceo.activeBranchId = branchId;
  viewer.branchIds = [branchId];
  methodId = (
    await prisma.paymentMethod.findFirstOrThrow({ where: { organizationId: DEMO_ORG_ID } })
  ).id;
  const courseId = (
    await createCourse(ceo, {
      branchId,
      name: `${TAG} Course`,
      description: undefined,
      price: 500_000,
      durationMonths: 6,
      gradingSystemId: null,
      color: null,
    })
  ).id;
  // A lesson every day from last month to four months ahead: every month is a full month.
  groupId = (
    await createGroup(ceo, {
      branchId,
      name: `${TAG} Group`,
      courseId,
      gradingSystemId: null,
      weekdayPattern: "CUSTOM",
      slots: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
        weekday,
        startTime: "09:00",
        endTime: "10:00",
        roomId: null,
      })),
      teachers: [],
      startDate: addMonthsIso(CURRENT, -1),
      endDate: addMonthsIso(CURRENT, 4),
      status: "ACTIVE",
    })
  ).id;
  // Aziz: active from the first of this month at the full price.
  const aziz = await addMember(ceo, groupId, {
    newStudent: { fullName: `${TAG} Aziz`, phone: phone(10) },
    joinedAt: CURRENT,
    customPrice: null,
    note: null,
    status: "ACTIVE",
  });
  // Bobur: half price by custom price, from the 16th, so this month is pro-rated and next is full.
  await addMember(ceo, groupId, {
    newStudent: { fullName: `${TAG} Bobur`, phone: phone(11) },
    joinedAt: `${CURRENT.slice(0, 7)}-16`,
    customPrice: 250_000,
    note: null,
    status: "ACTIVE",
  });
  // Dilnoza: still on trial, so nothing is expected from her.
  await addMember(ceo, groupId, {
    newStudent: { fullName: `${TAG} Dilnoza`, phone: phone(12) },
    joinedAt: CURRENT,
    customPrice: null,
    note: null,
    status: "TRIAL",
  });
  await prisma.payment.createMany({
    data: [
      {
        studentId: aziz.studentId,
        membershipId: aziz.id,
        branchId,
        paymentMethodId: methodId,
        amount: 300_000,
        effectiveMonth: new Date(`${CURRENT}T00:00:00.000Z`),
        paidAt: new Date(`${TODAY}T00:00:00.000Z`),
        receivedById: ceo.userId,
      },
      {
        studentId: aziz.studentId,
        membershipId: aziz.id,
        branchId,
        paymentMethodId: methodId,
        amount: 100_000,
        effectiveMonth: new Date(`${NEXT}T00:00:00.000Z`),
        paidAt: new Date(`${TODAY}T00:00:00.000Z`),
        receivedById: ceo.userId,
      },
    ],
  });
});

afterAll(async () => {
  const students = await prisma.student.findMany({ where: { branchId }, select: { id: true } });
  const ids = students.map((s) => s.id);
  await prisma.auditLog.deleteMany({
    where: { OR: [{ branchId }, { actorId: ceo.userId }, { entityId: { in: ids } }] },
  });
  await prisma.payment.deleteMany({ where: { branchId } });
  await prisma.smsMessage.deleteMany({ where: { studentId: { in: ids } } });
  await prisma.groupMembership.deleteMany({ where: { studentId: { in: ids } } });
  await prisma.group.deleteMany({ where: { branchId } });
  await prisma.student.deleteMany({ where: { branchId } });
  await prisma.course.deleteMany({ where: { branchId } });
  await prisma.user.deleteMany({ where: { id: ceo.userId } });
  await prisma.branch.deleteMany({ where: { id: branchId } });
  await prisma.$disconnect();
});

describe("revenue forecast", () => {
  it("expects this month's and next month's charges and sets them against what is paid", async () => {
    const f = await getRevenueForecast(ceo, { branchId });
    expect(f.month).toBe(CURRENT.slice(0, 7));
    expect(f.nextMonth).toBe(NEXT.slice(0, 7));
    expect(f.memberships).toBe(2);
    // Aziz the full 500,000; Bobur 250,000 pro-rated to the lessons from the 16th.
    const daysInMonth = new Date(
      Date.UTC(Number(CURRENT.slice(0, 4)), Number(CURRENT.slice(5, 7)), 0),
    ).getUTCDate();
    const boburNow = Math.round((250_000 * (daysInMonth - 15)) / daysInMonth);
    expect(f.current.expected).toBe(500_000 + boburNow);
    expect(f.current.collected).toBe(300_000);
    expect(f.current.percent).toBe(Math.round((300_000 / (500_000 + boburNow)) * 1000) / 10);
    expect(f.next).toEqual({ expected: 750_000, collected: 100_000 });
    expect(f.months).toHaveLength(6);
    expect(f.months[4]).toMatchObject({ kind: "current", collected: 300_000 });
    expect(f.months[5]).toMatchObject({ kind: "next", expected: 750_000, collected: 100_000 });
    expect(f.months.slice(0, 4).every((m) => m.kind === "past" && m.expected === 0)).toBe(true);
    expect(f.byCourse).toEqual([
      {
        id: null,
        name: `${TAG} Course`,
        expected: 500_000 + boburNow,
        collected: 300_000,
        nextExpected: 750_000,
      },
    ]);
    expect(f.byBranch).toEqual([
      {
        id: branchId,
        name: `${TAG} Branch`,
        expected: 500_000 + boburNow,
        collected: 300_000,
        nextExpected: 750_000,
      },
    ]);
  });

  it("needs the dashboard finance permission and the branch", async () => {
    await expect(getRevenueForecast(viewer, { branchId })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    const other: Actor = { ...ceo, permissions: ["dashboard.finance"], branchIds: ["nope"] };
    await expect(getRevenueForecast(other, { branchId })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
