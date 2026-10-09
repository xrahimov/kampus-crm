/**
 * Instalments and families (A-123) against the real database: a split month's
 * parts fall due on their own days and only then count as debt, the reminder
 * goes out once before a part's day, siblings share one discount that follows
 * them into new groups, and a discounted current month keeps its price.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/server/db/prisma";
import type { Actor } from "@/server/rbac/authorize";
import { syncDebtCases } from "@/server/services/debts/debts.service";
import { createGroup } from "@/server/services/groups/groups.service";
import { addMember } from "@/server/services/groups/memberships.service";
import { createBranch } from "@/server/services/settings/branches.service";
import { createCourse } from "@/server/services/settings/courses.service";
import { createPaymentMethod } from "@/server/services/settings/payment-methods.service";
import { isoToDate } from "@/server/services/settings/shared";
import { membershipBalances } from "@/server/services/students/balances";
import {
  getStudentFamily,
  linkSibling,
  unlinkStudent,
  updateFamily,
} from "@/server/services/students/families.service";
import { monthStart } from "@/server/services/students/fees";
import {
  clearInstalments,
  getInstalmentPlan,
  runInstalmentReminders,
  setInstalments,
} from "@/server/services/students/instalments.service";
import { createPayment } from "@/server/services/students/payments.service";
import { createStudent } from "@/server/services/students/students.service";

import { DEMO_ORG_ID, demoBranchIds } from "./support/tenant";

const RUN = String(Date.now() % 100_000).padStart(5, "0");
const TAG = `inst${RUN}`;
const phone = (n: number) => `+99895${RUN}${String(n).padStart(2, "0")}`;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const daysFromNow = (n: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
};
const TODAY = daysFromNow(0);
const MONTH = monthStart(TODAY);

const ceo: Actor = {
  userId: "",
  fullName: "CEO",
  roles: ["CEO"],
  permissions: ["*"],
  organizationId: DEMO_ORG_ID,
  branchIds: [],
  activeBranchId: null,
};
/** Edits students and takes payments, but may not give discounts. */
const clerk: Actor = {
  ...ceo,
  fullName: "Clerk",
  roles: ["ADMIN"],
  permissions: ["students.view", "students.update", "payments.create", "groups.view"],
};

let branchId: string;
let groupId: string;
let groupTwoId: string;
let methodId: string;
let savedInstalmentSms: boolean | undefined;

beforeAll(async () => {
  for (const [a, n] of [
    [ceo, 1],
    [clerk, 2],
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
  clerk.branchIds = [branchId];
  await prisma.userBranch.create({ data: { userId: clerk.userId, branchId } });
  const courseId = (
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
  const group = (name: string) =>
    createGroup(ceo, {
      branchId,
      name,
      courseId,
      gradingSystemId: null,
      weekdayPattern: "ODD",
      slots: [1, 3, 5].map((weekday) => ({
        weekday,
        startTime: "10:00",
        endTime: "11:30",
        roomId: null,
      })),
      teachers: [],
      startDate: daysFromNow(-60),
      endDate: null,
      status: "ACTIVE",
    });
  groupId = (await group(`${TAG} Group`)).id;
  groupTwoId = (await group(`${TAG} Group Two`)).id;
  methodId = (
    await createPaymentMethod(ceo, {
      name: `${TAG} Cash`,
      isActive: true,
      isCash: true,
      sortOrder: 0,
    })
  ).id;
  const sms = await prisma.autoSmsSetting.findUnique({
    where: { organizationId_event: { organizationId: DEMO_ORG_ID, event: "INSTALMENT_DUE" } },
  });
  savedInstalmentSms = sms ? sms.isActive : undefined;
  await prisma.autoSmsSetting.upsert({
    where: { organizationId_event: { organizationId: DEMO_ORG_ID, event: "INSTALMENT_DUE" } },
    update: { isActive: true },
    create: {
      organizationId: DEMO_ORG_ID,
      event: "INSTALMENT_DUE",
      template: "{studentName}, {groupName}: {amount} {date}",
      isActive: true,
    },
  });
});

afterAll(async () => {
  if (savedInstalmentSms === undefined) {
    await prisma.autoSmsSetting.deleteMany({
      where: { organizationId: DEMO_ORG_ID, event: "INSTALMENT_DUE" },
    });
  } else {
    await prisma.autoSmsSetting.update({
      where: { organizationId_event: { organizationId: DEMO_ORG_ID, event: "INSTALMENT_DUE" } },
      data: { isActive: savedInstalmentSms },
    });
  }
  const students = await prisma.student.findMany({ where: { branchId }, select: { id: true } });
  const ids = students.map((s) => s.id);
  const users = [ceo.userId, clerk.userId];
  await prisma.auditLog.deleteMany({ where: { OR: [{ branchId }, { actorId: { in: users } }] } });
  await prisma.job.deleteMany({ where: { uniqueKey: { contains: TAG } } });
  await prisma.debtCase.deleteMany({ where: { branchId } });
  await prisma.smsMessage.deleteMany({ where: { studentId: { in: ids } } });
  await prisma.studentTelegramChat.deleteMany({ where: { studentId: { in: ids } } });
  await prisma.payment.deleteMany({ where: { studentId: { in: ids } } });
  await prisma.groupMembership.deleteMany({ where: { studentId: { in: ids } } });
  await prisma.group.deleteMany({ where: { branchId } });
  await prisma.student.deleteMany({ where: { branchId } });
  await prisma.family.deleteMany({ where: { name: { startsWith: TAG } } });
  await prisma.course.deleteMany({ where: { branchId } });
  await prisma.paymentMethod.deleteMany({ where: { id: methodId } });
  await prisma.userBranch.deleteMany({ where: { branchId } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.branch.deleteMany({ where: { id: branchId } });
  await prisma.$disconnect();
});

/** A student active in the first group since the first of this month: one charged month. */
const student = (name: string, n: number) =>
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
    membership: { groupId, joinedAt: MONTH, customPrice: null, note: null, status: "ACTIVE" },
  });

const balance = async (membershipId: string) =>
  (await membershipBalances(prisma, [membershipId])).get(membershipId)!;

describe("instalments", () => {
  it("splits a month into parts that fall due on their own days", async () => {
    const ali = await student("Ali", 11);
    const m = ali.groups[0]!.membershipId;
    const plan = await getInstalmentPlan(ceo, m);
    expect(plan.month).toBe(MONTH);
    expect(plan.amount).toBe(300_000);
    expect(plan.months).toContain(MONTH);
    expect(plan.parts).toEqual([]);

    // The parts must add up to the month's fee, and the month must be one on offer.
    await expect(
      setInstalments(ceo, m, {
        month: MONTH,
        parts: [
          { dueDate: daysFromNow(-1), amount: 100_000 },
          { dueDate: daysFromNow(10), amount: 100_000 },
        ],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(
      setInstalments(ceo, m, {
        month: "2020-01-01",
        parts: [
          { dueDate: "2020-01-05", amount: 150_000 },
          { dueDate: "2020-01-20", amount: 150_000 },
        ],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });

    const set = await setInstalments(ceo, m, {
      month: MONTH,
      parts: [
        { dueDate: daysFromNow(10), amount: 150_000 },
        { dueDate: daysFromNow(-1), amount: 150_000 },
      ],
    });
    expect(set.parts.map((p) => [p.dueDate, p.amount, p.paid])).toEqual([
      [daysFromNow(-1), 150_000, false],
      [daysFromNow(10), 150_000, false],
    ]);

    // The whole month is owed, but only the first part is due today.
    let b = await balance(m);
    expect(b.balance).toBe(-300_000);
    expect(b.deferred).toBe(150_000);
    expect(b.nextPaymentDate).toBe(daysFromNow(-1));
    expect(b.suggestedAmount).toBe(150_000);
    await syncDebtCases(prisma, { studentIds: [ali.id] });
    const open = await prisma.debtCase.findFirst({
      where: { studentId: ali.id, status: { not: "CLOSED" } },
    });
    expect(Number(open?.amount)).toBe(150_000);

    // Paying the first part leaves nothing due until the second part's day.
    await createPayment(ceo, {
      membershipId: m,
      paymentMethodId: methodId,
      amount: 150_000,
      bonus: 0,
      effectiveMonth: MONTH.slice(0, 7),
      paidAt: TODAY,
      comment: null,
    });
    b = await balance(m);
    expect(b.balance).toBe(-150_000);
    expect(b.deferred).toBe(150_000);
    expect(b.nextPaymentDate).toBe(daysFromNow(10));
    expect(b.suggestedAmount).toBe(150_000);
    expect(b.instalments.map((p) => p.paid)).toEqual([true, false]);
    await syncDebtCases(prisma, { studentIds: [ali.id] });
    expect(
      await prisma.debtCase.count({ where: { studentId: ali.id, status: { not: "CLOSED" } } }),
    ).toBe(0);

    // Without the split the rest of the month is due at once.
    const cleared = await clearInstalments(ceo, m, MONTH);
    expect(cleared.parts).toEqual([]);
    b = await balance(m);
    expect(b.deferred).toBe(0);
    expect(b.nextPaymentDate).toBe(MONTH);
    await syncDebtCases(prisma, { studentIds: [ali.id] });
    const reopened = await prisma.debtCase.findFirst({
      where: { studentId: ali.id, status: { not: "CLOSED" } },
    });
    expect(Number(reopened?.amount)).toBe(150_000);

    // Only those who take payments may split a fee.
    await expect(
      setInstalments({ ...clerk, permissions: ["students.view"] }, m, {
        month: MONTH,
        parts: [
          { dueDate: daysFromNow(1), amount: 150_000 },
          { dueDate: daysFromNow(12), amount: 150_000 },
        ],
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("reminds the student once, shortly before a part's day", async () => {
    const bek = await student("Bek", 12);
    const m = bek.groups[0]!.membershipId;
    await prisma.studentTelegramChat.create({
      data: { studentId: bek.id, chatId: `${TAG}-chat`, locale: "uz" },
    });
    const set = await setInstalments(ceo, m, {
      month: MONTH,
      parts: [
        { dueDate: daysFromNow(2), amount: 100_000 },
        { dueDate: daysFromNow(20), amount: 200_000 },
      ],
    });
    const soon = set.parts[0]!;

    const first = await runInstalmentReminders(prisma, TODAY);
    expect(first.reminded).toBe(1);
    const job = await prisma.job.findUnique({
      where: { uniqueKey: `tg:instalment:${soon.id}:${TAG}-chat` },
    });
    expect(job).not.toBeNull();
    // formatMoneyUz groups thousands with a non-breaking space.
    expect(JSON.stringify(job!.payload)).toMatch(/100\D000/);
    const sms = await prisma.smsMessage.findUnique({ where: { refKey: `instalment:${soon.id}` } });
    expect(sms?.studentId).toBe(bek.id);
    expect(sms?.text).toMatch(/100\D000/);
    const row = await prisma.instalment.findUniqueOrThrow({ where: { id: soon.id } });
    expect(row.remindedAt).not.toBeNull();

    // Each part is reminded once; the later part is not due for a while.
    const again = await runInstalmentReminders(prisma, TODAY);
    expect(again.reminded).toBe(0);
  });
});

describe("families", () => {
  it("links siblings, shares one discount and follows them into new groups", async () => {
    const cho = await student("Cho", 13);
    const dil = await student("Dil", 14);
    const eli = await student("Eli", 15);
    const far = await student("Far", 16);
    const gul = await student("Gul", 17);

    await expect(linkSibling(ceo, cho.id, { studentId: cho.id })).rejects.toMatchObject({
      code: "VALIDATION",
    });
    await expect(
      linkSibling(clerk, cho.id, { studentId: dil.id, discountPercent: 10 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const family = await linkSibling(ceo, cho.id, {
      studentId: dil.id,
      name: `${TAG} family`,
      discountPercent: 10,
    });
    expect(family.name).toBe(`${TAG} family`);
    expect(family.discountPercent).toBe(10);
    expect(family.members.map((s) => s.id).sort()).toEqual([cho.id, dil.id].sort());
    expect(family.members.every((s) => s.groups.includes(`${TAG} Group`))).toBe(true);

    const mc = cho.groups[0]!.membershipId;
    const b = await balance(mc);
    expect(b.monthlyPrice).toBe(270_000);
    expect(b.discount?.familyId).toBe(family.id);
    expect(b.discount?.percent).toBe(10);
    // The month already charged keeps its price.
    expect(b.charged).toBe(300_000);

    // Anyone who edits students may add a sibling to an existing family.
    const bigger = await linkSibling(clerk, eli.id, { studentId: cho.id });
    expect(bigger.id).toBe(family.id);
    expect(bigger.members).toHaveLength(3);
    expect(await prisma.discount.count({ where: { familyId: family.id } })).toBe(3);
    expect(await getStudentFamily(ceo, eli.id)).toMatchObject({ id: family.id });

    // A member of one family cannot be pulled into another.
    const other = await linkSibling(ceo, far.id, { studentId: gul.id });
    expect(other.name).toBe(`${TAG} Far`);
    expect(other.discountPercent).toBe(0);
    await expect(linkSibling(ceo, far.id, { studentId: cho.id })).rejects.toMatchObject({
      code: "CONFLICT",
    });

    // A new group gets the family discount too.
    const added = await addMember(ceo, groupTwoId, {
      studentId: cho.id,
      status: "ACTIVE",
      joinedAt: TODAY,
      billingFrom: null,
      customPrice: null,
      note: null,
    });
    expect(
      await prisma.discount.count({ where: { familyId: family.id, membershipId: added.id } }),
    ).toBe(1);
    expect((await balance(added.id)).monthlyPrice).toBe(270_000);

    // A new percent replaces the rows; only a discount giver may change it.
    await expect(
      updateFamily(clerk, family.id, { name: `${TAG} family`, discountPercent: 20, note: null }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const renamed = await updateFamily(clerk, family.id, {
      name: `${TAG} family renamed`,
      discountPercent: 10,
      note: "three kids",
    });
    expect(renamed.name).toBe(`${TAG} family renamed`);
    const updated = await updateFamily(ceo, family.id, {
      name: `${TAG} family renamed`,
      discountPercent: 20,
      note: "three kids",
    });
    expect(updated.discountPercent).toBe(20);
    const rows = await prisma.discount.findMany({ where: { familyId: family.id } });
    expect(rows).toHaveLength(4);
    expect(rows.every((r) => Number(r.discountedPrice) === 240_000)).toBe(true);
    expect((await balance(mc)).monthlyPrice).toBe(240_000);

    // Leaving the family ends the discount; the last one out takes the family with them.
    await unlinkStudent(ceo, eli.id);
    expect(
      await prisma.discount.count({
        where: { familyId: family.id, membership: { studentId: eli.id } },
      }),
    ).toBe(0);
    expect(await getStudentFamily(ceo, eli.id)).toBeNull();
    expect((await getStudentFamily(ceo, cho.id))!.members).toHaveLength(2);
    await unlinkStudent(ceo, cho.id);
    await unlinkStudent(ceo, dil.id);
    expect(await prisma.family.findUnique({ where: { id: family.id } })).toBeNull();
    expect(await prisma.discount.count({ where: { familyId: family.id } })).toBe(0);
    expect((await balance(mc)).monthlyPrice).toBe(300_000);
  });
});

describe("balance engine", () => {
  it("keeps a discounted current month at its price when the month is recomputed", async () => {
    const hur = await createStudent(ceo, {
      branchId,
      fullName: `${TAG} Hur`,
      phone: phone(18),
      birthDate: null,
      gender: "FEMALE",
      photoUrl: null,
      password: null,
      sourceId: null,
      schoolId: null,
      note: null,
      membership: null,
    });
    // The discount exists before the month's charge is first written.
    const m = await prisma.groupMembership.create({
      data: {
        groupId,
        studentId: hur.id,
        status: "ACTIVE",
        joinedAt: isoToDate(MONTH),
        activatedAt: isoToDate(MONTH),
      },
    });
    await prisma.discount.create({
      data: {
        membershipId: m.id,
        discountedPrice: 200_000,
        amount: 100_000,
        months: 2,
        givenAt: isoToDate(MONTH),
      },
    });
    const first = await balance(m.id);
    expect(first.charged).toBe(200_000);
    const second = await balance(m.id);
    expect(second.charged).toBe(200_000);
    expect(second.discount?.remainingMonths).toBe(1);
  });
});
