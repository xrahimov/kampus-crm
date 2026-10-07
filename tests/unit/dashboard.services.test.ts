/**
 * Phase 13 against the real database: dashboard KPIs, the room schedule, global
 * search scoping and in-app notifications. Rows carry a run-specific tag and are
 * removed at the end.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/rbac/default-roles";
import { prisma } from "@/server/db/prisma";
import type { Actor } from "@/server/rbac/authorize";
import { getDashboardFinance } from "@/server/services/dashboard/finance.service";
import { getDashboardKpis } from "@/server/services/dashboard/kpis.service";
import {
  listNotifications,
  markRead,
  notifyUsers,
  runDailyNotifications,
  unreadCount,
} from "@/server/services/dashboard/notifications.service";
import { getDashboardSchedule, weekdayToday } from "@/server/services/dashboard/schedule.service";
import { globalSearch } from "@/server/services/dashboard/search.service";
import { createGroup } from "@/server/services/groups/groups.service";
import { addMember } from "@/server/services/groups/memberships.service";
import { createBoard, createColumn } from "@/server/services/leads/boards.service";
import { createLead } from "@/server/services/leads/leads.service";
import { createBranch } from "@/server/services/settings/branches.service";
import { createCourse } from "@/server/services/settings/courses.service";
import { createPaymentMethod } from "@/server/services/settings/payment-methods.service";
import { createRoom } from "@/server/services/settings/rooms.service";
import { createPayment } from "@/server/services/students/payments.service";
import { DEMO_ORG_ID, demoBranchIds } from "./support/tenant";

const RUN = String(Date.now() % 100_000).padStart(5, "0");
const TAG = `d${RUN}`;
const phone = (n: number) => `+99893${RUN}${String(n).padStart(2, "0")}`;

const actor = (fullName: string, roles: string[], permissions: string[]): Actor => ({
  userId: "",
  fullName,
  roles,
  permissions,
  organizationId: DEMO_ORG_ID,
  branchIds: [],
  activeBranchId: null,
});
// Acts with every permission; as a notification recipient it is an admin of branch A only (see beforeAll).
const ceo = actor("CEO", ["CEO"], ["*"]);
const teacher = actor("Teacher", ["TEACHER"], [...DEFAULT_ROLE_PERMISSIONS.TEACHER]);
const cashier = actor("Cashier", ["CASHIER"], [...DEFAULT_ROLE_PERMISSIONS.CASHIER]);
const outsider = actor("Outsider", ["CASHIER"], [...DEFAULT_ROLE_PERMISSIONS.CASHIER]);
const viewer = actor(
  "Viewer",
  ["OTHER"],
  ["dashboard.view", "leads.view", "groups.view", "students.view", "teachers.view"],
);

const iso = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => iso(new Date(Date.now() - n * 86_400_000));

let branchA: string;
let branchB: string;
let roomA: string;
let groupA: string;
let groupB: string;
let methodId: string;
let alice: { id: string; studentId: string };
let bob: { id: string; studentId: string };
let columnId: string;

beforeAll(async () => {
  const roles = await prisma.role.findMany({
    where: { code: { in: ["ADMIN", "TEACHER", "CASHIER"] } },
  });
  const roleId = (code: string) => roles.find((r) => r.code === code)!.id;
  for (const [a, n, code] of [
    [ceo, 1, "ADMIN"],
    [teacher, 2, "TEACHER"],
    [cashier, 3, "CASHIER"],
    [outsider, 4, "CASHIER"],
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
    if (code) await prisma.userRole.create({ data: { userId: user.id, roleId: roleId(code) } });
  }
  branchA = (await createBranch(ceo, { name: `${TAG} A`, isActive: true })).id;
  branchB = (await createBranch(ceo, { name: `${TAG} B`, isActive: true })).id;
  ceo.branchIds = await demoBranchIds();
  ceo.activeBranchId = branchA;
  await prisma.userBranch.createMany({
    data: [
      { userId: ceo.userId, branchId: branchA },
      { userId: teacher.userId, branchId: branchA },
      { userId: cashier.userId, branchId: branchA },
      { userId: outsider.userId, branchId: branchB },
    ],
  });
  teacher.branchIds = [branchA];
  viewer.branchIds = [branchA];
  cashier.branchIds = [branchA];
  outsider.branchIds = [branchB];
  const courseA = (
    await createCourse(ceo, {
      branchId: branchA,
      name: `${TAG} English`,
      description: undefined,
      price: 500_000,
      durationMonths: 3,
      gradingSystemId: null,
      color: "#123456",
    })
  ).id;
  roomA = (await createRoom(ceo, { branchId: branchA, name: `${TAG} Room`, capacity: 12 })).id;
  const group = (name: string, roomId: string | null, teacherId: string) =>
    createGroup(ceo, {
      branchId: branchA,
      name,
      courseId: courseA,
      gradingSystemId: null,
      weekdayPattern: "EVERY_DAY",
      slots: [1, 2, 3, 4, 5, 6].map((weekday) => ({
        weekday,
        startTime: "09:00",
        endTime: "10:30",
        roomId,
      })),
      teachers: [{ userId: teacherId, role: "MAIN", shareType: "PERCENT", shareValue: 40 }],
      startDate: daysAgo(45),
      endDate: null,
      status: "ACTIVE",
    });
  groupA = (await group(`${TAG} GE-A`, roomA, teacher.userId)).id;
  groupB = (await group(`${TAG} GE-B`, null, teacher.userId)).id;
  methodId = (await createPaymentMethod(ceo, { name: `${TAG} Cash`, isActive: true, sortOrder: 0 }))
    .id;
  alice = await addMember(ceo, groupA, {
    newStudent: { fullName: `${TAG} Alice`, phone: phone(11) },
    joinedAt: daysAgo(45),
    status: "ACTIVE",
    customPrice: null,
    note: null,
  });
  bob = await addMember(ceo, groupB, {
    newStudent: { fullName: `${TAG} Bob`, phone: phone(12) },
    joinedAt: daysAgo(45),
    status: "TRIAL",
    customPrice: null,
    note: null,
  });
  const board = await createBoard(ceo, { branchId: branchA, name: `${TAG} Board` });
  columnId = (await createColumn(ceo, board.id, { name: `${TAG} Column` })).id;
});

afterAll(async () => {
  await prisma.notification.deleteMany({
    where: { userId: { in: [ceo, teacher, cashier, outsider].map((a) => a.userId) } },
  });
  await prisma.lead.deleteMany({ where: { branchId: { in: [branchA, branchB] } } });
  await prisma.leadBoard.deleteMany({ where: { branchId: { in: [branchA, branchB] } } });
  await prisma.payment.deleteMany({ where: { branchId: branchA } });
  await prisma.paymentMethod.deleteMany({ where: { name: { startsWith: TAG } } });
  await prisma.group.deleteMany({ where: { branchId: branchA } });
  await prisma.student.deleteMany({ where: { branchId: branchA } });
  await prisma.room.deleteMany({ where: { branchId: branchA } });
  await prisma.course.deleteMany({ where: { branchId: branchA } });
  await prisma.auditLog.deleteMany({ where: { branchId: { in: [branchA, branchB] } } });
  await prisma.user.deleteMany({ where: { phone: { startsWith: `+99893${RUN}` } } });
  await prisma.branch.deleteMany({ where: { id: { in: [branchA, branchB] } } });
});

describe("dashboard KPIs", () => {
  it("counts leads, groups, students by status, debt and teachers for the branch", async () => {
    await createLead(ceo, {
      columnId,
      fullName: `${TAG} Lead`,
      phones: [],
      birthDate: null,
      age: null,
      sourceId: null,
      teacherId: null,
      days: null,
      lessonTime: null,
      status: "NEW",
      temperature: null,
      comment: null,
    });
    const kpis = await getDashboardKpis(ceo, { branchId: branchA });
    expect(kpis.activeLeads).toBe(1);
    expect(kpis.groups).toBe(2);
    expect(kpis.studentsInGroups).toBe(2);
    expect(kpis.activeStudents).toBe(1);
    expect(kpis.trial).toBe(1);
    expect(kpis.newAdmissions).toBe(0);
    expect(kpis.leftThisMonth).toBe(0);
    expect(kpis.teachers).toBe(1);
    expect(kpis.exams).toBe(0);
    // Alice has been charged for six weeks of lessons and paid nothing.
    expect(kpis.debtors).toBe(1);
    expect(kpis.remainingDebt).toBeGreaterThan(0);
    expect(kpis.utilisation).not.toBeNull();
    const other = await getDashboardKpis(ceo, { branchId: branchB });
    expect(other.groups).toBe(0);
    expect(other.studentsInGroups).toBe(0);
    // Without reports.view the utilisation badge is hidden; teachers have no dashboard at all.
    const asViewer = await getDashboardKpis(viewer, {});
    expect(asViewer.utilisation).toBeNull();
    expect(asViewer.activeLeads).toBe(1);
    await expect(getDashboardKpis(teacher, {})).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(getDashboardKpis(cashier, { branchId: branchB })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("room schedule", () => {
  it("lays the groups out per room and time slot for a weekday", async () => {
    const schedule = await getDashboardSchedule(ceo, { branchId: branchA, weekday: 1, step: 30 });
    expect(schedule.weekday).toBe(1);
    expect(schedule.slots[0]).toBe(schedule.workStart);
    expect(schedule.slots).toContain("09:00");
    const room = schedule.rooms.find((r) => r.id === roomA);
    expect(room).toMatchObject({ name: `${TAG} Room`, capacity: 12 });
    expect(room?.blocks).toEqual([
      {
        groupId: groupA,
        groupName: `${TAG} GE-A`,
        courseName: `${TAG} English`,
        color: "#123456",
        teacherName: `${TAG} Teacher`,
        startTime: "09:00",
        endTime: "10:30",
      },
    ]);
    expect(schedule.unassigned.map((b) => b.groupId)).toEqual([groupB]);
    const sunday = await getDashboardSchedule(ceo, { branchId: branchA, weekday: 7, step: 60 });
    expect(sunday.rooms.find((r) => r.id === roomA)?.blocks).toEqual([]);
    expect(sunday.slots.length).toBe(Math.round(schedule.slots.length / 2));
    expect(weekdayToday(new Date("2026-10-04T12:00:00Z"))).toBe(7);
    expect(weekdayToday(new Date("2026-10-05T12:00:00Z"))).toBe(1);
  });
});

describe("global search", () => {
  it("finds students, leads and groups the user may see, by name or phone", async () => {
    const all = await globalSearch(ceo, TAG);
    expect(all.students.map((s) => s.fullName).sort()).toEqual([`${TAG} Alice`, `${TAG} Bob`]);
    expect(all.leads.map((l) => l.fullName)).toEqual([`${TAG} Lead`]);
    expect(all.groups.map((g) => g.name).sort()).toEqual([`${TAG} GE-A`, `${TAG} GE-B`]);
    expect(all.students.find((s) => s.fullName === `${TAG} Alice`)?.groups).toEqual([
      `${TAG} GE-A`,
    ]);
    const byPhone = await globalSearch(ceo, phone(12).slice(5));
    expect(byPhone.students.map((s) => s.id)).toEqual([bob.studentId]);
    // A teacher sees only their own groups' students and groups, and no leads.
    const mine = await globalSearch(teacher, TAG);
    expect(mine.students.map((s) => s.fullName).sort()).toEqual([`${TAG} Alice`, `${TAG} Bob`]);
    expect(mine.groups.map((g) => g.name).sort()).toEqual([`${TAG} GE-A`, `${TAG} GE-B`]);
    expect(mine.leads).toEqual([]);
    // Outside their groups a teacher sees nothing even in their own branch.
    const demo = await globalSearch(teacher, "GE-Morning");
    expect(demo.groups).toEqual([]);
    // Another branch sees nothing of this one.
    const elsewhere = await globalSearch(outsider, TAG);
    expect(elsewhere).toEqual({ students: [], leads: [], groups: [] });
    expect(await globalSearch(ceo, "a")).toEqual({ students: [], leads: [], groups: [] });
  });
});

describe("notifications", () => {
  it("tells the branch's cashiers about a payment, but not the payer's own cashier", async () => {
    await createPayment(cashier, {
      membershipId: alice.id,
      paymentMethodId: methodId,
      amount: 100_000,
      bonus: 0,
      effectiveMonth: daysAgo(0).slice(0, 7),
      paidAt: daysAgo(0),
      comment: null,
    });
    expect(await unreadCount(cashier)).toBe(0);
    expect(await unreadCount(outsider)).toBe(0);
    const forCeo = await listNotifications(ceo, { unread: true, page: 1 });
    const payment = forCeo.items.find(
      (n) => n.kind === "PAYMENT" && n.params.name === `${TAG} Alice`,
    );
    expect(payment).toMatchObject({
      params: { name: `${TAG} Alice`, amount: 100_000, group: `${TAG} GE-A`, by: "Cashier" },
      href: `/students/${alice.studentId}`,
      readAt: null,
    });
    // The CEO created the lead above themselves, so nobody here was told about it.
    expect(forCeo.items.some((n) => n.kind === "LEAD")).toBe(false);
    expect(
      (await listNotifications(cashier, { unread: false, page: 1 })).items.some(
        (n) => n.kind === "LEAD",
      ),
    ).toBe(false);
  });

  it("marks one or all as read and reports the unread count", async () => {
    const created = await notifyUsers(prisma, {
      kind: "BIRTHDAY",
      params: { name: "X", day: "2026-01-01", year: 2026 },
      href: "/students",
      branchId: branchA,
      permission: "students.view",
    });
    expect(created).toBeGreaterThanOrEqual(3); // CEO, teacher, cashier (plus seeded staff with all-branch access)
    expect(await unreadCount(teacher)).toBe(1);
    const page = await listNotifications(teacher, { unread: false, page: 1 });
    const one = await markRead(teacher, { ids: [page.items[0]!.id] });
    expect(one).toEqual({ marked: 1, unread: 0 });
    const before = await unreadCount(ceo);
    expect(before).toBeGreaterThan(0);
    const all = await markRead(ceo, { all: true });
    expect(all.marked).toBe(before);
    expect(all.unread).toBe(0);
    // Marking somebody else's row does nothing.
    const stranger = await markRead(outsider, { ids: [page.items[0]!.id] });
    expect(stranger.marked).toBe(0);
  });

  it("creates the daily debtor notice once per day", async () => {
    const day = "2031-03-03";
    const first = await runDailyNotifications(prisma, day);
    expect(first.created).toBeGreaterThan(0);
    const mine = await listNotifications(cashier, { unread: true, page: 1 });
    const debtors = mine.items.find((n) => n.kind === "DEBTORS" && n.params.day === day);
    expect(debtors).toMatchObject({ href: "/students?paymentStatus=DEBTOR" });
    expect(Number(debtors?.params.count)).toBeGreaterThanOrEqual(1);
    const again = await runDailyNotifications(prisma, day);
    expect(again.created).toBe(0);
    await prisma.notification.deleteMany({ where: { params: { path: ["day"], equals: day } } });
  });
});

describe("dashboard finance", () => {
  it("opens the finance overview with dashboard.finance", async () => {
    const year = new Date().getUTCFullYear();
    const overview = await getDashboardFinance(ceo, { branchId: branchA, year });
    expect(overview.income).toBe(100_000);
    expect(overview.yearly).toHaveLength(12);
    await expect(getDashboardFinance(teacher, { year })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
