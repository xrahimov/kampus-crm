/**
 * Lesson packages (A-178) against the real database: a package group writes no
 * monthly charges, selling a package is one payment plus the credits, every
 * PRESENT mark uses one credit (and gives it back when changed), lessons
 * attended with no credit are owed until the next package covers them, the
 * member list and the student's page show what is left, and a monthly group
 * is untouched by any of it.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/server/db/prisma";
import type { Actor } from "@/server/rbac/authorize";
import { createGroup, updateGroup } from "@/server/services/groups/groups.service";
import { markAttendance } from "@/server/services/groups/lessons.service";
import { listMembers } from "@/server/services/groups/memberships.service";
import { getPortal } from "@/server/services/portal/portal.service";
import { createBranch } from "@/server/services/settings/branches.service";
import { createCourse } from "@/server/services/settings/courses.service";
import { createPaymentMethod } from "@/server/services/settings/payment-methods.service";
import { membershipBalances } from "@/server/services/students/balances";
import {
  createLessonPackage,
  deleteLessonPackage,
  listGroupPackages,
  sellPackage,
  updateLessonPackage,
} from "@/server/services/students/packages.service";
import { getPaymentInfo } from "@/server/services/students/payments.service";
import { createStudent, getStudent } from "@/server/services/students/students.service";
import { listStudentLinks } from "@/server/services/video/video.service";

import { DEMO_ORG_ID, demoBranchIds } from "./support/tenant";

const RUN = String(Date.now() % 100_000).padStart(5, "0");
const TAG = `pkg${RUN}`;
const phone = (n: number) => `+99894${RUN}${String(n).padStart(2, "0")}`;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const daysFromNow = (n: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
};
const TODAY = daysFromNow(0);

const ceo: Actor = {
  userId: "",
  fullName: "CEO",
  roles: ["CEO"],
  permissions: ["*"],
  organizationId: DEMO_ORG_ID,
  branchIds: [],
  activeBranchId: null,
};

let branchId: string;
let courseId: string;
let groupId: string;
let monthlyGroupId: string;
let methodId: string;
let membershipId: string;
let monthlyMembershipId: string;
let studentId: string;
let packageId: string;
let pastLessons: string[] = [];

const balance = async (id: string) => (await membershipBalances(prisma, [id])).get(id)!;
const mark = (lessonId: string, status: "PRESENT" | "ABSENT" | "EXCUSED") =>
  markAttendance(ceo, lessonId, [{ membershipId, status }]);

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
  courseId = (
    await createCourse(ceo, {
      branchId,
      name: `${TAG} Course`,
      description: undefined,
      price: 300_000,
      durationMonths: 3,
      gradingSystemId: null,
      color: null,
    })
  ).id;
  const group = (name: string, billingMode: "MONTHLY" | "PACKAGES") =>
    createGroup(ceo, {
      branchId,
      name,
      courseId,
      gradingSystemId: null,
      billingMode,
      weekdayPattern: "EVERY_DAY",
      slots: [1, 2, 3, 4, 5, 6].map((weekday) => ({
        weekday,
        startTime: "10:00",
        endTime: "11:30",
        roomId: null,
      })),
      teachers: [],
      startDate: daysFromNow(-40),
      endDate: null,
      status: "ACTIVE",
    });
  groupId = (await group(`${TAG} Packages`, "PACKAGES")).id;
  monthlyGroupId = (await group(`${TAG} Monthly`, "MONTHLY")).id;
  methodId = (
    await createPaymentMethod(ceo, {
      name: `${TAG} Cash`,
      isActive: true,
      isCash: true,
      sortOrder: 0,
    })
  ).id;
  const student = await createStudent(ceo, {
    branchId,
    fullName: `${TAG} Ali`,
    phone: phone(11),
    birthDate: null,
    gender: "MALE",
    photoUrl: null,
    password: null,
    sourceId: null,
    schoolId: null,
    note: null,
    membership: {
      groupId,
      joinedAt: daysFromNow(-40),
      customPrice: null,
      note: null,
      status: "ACTIVE",
    },
  });
  studentId = student.id;
  membershipId = student.groups[0]!.membershipId;
  monthlyMembershipId = (
    await prisma.groupMembership.create({
      data: {
        groupId: monthlyGroupId,
        studentId,
        status: "ACTIVE",
        joinedAt: new Date(`${daysFromNow(-40)}T00:00:00Z`),
        activatedAt: new Date(`${daysFromNow(-40)}T00:00:00Z`),
      },
    })
  ).id;
  const lessons = await prisma.lesson.findMany({
    where: { groupId, date: { lt: new Date(`${TODAY}T00:00:00Z`) } },
    orderBy: { date: "asc" },
    select: { id: true },
  });
  pastLessons = lessons.map((l) => l.id);
  expect(pastLessons.length).toBeGreaterThan(10);
});

afterAll(async () => {
  await prisma.auditLog.deleteMany({ where: { OR: [{ branchId }, { actorId: ceo.userId }] } });
  await prisma.job.deleteMany({ where: { uniqueKey: { contains: TAG } } });
  await prisma.smsMessage.deleteMany({ where: { studentId } });
  await prisma.payment.deleteMany({ where: { studentId } });
  await prisma.groupMembership.deleteMany({ where: { studentId } });
  await prisma.group.deleteMany({ where: { branchId } });
  await prisma.student.deleteMany({ where: { branchId } });
  await prisma.course.deleteMany({ where: { branchId } });
  await prisma.paymentMethod.deleteMany({ where: { id: methodId } });
  await prisma.user.deleteMany({ where: { id: ceo.userId } });
  await prisma.branch.deleteMany({ where: { id: branchId } });
});

describe("lesson packages", () => {
  it("writes no monthly charges for a package group, while the monthly group is charged", async () => {
    const b = await balance(membershipId);
    expect(b.billingMode).toBe("PACKAGES");
    expect(b.charged).toBe(0);
    expect(b.balance).toBe(0);
    expect(b.monthlyPrice).toBe(0);
    expect(b.nextPaymentDate).toBeNull();
    expect(b.credits).toEqual({ purchased: 0, used: 0, left: 0 });
    const monthly = await balance(monthlyMembershipId);
    expect(monthly.billingMode).toBe("MONTHLY");
    expect(monthly.charged).toBeGreaterThan(0);
    expect(monthly.credits).toBeNull();
  });

  it("manages the packages on offer", async () => {
    const eight = await createLessonPackage(ceo, groupId, {
      name: "8 lessons",
      lessons: 8,
      price: 400_000,
      isActive: true,
      sortOrder: 0,
    });
    packageId = eight.id;
    const four = await createLessonPackage(ceo, groupId, {
      name: "4 lessons",
      lessons: 4,
      price: 220_000,
      isActive: true,
      sortOrder: 1,
    });
    const renamed = await updateLessonPackage(ceo, groupId, four.id, { name: "4 lessons (trial)" });
    expect(renamed.name).toBe("4 lessons (trial)");
    expect(renamed.sold).toBe(0);
    // An unsold package disappears; the offer list keeps the other.
    await deleteLessonPackage(ceo, groupId, four.id);
    const data = await listGroupPackages(ceo, groupId);
    expect(data.packages.map((p) => p.name)).toEqual(["8 lessons"]);
    expect(data.credits).toHaveLength(1);
    expect(data.credits[0]!.left).toBe(0);
    // The pay dialog suggests the cheapest package.
    const info = await getPaymentInfo(ceo, membershipId);
    expect(info.suggestedAmount).toBe(400_000);
  });

  it("sells a package as one payment plus the credits", async () => {
    const sale = await sellPackage(ceo, groupId, {
      membershipId,
      packageId,
      paymentMethodId: methodId,
      paidAt: TODAY,
      comment: null,
    });
    expect(sale.lessons).toBe(8);
    expect(sale.price).toBe(400_000);
    expect(sale.paymentId).toBeTruthy();
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: sale.paymentId! } });
    expect(Number(payment.amount)).toBe(400_000);
    expect(payment.comment).toBe("8 lessons");
    const b = await balance(membershipId);
    expect(b.charged).toBe(400_000);
    expect(b.paid).toBe(400_000);
    expect(b.balance).toBe(0);
    expect(b.credits).toEqual({ purchased: 8, used: 0, left: 8 });
    const data = await listGroupPackages(ceo, groupId);
    expect(data.packages[0]!.sold).toBe(1);
    expect(data.purchases).toHaveLength(1);
    expect(data.purchases[0]!.used).toBe(0);
  });

  it("uses one credit per lesson attended and gives it back when the mark changes", async () => {
    await mark(pastLessons[0]!, "PRESENT");
    await mark(pastLessons[1]!, "PRESENT");
    await mark(pastLessons[2]!, "EXCUSED");
    expect((await balance(membershipId)).credits).toEqual({ purchased: 8, used: 2, left: 6 });
    // Marking the same lesson present twice takes nothing more.
    await mark(pastLessons[0]!, "PRESENT");
    expect((await balance(membershipId)).credits?.left).toBe(6);
    await mark(pastLessons[1]!, "ABSENT");
    expect((await balance(membershipId)).credits?.left).toBe(7);
    const members = await listMembers(ceo, groupId);
    expect(members[0]!.lessonsLeft).toBe(7);
    const monthly = await listMembers(ceo, monthlyGroupId);
    expect(monthly[0]!.lessonsLeft).toBeNull();
    const student = await getStudent(ceo, studentId);
    const card = student.groups.find((g) => g.membershipId === membershipId)!;
    expect(card.lessonsLeft).toBe(7);
  });

  it("owes lessons attended with no credit left and covers them with the next package", async () => {
    // Seven more lessons attended: the eighth of them has no credit.
    for (const lessonId of pastLessons.slice(3, 11)) await mark(lessonId, "PRESENT");
    const owed = await balance(membershipId);
    expect(owed.credits).toEqual({ purchased: 8, used: 9, left: -1 });
    expect(await prisma.packageUse.count({ where: { membershipId, purchaseId: null } })).toBe(1);
    const sale = await sellPackage(ceo, groupId, {
      membershipId,
      packageId,
      paymentMethodId: methodId,
      paidAt: TODAY,
      comment: "second",
    });
    expect(sale.used).toBe(1);
    expect(await prisma.packageUse.count({ where: { membershipId, purchaseId: null } })).toBe(0);
    const b = await balance(membershipId);
    expect(b.credits).toEqual({ purchased: 16, used: 9, left: 7 });
    expect(b.balance).toBe(0);
    // A sold package is deactivated, not deleted.
    await deleteLessonPackage(ceo, groupId, packageId);
    const data = await listGroupPackages(ceo, groupId);
    expect(data.packages[0]).toMatchObject({ id: packageId, isActive: false, sold: 2 });
  });

  it("shows the credits and the offers on the student's own page", async () => {
    await updateLessonPackage(ceo, groupId, packageId, { isActive: true });
    const link = (await listStudentLinks(ceo, groupId))[0]!;
    const portal = await getPortal(link.token);
    expect(portal?.packages).toMatchObject({ purchased: 16, used: 9, lessonsLeft: 7 });
    expect(portal?.packages?.offers).toEqual([
      { id: packageId, name: "8 lessons", lessons: 8, price: 400_000 },
    ]);
    expect(portal?.money.balance).toBe(0);
    // A monthly group's page has no package block.
    const monthlyLink = (await listStudentLinks(ceo, monthlyGroupId))[0]!;
    expect((await getPortal(monthlyLink.token))?.packages).toBeNull();
  });

  it("refuses to sell in a monthly group or an inactive package", async () => {
    await expect(
      sellPackage(ceo, monthlyGroupId, {
        membershipId: monthlyMembershipId,
        packageId,
        paymentMethodId: methodId,
        paidAt: TODAY,
        comment: null,
      }),
    ).rejects.toMatchObject({ message: "errors.billingNotPackages" });
    await updateLessonPackage(ceo, groupId, packageId, { isActive: false });
    await expect(
      sellPackage(ceo, groupId, {
        membershipId,
        packageId,
        paymentMethodId: methodId,
        paidAt: TODAY,
        comment: null,
      }),
    ).rejects.toMatchObject({ message: "errors.packageInactive" });
    // Switching the group back to monthly keeps the purchases in the charged total.
    await updateGroup(ceo, groupId, { billingMode: "MONTHLY" });
    const b = await balance(membershipId);
    expect(b.billingMode).toBe("MONTHLY");
    expect(b.charged).toBeGreaterThan(800_000);
    await updateGroup(ceo, groupId, { billingMode: "PACKAGES" });
  });
});
