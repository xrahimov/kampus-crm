/**
 * The student portal behind a membership's personal link: what one student
 * sees (their own marks, money and results) and what they never see.
 * Rows carry a run-specific tag and are removed at the end.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/rbac/default-roles";
import { prisma } from "@/server/db/prisma";
import type { Actor } from "@/server/rbac/authorize";
import { createGroup } from "@/server/services/groups/groups.service";
import { addMember } from "@/server/services/groups/memberships.service";
import { getPortal } from "@/server/services/portal/portal.service";
import { createBranch } from "@/server/services/settings/branches.service";
import { createCourse } from "@/server/services/settings/courses.service";
import { listStudentLinks } from "@/server/services/video/video.service";

const RUN = String(Date.now() % 100_000).padStart(5, "0");
const TAG = `p${RUN}`;
const phone = (n: number) => `+99895${RUN}${String(n).padStart(2, "0")}`;

const ceo: Actor = {
  userId: "",
  fullName: "CEO",
  roles: ["CEO"],
  permissions: ["*"],
  branchIds: [],
  activeBranchId: null,
};
const teacher: Actor = {
  userId: "",
  fullName: "Teacher",
  roles: ["TEACHER"],
  permissions: [...DEFAULT_ROLE_PERMISSIONS.TEACHER],
  branchIds: [],
  activeBranchId: null,
};

let branchId: string;
let groupId: string;
let membershipOne: string;
let membershipTwo: string;
let tokenOne: string;

beforeAll(async () => {
  const teacherRole = await prisma.role.findFirstOrThrow({ where: { code: "TEACHER" } });
  for (const [a, n, withRole] of [
    [ceo, 1, false],
    [teacher, 2, true],
  ] as const) {
    const user = await prisma.user.create({
      data: { phone: phone(n), fullName: `${TAG} ${a.fullName}`, passwordHash: "x" },
    });
    a.userId = user.id;
    if (withRole) {
      await prisma.userRole.create({ data: { userId: user.id, roleId: teacherRole.id } });
    }
  }
  branchId = (await createBranch(ceo, { name: `${TAG} A`, isActive: true })).id;
  ceo.activeBranchId = branchId;
  await prisma.userBranch.create({ data: { userId: teacher.userId, branchId } });
  teacher.branchIds = [branchId];
  const courseId = (
    await createCourse(ceo, {
      branchId,
      name: `${TAG} German`,
      description: undefined,
      price: 300_000,
      durationMonths: 2,
      gradingSystemId: null,
      color: null,
    })
  ).id;
  groupId = (
    await createGroup(ceo, {
      branchId,
      name: `${TAG} A1`,
      courseId,
      gradingSystemId: null,
      weekdayPattern: "ODD",
      slots: [1, 3, 5].map((weekday) => ({
        weekday,
        startTime: "18:00",
        endTime: "19:30",
        roomId: null,
      })),
      teachers: [{ userId: teacher.userId, role: "MAIN", shareType: "PERCENT", shareValue: 40 }],
      startDate: "2026-09-01",
      endDate: null,
      status: "ACTIVE",
    })
  ).id;
  const one = await addMember(ceo, groupId, {
    newStudent: { fullName: `${TAG} Student One`, phone: phone(11) },
    joinedAt: "2026-09-01",
    status: "ACTIVE",
    customPrice: null,
    note: null,
  });
  membershipOne = one.id;
  const two = await addMember(ceo, groupId, {
    newStudent: { fullName: `${TAG} Student Two` },
    joinedAt: "2026-09-01",
    status: "ACTIVE",
    customPrice: null,
    note: null,
  });
  membershipTwo = two.id;

  // Two past lessons: student one present with a grade, then absent; student two present twice.
  const lessons = await prisma.lesson.findMany({
    where: { groupId, date: { lt: new Date() } },
    orderBy: { date: "asc" },
    take: 2,
  });
  expect(lessons).toHaveLength(2);
  const [first, second] = lessons as [(typeof lessons)[0], (typeof lessons)[0]];
  await prisma.attendance.createMany({
    data: [
      { lessonId: first.id, membershipId: membershipOne, status: "PRESENT" },
      { lessonId: second.id, membershipId: membershipOne, status: "ABSENT" },
      { lessonId: first.id, membershipId: membershipTwo, status: "PRESENT" },
      { lessonId: second.id, membershipId: membershipTwo, status: "PRESENT" },
    ],
  });
  await prisma.grade.createMany({
    data: [
      { lessonId: first.id, membershipId: membershipOne, score: 4, comment: "Gut" },
      { lessonId: first.id, membershipId: membershipTwo, score: 5 },
    ],
  });
  await prisma.payment.create({
    data: {
      studentId: one.studentId,
      membershipId: membershipOne,
      branchId,
      amount: 300_000,
      effectiveMonth: new Date("2026-09-01"),
      paidAt: new Date("2026-09-02"),
    },
  });
  tokenOne = (await listStudentLinks(teacher, groupId)).find(
    (l) => l.membershipId === membershipOne,
  )!.token;
});

afterAll(async () => {
  await prisma.payment.deleteMany({
    where: { membershipId: { in: [membershipOne, membershipTwo] } },
  });
  // Guarded: a setup that failed early must not turn these into table-wide deletes.
  if (groupId) await prisma.group.deleteMany({ where: { id: groupId } });
  await prisma.student.deleteMany({ where: { fullName: { startsWith: TAG } } });
  await prisma.course.deleteMany({ where: { name: { startsWith: TAG } } });
  await prisma.user.deleteMany({ where: { fullName: { startsWith: TAG } } });
  if (branchId) await prisma.branch.deleteMany({ where: { id: branchId } });
});

describe("student portal", () => {
  it("shows the student their own lessons, marks, money and group", async () => {
    const portal = await getPortal(tokenOne);
    expect(portal).not.toBeNull();
    expect(portal!.student.fullName).toBe(`${TAG} Student One`);
    expect(portal!.group).toMatchObject({ name: `${TAG} A1`, courseName: `${TAG} German` });
    expect(portal!.group.teachers).toEqual([`${TAG} Teacher`]);

    const marked = portal!.lessons.filter((l) => l.attendance);
    expect(marked.map((l) => l.attendance)).toEqual(["ABSENT", "PRESENT"]); // newest first
    const graded = portal!.lessons.find((l) => l.grade !== null)!;
    expect(graded).toMatchObject({ grade: 4, gradeComment: "Gut", attendance: "PRESENT" });
    expect(portal!.stats).toEqual({ lessonsHeld: 2, attendancePercent: 50, gradeAverage: 4 });

    expect(portal!.money.monthlyPrice).toBe(300_000);
    expect(portal!.money.payments).toHaveLength(1);
    expect(portal!.money.payments[0]).toMatchObject({ amount: 300_000, paidAt: "2026-09-02" });
    // Charged for September and October so far, paid once.
    expect(portal!.money.balance).toBeLessThan(0);

    expect(portal!.nextLesson).not.toBeNull();
    expect(portal!.nextLesson!.date >= new Date().toISOString().slice(0, 10)).toBe(true);
    expect(portal!.exams).toEqual([]);
    expect(portal!.tests).toEqual([]);
    expect(portal!.student.coins).toBe(0);
  });

  it("never mixes in another student's marks", async () => {
    const portal = await getPortal(tokenOne);
    // Student two has two PRESENT marks and a 5; none of that reaches student one's page.
    expect(portal!.lessons.filter((l) => l.grade === 5)).toHaveLength(0);
    expect(portal!.lessons.filter((l) => l.attendance === "PRESENT")).toHaveLength(1);
  });

  it("is gone with the link", async () => {
    expect(await getPortal("not-a-real-token-at-all-123")).toBeNull();
    await prisma.groupMembership.update({
      where: { id: membershipOne },
      data: { status: "ARCHIVED" },
    });
    expect(await getPortal(tokenOne)).toBeNull();
  });
});
