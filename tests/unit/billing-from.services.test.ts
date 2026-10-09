/**
 * "Charged from" (A-110) against the real database: a membership keeps its join
 * date while charging starts on the chosen day; moving the day re-bases the
 * charges; the member import takes the column by header; CSV uploads parse.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/server/db/prisma";
import { parseCsv } from "@/server/excel/exports";
import type { Actor } from "@/server/rbac/authorize";
import { createGroup } from "@/server/services/groups/groups.service";
import { addMember, updateMembership } from "@/server/services/groups/memberships.service";
import { createBranch } from "@/server/services/settings/branches.service";
import { createCourse } from "@/server/services/settings/courses.service";
import { dateToIso } from "@/server/services/settings/shared";
import { membershipBalances } from "@/server/services/students/balances";
import { addMonthsIso, monthStart } from "@/server/services/students/fees";
import { importMembers } from "@/server/services/students/import.service";
import { createStudent, getStudent } from "@/server/services/students/students.service";

import { DEMO_ORG_ID, demoBranchIds } from "./support/tenant";

const RUN = String(Date.now() % 100_000).padStart(5, "0");
const TAG = `bill${RUN}`;
const phone = (n: number) => `+99895${RUN}${String(n).padStart(2, "0")}`;
const PRICE = 400_000;
/** This month and the one before it, so the group is running whenever the suite runs. */
const MONTH = monthStart(dateToIso(new Date()));
const PREVIOUS = addMonthsIso(MONTH, -1);
const MID_MONTH = `${MONTH.slice(0, 8)}15`;

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
  const courseId = (
    await createCourse(ceo, {
      branchId,
      name: `${TAG} Course`,
      description: undefined,
      price: PRICE,
      durationMonths: 4,
      gradingSystemId: null,
      color: null,
    })
  ).id;
  const teacher = await prisma.user.create({
    data: {
      phone: phone(2),
      fullName: `${TAG} Teacher`,
      passwordHash: "x",
      organizationId: DEMO_ORG_ID,
    },
  });
  const teacherRole = await prisma.role.findUniqueOrThrow({ where: { code: "TEACHER" } });
  await prisma.userRole.create({ data: { userId: teacher.id, roleId: teacherRole.id } });
  groupId = (
    await createGroup(ceo, {
      branchId,
      name: `${TAG} Group`,
      courseId,
      gradingSystemId: null,
      weekdayPattern: "ODD",
      slots: [1, 3, 5].map((weekday) => ({
        weekday,
        startTime: "10:00",
        endTime: "11:30",
        roomId: null,
      })),
      teachers: [{ userId: teacher.id, role: "MAIN", shareType: "PERCENT", shareValue: 40 }],
      startDate: PREVIOUS,
      endDate: null,
      status: "ACTIVE",
    })
  ).id;
});

afterAll(async () => {
  const students = await prisma.student.findMany({ where: { branchId }, select: { id: true } });
  const ids = students.map((s) => s.id);
  await prisma.auditLog.deleteMany({ where: { OR: [{ branchId }, { actorId: ceo.userId }] } });
  await prisma.groupMembership.deleteMany({ where: { studentId: { in: ids } } });
  await prisma.group.deleteMany({ where: { branchId } });
  await prisma.student.deleteMany({ where: { branchId } });
  await prisma.course.deleteMany({ where: { branchId } });
  await prisma.userBranch.deleteMany({ where: { branchId } });
  await prisma.userRole.deleteMany({ where: { user: { phone: { startsWith: `+99895${RUN}` } } } });
  await prisma.user.deleteMany({ where: { phone: { startsWith: `+99895${RUN}` } } });
  await prisma.branch.deleteMany({ where: { id: branchId } });
  await prisma.$disconnect();
});

const student = (name: string, n: number) =>
  createStudent(ceo, {
    branchId,
    fullName: `${TAG} ${name}`,
    phone: phone(n),
    gender: "MALE",
    birthDate: null,
    note: null,
  });

const chargeMonths = async (membershipId: string) =>
  (await prisma.charge.findMany({ where: { membershipId }, orderBy: { month: "asc" } })).map(
    (c) => ({ month: dateToIso(c.month), amount: Number(c.amount) }),
  );

describe("charged from (A-110)", () => {
  it("charges from the chosen day, not the join date, and re-bases when the day moves", async () => {
    const alice = await student("Alice", 11);
    const m = await addMember(ceo, groupId, {
      studentId: alice.id,
      joinedAt: PREVIOUS,
      billingFrom: MONTH,
      status: "ACTIVE",
    });
    expect(m.joinedAt).toBe(PREVIOUS);
    expect(m.billingFrom).toBe(MONTH);

    // Only this month is charged, in full: the previous month belongs to the old system.
    let balance = (await membershipBalances(prisma, [m.id])).get(m.id)!;
    expect(await chargeMonths(m.id)).toEqual([{ month: MONTH, amount: PRICE }]);
    expect(balance.charged).toBe(PRICE);
    expect(balance.balance).toBe(-PRICE);

    // Clearing the day goes back to the join date: the previous month is charged too.
    await updateMembership(ceo, m.id, { billingFrom: null });
    balance = (await membershipBalances(prisma, [m.id])).get(m.id)!;
    expect(await chargeMonths(m.id)).toEqual([
      { month: PREVIOUS, amount: PRICE },
      { month: MONTH, amount: PRICE },
    ]);
    expect(balance.charged).toBe(2 * PRICE);

    // Mid-month: the earlier month's charge goes, this month is pro-rated from the 15th.
    const updated = await updateMembership(ceo, m.id, { billingFrom: MID_MONTH });
    expect(updated.billingFrom).toBe(MID_MONTH);
    expect(updated.joinedAt).toBe(PREVIOUS);
    const lessons = (
      await prisma.lesson.findMany({ where: { groupId }, select: { date: true } })
    ).map((l) => dateToIso(l.date));
    const inMonth = lessons.filter((d) => d >= MONTH && d < addMonthsIso(MONTH, 1));
    const counted = inMonth.filter((d) => d >= MID_MONTH);
    expect(counted.length).toBeGreaterThan(0);
    expect(counted.length).toBeLessThan(inMonth.length);
    expect(await chargeMonths(m.id)).toEqual([
      { month: MONTH, amount: Math.round((PRICE * counted.length) / inMonth.length) },
    ]);
    balance = (await membershipBalances(prisma, [m.id])).get(m.id)!;
    expect(balance.charged).toBe(Math.round((PRICE * counted.length) / inMonth.length));

    // The change is in the audit trail with both values.
    const log = await prisma.auditLog.findFirst({
      where: { entity: "GroupMembership", entityId: m.id, action: "membership.update" },
      orderBy: { createdAt: "desc" },
    });
    expect(log?.after).toMatchObject({ billingFrom: MID_MONTH });
  });

  it("is optional on the add-student dialog's membership and shows on the student's group", async () => {
    const bob = await createStudent(ceo, {
      branchId,
      fullName: `${TAG} Bob`,
      phone: phone(12),
      gender: "MALE",
      birthDate: null,
      note: null,
      membership: {
        groupId,
        joinedAt: PREVIOUS,
        billingFrom: MONTH,
        customPrice: null,
        note: null,
        status: "ACTIVE",
      },
    });
    const detail = await getStudent(ceo, bob.id);
    expect(detail.groups[0]).toMatchObject({ joinedAt: PREVIOUS, billingFrom: MONTH });
    const carol = await createStudent(ceo, {
      branchId,
      fullName: `${TAG} Carol`,
      phone: phone(13),
      gender: "FEMALE",
      birthDate: null,
      note: null,
      membership: { groupId, joinedAt: MONTH, customPrice: null, note: null, status: "ACTIVE" },
    });
    expect((await getStudent(ceo, carol.id)).groups[0]?.billingFrom).toBeNull();
  });

  it("imports the column by header and still takes the old five-column file", async () => {
    const dave = await student("Dave", 14);
    const result = await importMembers(ceo, groupId, [
      ["Telefon", "Hisob boshlanishi", "Qo'shilgan sana", "Ism"],
      [phone(14), `15.${MONTH.slice(5, 7)}.${MONTH.slice(0, 4)}`, PREVIOUS, ""],
      ["", "", PREVIOUS, `${TAG} Erin`],
      ["", "yesterday", PREVIOUS, `${TAG} Frank`],
    ]);
    expect(result.skipped).toEqual([{ row: 4, reason: "billingFrom: validation.date" }]);
    expect(result.imported).toBe(2);
    const members = await prisma.groupMembership.findMany({
      where: { groupId, student: { fullName: { in: [`${TAG} Dave`, `${TAG} Erin`] } } },
      include: { student: { select: { fullName: true } } },
    });
    const byName = Object.fromEntries(members.map((m) => [m.student.fullName, m]));
    expect(byName[`${TAG} Dave`]?.studentId).toBe(dave.id);
    expect(dateToIso(byName[`${TAG} Dave`]!.billingFrom!)).toBe(MID_MONTH);
    expect(dateToIso(byName[`${TAG} Dave`]!.joinedAt)).toBe(PREVIOUS);
    expect(byName[`${TAG} Erin`]?.billingFrom).toBeNull();

    const old = await importMembers(ceo, groupId, [
      ["Full name", "Phone", "Joined", "Custom price", "Note"],
      [`${TAG} Grace`, "", PREVIOUS, "350000", "old template"],
    ]);
    expect(old).toEqual({ imported: 1, skipped: [] });
    const grace = await prisma.groupMembership.findFirst({
      where: { groupId, student: { fullName: `${TAG} Grace` } },
    });
    expect(grace?.billingFrom).toBeNull();
    expect(grace?.customPrice?.toNumber()).toBe(350_000);
  });

  it("parses CSV exports with either separator, quotes and a BOM", () => {
    expect(parseCsv('﻿name;phone;balance\r\n"Doe, John";+998901234567;-120000\r\n')).toEqual([
      ["name", "phone", "balance"],
      ["Doe, John", "+998901234567", "-120000"],
    ]);
    expect(parseCsv('a,b\n"say ""hi""",2\n\n')).toEqual([["a", "b"], ['say "hi"', "2"], [""]]);
    expect(parseCsv("x\ty\n1\t2")).toEqual([
      ["x", "y"],
      ["1", "2"],
    ]);
  });
});
