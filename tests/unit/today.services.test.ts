/**
 * The teacher's day (A-113) against the real database: the day's lessons with
 * their rosters, one-tap marks, the homework quick form, the next lesson and
 * the debtors of the user's groups, each in the user's own scope.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/rbac/default-roles";
import { prisma } from "@/server/db/prisma";
import type { Actor } from "@/server/rbac/authorize";
import { createGroup } from "@/server/services/groups/groups.service";
import { markAttendance } from "@/server/services/groups/lessons.service";
import { setHomework } from "@/server/services/homework/homework.service";
import { createBranch } from "@/server/services/settings/branches.service";
import { createCourse } from "@/server/services/settings/courses.service";
import { createStudent } from "@/server/services/students/students.service";
import { getToday, nowInTashkent } from "@/server/services/today/today.service";

import { DEMO_ORG_ID, demoBranchIds } from "./support/tenant";

const RUN = String(Date.now() % 100_000).padStart(5, "0");
const TAG = `day${RUN}`;
const phone = (n: number) => `+99898${RUN}${String(n).padStart(2, "0")}`;
const daysAgo = (n: number) => {
  const d = new Date(Date.now() + 5 * 60 * 60 * 1000);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};
const TODAY = nowInTashkent().date;

const ceo: Actor = {
  userId: "",
  fullName: "CEO",
  roles: ["CEO"],
  permissions: ["*"],
  organizationId: DEMO_ORG_ID,
  branchIds: [],
  activeBranchId: null,
};
const teacher: Actor = {
  ...ceo,
  fullName: "Teacher",
  roles: ["TEACHER"],
  permissions: [...DEFAULT_ROLE_PERMISSIONS.TEACHER],
};
const outsider: Actor = { ...teacher, fullName: "Outsider" };
const cashier: Actor = {
  ...ceo,
  fullName: "Cashier",
  roles: ["CASHIER"],
  permissions: ["payments.create"],
};

let branchId: string;
let groupId: string;
let aliceMembership: string;

beforeAll(async () => {
  for (const [a, n] of [
    [ceo, 1],
    [teacher, 2],
    [outsider, 3],
    [cashier, 4],
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
  for (const a of [teacher, outsider, cashier]) a.branchIds = [branchId];
  await prisma.userBranch.createMany({
    data: [teacher, outsider, cashier].map((a) => ({ userId: a.userId, branchId })),
  });
  const teacherRole = await prisma.role.findUniqueOrThrow({ where: { code: "TEACHER" } });
  await prisma.userRole.createMany({
    data: [teacher, outsider].map((a) => ({ userId: a.userId, roleId: teacherRole.id })),
  });
  const courseId = (
    await createCourse(ceo, {
      branchId,
      name: `${TAG} Course`,
      description: undefined,
      price: 500_000,
      durationMonths: 2,
      gradingSystemId: null,
      color: "#0F766E",
    })
  ).id;
  // A lesson every day of the week, so whatever day the suite runs on has one.
  groupId = (
    await createGroup(ceo, {
      branchId,
      name: `${TAG} Group`,
      courseId,
      gradingSystemId: null,
      weekdayPattern: "CUSTOM",
      slots: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
        weekday,
        startTime: "23:00",
        endTime: "23:45",
        roomId: null,
      })),
      teachers: [{ userId: teacher.userId, role: "MAIN", shareType: "PERCENT", shareValue: 40 }],
      startDate: daysAgo(10),
      endDate: null,
      status: "ACTIVE",
    })
  ).id;
  const student = (name: string, n: number, status: "ACTIVE" | "FROZEN") =>
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
      membership: { groupId, joinedAt: daysAgo(10), customPrice: null, note: null, status },
    });
  const alice = await student("Alice", 11, "ACTIVE");
  aliceMembership = alice.groups[0]!.membershipId;
  await student("Bob", 12, "ACTIVE");
  await student("Carol", 13, "FROZEN");
});

afterAll(async () => {
  const students = await prisma.student.findMany({ where: { branchId }, select: { id: true } });
  const ids = students.map((s) => s.id);
  const users = [ceo, teacher, outsider, cashier].map((a) => a.userId);
  await prisma.auditLog.deleteMany({ where: { OR: [{ branchId }, { actorId: { in: users } }] } });
  await prisma.smsMessage.deleteMany({ where: { studentId: { in: ids } } });
  await prisma.coinTransaction.deleteMany({ where: { studentId: { in: ids } } });
  await prisma.debtCase.deleteMany({ where: { branchId } });
  await prisma.groupMembership.deleteMany({ where: { studentId: { in: ids } } });
  await prisma.group.deleteMany({ where: { branchId } });
  await prisma.student.deleteMany({ where: { branchId } });
  await prisma.course.deleteMany({ where: { branchId } });
  await prisma.userBranch.deleteMany({ where: { branchId } });
  await prisma.userRole.deleteMany({ where: { userId: { in: users } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.branch.deleteMany({ where: { id: branchId } });
  await prisma.$disconnect();
});

describe("helpers", () => {
  it("tells the calendar day and the clock in Tashkent", () => {
    expect(nowInTashkent(new Date("2026-10-09T20:30:00Z"))).toEqual({
      date: "2026-10-10",
      time: "01:30",
    });
    expect(nowInTashkent(new Date("2026-10-09T05:00:00Z"))).toEqual({
      date: "2026-10-09",
      time: "10:00",
    });
  });
});

describe("the teacher's day", () => {
  it("lists the day's lesson with its roster, the next lesson and the debtors", async () => {
    const day = await getToday(teacher);
    expect(day.date).toBe(TODAY);
    expect(day.today).toBe(TODAY);
    expect(day.canMark).toBe(true);
    expect(day.canSeeBalances).toBe(true);
    const lesson = day.lessons.find((l) => l.groupId === groupId);
    expect(lesson).toBeDefined();
    expect(lesson).toMatchObject({
      groupName: `${TAG} Group`,
      courseName: `${TAG} Course`,
      color: "#0F766E",
      startTime: "23:00",
      endTime: "23:45",
      roomName: null,
      isExtra: false,
      teacherNames: [`${TAG} Teacher`],
      present: 0,
      marked: 0,
      homework: null,
    });
    // Frozen Carol is not expected in the room.
    expect(lesson!.members.map((m) => m.fullName)).toEqual([`${TAG} Alice`, `${TAG} Bob`]);
    expect(lesson!.members.every((m) => m.attendance === "NOT_MARKED")).toBe(true);
    expect(lesson!.members[0]!.balance).toBeLessThan(0);

    expect(day.next).not.toBeNull();
    expect(day.next!.groupId).toBe(groupId);
    expect(day.next!.date >= TODAY).toBe(true);

    // Everyone who joined ten days ago owes a month, Carol included (frozen still owes).
    const mine = day.debtors.filter((d) => d.groupId === groupId);
    expect(mine.map((d) => d.fullName).sort()).toEqual([
      `${TAG} Alice`,
      `${TAG} Bob`,
      `${TAG} Carol`,
    ]);
    expect(mine.every((d) => d.amount > 0)).toBe(true);
    expect(day.debtorCount).toBeGreaterThanOrEqual(3);
    expect(day.debtTotal).toBeGreaterThan(0);
  });

  it("shows marks and homework made from the card", async () => {
    const before = await getToday(teacher);
    const lesson = before.lessons.find((l) => l.groupId === groupId)!;
    await markAttendance(teacher, lesson.id, [
      { membershipId: aliceMembership, status: "PRESENT" },
    ]);
    await setHomework(teacher, lesson.id, {
      text: "Read page 5",
      linkUrl: null,
      attachmentUrl: null,
      dueDate: null,
    });
    const after = await getToday(teacher);
    const updated = after.lessons.find((l) => l.id === lesson.id)!;
    expect(updated.present).toBe(1);
    expect(updated.marked).toBe(1);
    expect(updated.members.find((m) => m.membershipId === aliceMembership)!.attendance).toBe(
      "PRESENT",
    );
    expect(updated.homework).toMatchObject({ text: "Read page 5", submitted: 0, toCheck: 0 });
  });

  it("keeps each teacher to their own groups and the office in the branch", async () => {
    const other = await getToday(outsider);
    expect(other.lessons.some((l) => l.groupId === groupId)).toBe(false);
    expect(other.debtors.some((d) => d.groupId === groupId)).toBe(false);
    const office = await getToday(ceo);
    expect(office.lessons.some((l) => l.groupId === groupId)).toBe(true);
  });

  it("takes another day, refuses a bad one and anyone without groups", async () => {
    const yesterday = await getToday(teacher, daysAgo(1));
    expect(yesterday.date).toBe(daysAgo(1));
    expect(yesterday.today).toBe(TODAY);
    expect(yesterday.lessons.some((l) => l.groupId === groupId)).toBe(true);
    await expect(getToday(teacher, "2026-13-45")).rejects.toMatchObject({ status: 400 });
    await expect(getToday(cashier)).rejects.toMatchObject({ status: 403 });
  });
});
