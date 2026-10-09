/**
 * Cashier day close (A-122) against the real database, inside a centre of its own:
 * a cashier's day by payment method (payments, a refund, an expense and an income
 * paid from the drawer), the expected cash from the methods marked as cash, the
 * close with its difference, who sees whose closes, the hand-over and the locks.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/server/db/prisma";
import { isAppError } from "@/server/errors/app-error";
import type { Actor } from "@/server/rbac/authorize";
import {
  acceptCashClose,
  closeCashDay,
  countCashCloses,
  getCashClose,
  listCashCloses,
  previewCashDay,
  tashkentDate,
} from "@/server/services/finance/cash-close.service";
import { createCategory } from "@/server/services/finance/categories.service";
import { createEntry } from "@/server/services/finance/entries.service";
import { createGroup } from "@/server/services/groups/groups.service";
import { createCourse } from "@/server/services/settings/courses.service";
import { createOrganization } from "@/server/services/settings/organizations.service";
import { createPaymentMethod } from "@/server/services/settings/payment-methods.service";
import { createRoom } from "@/server/services/settings/rooms.service";
import { createPayment, refundPayment } from "@/server/services/students/payments.service";
import { createStudent } from "@/server/services/students/students.service";

import { DEMO_ORG_ID, demoBranchIds } from "./support/tenant";

const RUN = String(Date.now() % 100_000).padStart(5, "0");
const TAG = `cc${RUN}`;
const phone = (n: number) => `+99893${RUN}${String(n).padStart(2, "0")}`;
const today = tashkentDate();
const month = `${today.slice(0, 7)}-01`;

const owner: Actor = {
  userId: "",
  fullName: "Owner",
  organizationId: DEMO_ORG_ID,
  roles: ["CEO"],
  permissions: ["*"],
  branchIds: [],
  activeBranchId: null,
  isSiteOwner: true,
};
let ceo: Actor;
let cashier: Actor;
let organizationId = "";
let branchId = "";
let otherBranchId = "";
let cashId = "";
let cardId = "";
let membershipId = "";
let cashPaymentId = "";

const code = (error: unknown) => (isAppError(error) ? error.code : String(error));
const field = (error: unknown, name: string) =>
  isAppError(error) ? error.fields?.[name]?.[0] : undefined;

beforeAll(async () => {
  const user = await prisma.user.create({
    data: {
      phone: phone(1),
      fullName: `${TAG} Owner`,
      passwordHash: "x",
      organizationId: DEMO_ORG_ID,
      isSiteOwner: true,
    },
  });
  owner.userId = user.id;
  owner.branchIds = await demoBranchIds();
  const org = await createOrganization(owner, {
    name: `${TAG} Centre`,
    branches: [`${TAG} Main`, `${TAG} Second`],
    ceoFullName: `${TAG} Director`,
    ceoPhone: phone(2),
    ceoPassword: "FirstPass!2026",
  });
  organizationId = org.id;
  branchId = org.branches[0]!.id;
  otherBranchId = org.branches[1]!.id;
  const ceoUser = await prisma.user.findUniqueOrThrow({ where: { phone: phone(2) } });
  ceo = {
    userId: ceoUser.id,
    fullName: `${TAG} Director`,
    organizationId,
    roles: ["CEO"],
    permissions: ["*"],
    branchIds: [branchId, otherBranchId],
    activeBranchId: null,
  };
  const cashierUser = await prisma.user.create({
    data: {
      phone: phone(3),
      fullName: `${TAG} Cashier`,
      passwordHash: "x",
      organizationId,
      branches: { create: { branchId } },
    },
  });
  // A front-desk cashier: takes payments and enters expenses, but may not see finance.
  cashier = {
    userId: cashierUser.id,
    fullName: `${TAG} Cashier`,
    organizationId,
    roles: ["CASHIER"],
    permissions: ["students.view", "payments.create", "payments.refund", "finance.create"],
    branchIds: [branchId],
    activeBranchId: branchId,
  };
  await prisma.orgSettings.upsert({
    where: { organizationId },
    update: { refundsEnabled: true },
    create: { organizationId, refundsEnabled: true },
  });

  // A new centre starts with one method, "Naqd", already marked as cash (A-122).
  const naqd = await prisma.paymentMethod.findFirstOrThrow({ where: { organizationId } });
  expect(naqd).toMatchObject({ name: "Naqd", isCash: true });
  cashId = naqd.id;
  cardId = (
    await createPaymentMethod(ceo, { name: "Karta", isActive: true, isCash: false, sortOrder: 1 })
  ).id;

  const teacherRole = await prisma.role.findUniqueOrThrow({ where: { code: "TEACHER" } });
  const teacher = await prisma.user.create({
    data: {
      phone: phone(4),
      fullName: `${TAG} Teacher`,
      passwordHash: "x",
      organizationId,
      roles: { create: { roleId: teacherRole.id } },
      branches: { create: { branchId } },
    },
  });
  const room = await createRoom(ceo, { branchId, name: `${TAG} Room`, capacity: 10 });
  const course = await createCourse(ceo, {
    branchId,
    name: `${TAG} English`,
    description: undefined,
    price: 500_000,
    durationMonths: 3,
    gradingSystemId: null,
    color: null,
  });
  const group = await createGroup(ceo, {
    branchId,
    name: `${TAG} Group`,
    courseId: course.id,
    gradingSystemId: null,
    weekdayPattern: "CUSTOM",
    slots: [1, 3].map((weekday) => ({
      weekday,
      startTime: "10:00",
      endTime: "11:30",
      roomId: room.id,
    })),
    teachers: [{ userId: teacher.id, role: "MAIN", shareType: "PERCENT", shareValue: 40 }],
    startDate: today,
    endDate: null,
    status: "ACTIVE",
  });
  const student = await createStudent(ceo, {
    branchId,
    fullName: `${TAG} Student`,
    phone: phone(11),
    birthDate: null,
    gender: "FEMALE",
    photoUrl: null,
    password: null,
    sourceId: null,
    schoolId: null,
    note: null,
    membership: {
      groupId: group.id,
      joinedAt: today,
      customPrice: null,
      note: null,
      status: "ACTIVE",
    },
  });
  membershipId = (
    await prisma.groupMembership.findFirstOrThrow({ where: { studentId: student.id } })
  ).id;
});

afterAll(async () => {
  // A failed set-up leaves the ids unset; an unset filter would match every centre.
  if (!organizationId) return;
  await prisma.user.deleteMany({ where: { id: owner.userId } });
  const branches = [branchId, otherBranchId];
  await prisma.auditLog.deleteMany({
    where: { OR: [{ branchId: { in: branches } }, { organizationId }] },
  });
  await prisma.cashClose.deleteMany({ where: { organizationId } });
  await prisma.financeEntry.deleteMany({ where: { branchId: { in: branches } } });
  await prisma.financeCategory.deleteMany({ where: { organizationId } });
  await prisma.debtCase.deleteMany({ where: { branchId: { in: branches } } });
  await prisma.payment.deleteMany({ where: { branchId: { in: branches } } });
  await prisma.group.deleteMany({ where: { branchId: { in: branches } } });
  await prisma.student.deleteMany({ where: { branchId: { in: branches } } });
  await prisma.course.deleteMany({ where: { branchId: { in: branches } } });
  await prisma.room.deleteMany({ where: { branchId: { in: branches } } });
  await prisma.paymentMethod.deleteMany({ where: { organizationId } });
  await prisma.user.deleteMany({ where: { organizationId } });
  await prisma.branch.deleteMany({ where: { organizationId } });
  await prisma.organization.deleteMany({ where: { id: organizationId } });
  await prisma.$disconnect();
});

describe("cashier day close", () => {
  it("sums a cashier's day by payment method and expects the cash methods' net", async () => {
    const pay = (actor: Actor, paymentMethodId: string, amount: number) =>
      createPayment(actor, {
        membershipId,
        paymentMethodId,
        amount,
        bonus: 0,
        effectiveMonth: month,
        paidAt: today,
        comment: null,
      });
    cashPaymentId = (await pay(cashier, cashId, 300_000)).id;
    await pay(cashier, cardId, 200_000);
    // The CEO's own payment is the CEO's day, not the cashier's.
    await pay(ceo, cashId, 100_000);
    await refundPayment(cashier, cashPaymentId, { amount: 50_000, reason: "Overpaid" });
    const expenses = await createCategory(ceo, { kind: "EXPENSE", name: `${TAG} Supplies` });
    const income = await createCategory(ceo, { kind: "INCOME", name: `${TAG} Books` });
    const entry = (type: "EXPENSE" | "INCOME", categoryId: string, amount: number) =>
      createEntry(cashier, {
        type,
        branchId,
        categoryId,
        paymentMethodId: cashId,
        amount,
        date: today,
        comment: null,
        staffId: null,
        studentId: null,
        counterparty: null,
      });
    await entry("EXPENSE", expenses.id, 20_000);
    await entry("INCOME", income.id, 10_000);

    const day = await previewCashDay(cashier, { branchId, date: today });
    expect(day.cashierName).toBe(`${TAG} Cashier`);
    expect(day.paymentsCount).toBe(2);
    expect(day.received).toBe(500_000);
    expect(day.hasCashMethod).toBe(true);
    expect(day.existing).toBeNull();
    const cash = day.methods.find((m) => m.methodId === cashId);
    const card = day.methods.find((m) => m.methodId === cardId);
    expect(cash).toMatchObject({
      name: "Naqd",
      isCash: true,
      payments: 300_000,
      refunds: 50_000,
      expenses: 20_000,
      income: 10_000,
      net: 240_000,
    });
    expect(card).toMatchObject({ isCash: false, payments: 200_000, net: 200_000 });
    expect(day.expectedCash).toBe(240_000);

    // The CEO's day in the same branch holds only the CEO's payment.
    const ceoDay = await previewCashDay(ceo, { branchId, date: today });
    expect(ceoDay.paymentsCount).toBe(1);
    expect(ceoDay.expectedCash).toBe(100_000);
    // A day with nothing recorded still lists the active methods, at zero.
    const empty = await previewCashDay(cashier, { branchId, date: "2020-01-01" });
    expect(empty.methods.map((m) => m.name)).toEqual(["Naqd", "Karta"]);
    expect(empty.methods.every((m) => m.net === 0 && m.payments === 0)).toBe(true);
    expect(empty.expectedCash).toBe(0);
  });

  it("closes the day with the counted cash and keeps the difference", async () => {
    const close = await closeCashDay(cashier, {
      branchId,
      date: today,
      countedCash: 235_000,
      note: "5,000 short",
    });
    expect(close.expectedCash).toBe(240_000);
    expect(close.countedCash).toBe(235_000);
    expect(close.difference).toBe(-5_000);
    expect(close.paymentsCount).toBe(2);
    expect(close.acceptedAt).toBeNull();
    expect(close.methods.find((m) => m.methodId === cashId)?.net).toBe(240_000);
    const audit = await prisma.auditLog.findFirst({
      where: { entity: "CashClose", entityId: close.id, action: "cashClose.create" },
    });
    expect(audit?.branchId).toBe(branchId);

    // Closing again before the hand-over replaces the figures.
    const again = await closeCashDay(cashier, {
      branchId,
      date: today,
      countedCash: 240_000,
      note: null,
    });
    expect(again.id).toBe(close.id);
    expect(again.difference).toBe(0);
    const preview = await previewCashDay(cashier, { branchId, date: today });
    expect(preview.existing).toMatchObject({ id: close.id, countedCash: 240_000 });

    // Not a future day, not a branch outside the cashier's own.
    await expect(
      closeCashDay(cashier, { branchId, date: "2099-01-01", countedCash: 0, note: null }),
    ).rejects.toSatisfy((e) => field(e, "date") === "validation.futureDate");
    await expect(
      closeCashDay(cashier, { branchId: otherBranchId, date: today, countedCash: 0, note: null }),
    ).rejects.toSatisfy((e) => code(e) === "FORBIDDEN");
  });

  it("shows a cashier only their own closes and a manager every close", async () => {
    const ceoClose = await closeCashDay(ceo, {
      branchId,
      date: today,
      countedCash: 100_000,
      note: null,
    });
    const year = Number(today.slice(0, 4));
    const monthNumber = Number(today.slice(5, 7));
    const mine = await listCashCloses(cashier, { year, month: monthNumber });
    expect(mine.items.map((c) => c.cashierName)).toEqual([`${TAG} Cashier`]);
    expect(mine.totals).toMatchObject({ expectedCash: 240_000, countedCash: 240_000, pending: 1 });
    const all = await listCashCloses(ceo, { branchId, year, month: monthNumber });
    expect(all.items).toHaveLength(2);
    expect(all.totals.expectedCash).toBe(340_000);
    expect(all.items.every((c) => c.branchName === `${TAG} Main`)).toBe(true);
    const counted = await countCashCloses(ceo, { year, month: monthNumber });
    expect(counted).toEqual({ count: 2, pending: 2 });
    expect(await countCashCloses(cashier, { year, month: monthNumber })).toEqual({
      count: 1,
      pending: 1,
    });

    await expect(getCashClose(cashier, ceoClose.id)).rejects.toSatisfy(
      (e) => code(e) === "FORBIDDEN",
    );
    expect((await getCashClose(ceo, mine.items[0]!.id)).cashierName).toBe(`${TAG} Cashier`);
    const viewer: Actor = { ...cashier, permissions: ["finance.view"] };
    expect((await listCashCloses(viewer, { year, month: monthNumber })).items).toHaveLength(2);
    await expect(
      listCashCloses({ ...cashier, permissions: ["students.view"] }, {}),
    ).rejects.toSatisfy((e) => code(e) === "FORBIDDEN");
  });

  it("accepts the hand-over once and locks the accepted day", async () => {
    const year = Number(today.slice(0, 4));
    const mine = (await listCashCloses(cashier, { year })).items[0]!;
    await expect(acceptCashClose(cashier, mine.id)).rejects.toSatisfy(
      (e) => code(e) === "FORBIDDEN",
    );
    const accepted = await acceptCashClose(ceo, mine.id);
    expect(accepted.acceptedById).toBe(ceo.userId);
    expect(accepted.acceptedByName).toBe(`${TAG} Director`);
    expect(accepted.acceptedAt).not.toBeNull();
    // Accepting twice changes nothing.
    expect((await acceptCashClose(ceo, mine.id)).acceptedAt).toBe(accepted.acceptedAt);
    const audits = await prisma.auditLog.count({
      where: { entity: "CashClose", entityId: mine.id, action: "cashClose.accept" },
    });
    expect(audits).toBe(1);

    await expect(
      closeCashDay(cashier, { branchId, date: today, countedCash: 1, note: null }),
    ).rejects.toSatisfy((e) => code(e) === "CONFLICT");
    const preview = await previewCashDay(cashier, { branchId, date: today });
    expect(preview.existing?.acceptedAt).not.toBeNull();
    const list = await listCashCloses(ceo, { year });
    expect(list.totals.pending).toBe(1);
  });
});
