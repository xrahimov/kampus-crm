/**
 * Debt collection (A-112) against the real database: cases open and close with
 * the balances, promises are kept or missed, staff contacts are logged and the
 * daily cadence sends Telegram, SMS and the managers' task.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/rbac/default-roles";
import { debtContactSchema } from "@/lib/validation/debts";
import { prisma } from "@/server/db/prisma";
import type { Actor } from "@/server/rbac/authorize";
import { listNotifications } from "@/server/services/dashboard/notifications.service";
import {
  daysBetween,
  getDebtCase,
  listDebtCases,
  listDebtContacts,
  logDebtContact,
  runDailyDebtCollection,
  sendDebtReminder,
  syncDebtCases,
} from "@/server/services/debts/debts.service";
import { createGroup } from "@/server/services/groups/groups.service";
import { createBranch } from "@/server/services/settings/branches.service";
import { createCourse } from "@/server/services/settings/courses.service";
import { createPaymentMethod } from "@/server/services/settings/payment-methods.service";
import { createAdjustment } from "@/server/services/students/adjustments.service";
import { createPayment } from "@/server/services/students/payments.service";
import { createStudent } from "@/server/services/students/students.service";

import { DEMO_ORG_ID, demoBranchIds } from "./support/tenant";

const RUN = String(Date.now() % 100_000).padStart(5, "0");
const TAG = `debt${RUN}`;
const phone = (n: number) => `+99897${RUN}${String(n).padStart(2, "0")}`;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return iso(d);
};
const TODAY = daysAgo(0);

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
  permissions: [...DEFAULT_ROLE_PERMISSIONS.CASHIER],
};
const teacher: Actor = {
  ...ceo,
  fullName: "Teacher",
  roles: ["TEACHER"],
  permissions: [...DEFAULT_ROLE_PERMISSIONS.TEACHER],
};

let branchId: string;
let groupId: string;
let methodId: string;
let savedCadence: {
  debtTelegramDays: number | null;
  debtSmsDays: number | null;
  debtTaskDays: number | null;
};
let savedDebtorSms: boolean | null = null;
const list = (over: Partial<Parameters<typeof listDebtCases>[1]> = {}) => ({
  page: 1,
  pageSize: 50,
  skip: 0,
  take: 50,
  sort: { field: "openedAt" as const, direction: "asc" as const },
  ...over,
});

beforeAll(async () => {
  for (const [a, n] of [
    [ceo, 1],
    [cashier, 2],
    [teacher, 3],
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
  teacher.branchIds = [branchId];
  await prisma.userBranch.createMany({
    data: [cashier.userId, teacher.userId].map((userId) => ({ userId, branchId })),
  });
  const cashierRole = await prisma.role.findUniqueOrThrow({ where: { code: "CASHIER" } });
  const teacherRole = await prisma.role.findUniqueOrThrow({ where: { code: "TEACHER" } });
  await prisma.userRole.createMany({
    data: [
      { userId: cashier.userId, roleId: cashierRole.id },
      { userId: teacher.userId, roleId: teacherRole.id },
    ],
  });
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
      teachers: [{ userId: teacher.userId, role: "MAIN", shareType: "PERCENT", shareValue: 40 }],
      startDate: daysAgo(60),
      endDate: null,
      status: "ACTIVE",
    })
  ).id;
  methodId = (
    await createPaymentMethod(ceo, {
      name: `${TAG} Cash`,
      isActive: true,
      isCash: true,
      sortOrder: 0,
    })
  ).id;
  savedCadence = await prisma.orgSettings.findUniqueOrThrow({
    where: { organizationId: DEMO_ORG_ID },
    select: { debtTelegramDays: true, debtSmsDays: true, debtTaskDays: true },
  });
  savedDebtorSms =
    (
      await prisma.autoSmsSetting.findUnique({
        where: { organizationId_event: { organizationId: DEMO_ORG_ID, event: "DEBTOR" } },
      })
    )?.isActive ?? null;
});

afterAll(async () => {
  await prisma.orgSettings.update({ where: { organizationId: DEMO_ORG_ID }, data: savedCadence });
  if (savedDebtorSms !== null) {
    await prisma.autoSmsSetting.update({
      where: { organizationId_event: { organizationId: DEMO_ORG_ID, event: "DEBTOR" } },
      data: { isActive: savedDebtorSms },
    });
  }
  const students = await prisma.student.findMany({ where: { branchId }, select: { id: true } });
  const ids = students.map((s) => s.id);
  const users = [ceo.userId, cashier.userId, teacher.userId];
  await prisma.notification.deleteMany({ where: { userId: { in: users } } });
  await prisma.auditLog.deleteMany({ where: { OR: [{ branchId }, { actorId: { in: users } }] } });
  await prisma.job.deleteMany({ where: { uniqueKey: { contains: `${TAG}` } } });
  await prisma.debtCase.deleteMany({ where: { branchId } });
  await prisma.smsMessage.deleteMany({ where: { studentId: { in: ids } } });
  await prisma.studentTelegramChat.deleteMany({ where: { studentId: { in: ids } } });
  await prisma.balanceAdjustment.deleteMany({ where: { branchId } });
  await prisma.refund.deleteMany({ where: { payment: { studentId: { in: ids } } } });
  await prisma.payment.deleteMany({ where: { studentId: { in: ids } } });
  await prisma.groupMembership.deleteMany({ where: { studentId: { in: ids } } });
  await prisma.group.deleteMany({ where: { branchId } });
  await prisma.student.deleteMany({ where: { branchId } });
  await prisma.course.deleteMany({ where: { branchId } });
  await prisma.paymentMethod.deleteMany({ where: { id: methodId } });
  await prisma.userBranch.deleteMany({ where: { branchId } });
  await prisma.userRole.deleteMany({ where: { userId: { in: users } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.branch.deleteMany({ where: { id: branchId } });
  await prisma.$disconnect();
});

const student = (name: string, n: number, joinedAt: string) =>
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
    membership: { groupId, joinedAt, customPrice: null, note: null, status: "ACTIVE" },
  });

describe("helpers", () => {
  it("counts whole days and never goes negative", () => {
    expect(daysBetween("2026-10-01", "2026-10-09")).toBe(8);
    expect(daysBetween("2026-10-09", "2026-10-01")).toBe(0);
  });

  it("requires a date when the outcome is a promise", () => {
    const missing = debtContactSchema.safeParse({ channel: "CALL", outcome: "PROMISED" });
    expect(missing.success).toBe(false);
    const ok = debtContactSchema.safeParse({
      channel: "CALL",
      outcome: "PROMISED",
      promisedAt: "2026-10-20",
      promisedAmount: "",
      note: "",
    });
    expect(ok.success).toBe(true);
    if (ok.success) expect(ok.data.promisedAmount).toBeNull();
  });
});

describe("debt cases", () => {
  it("opens a case for a student who owes, from the first unpaid month, and closes it when paid", async () => {
    // Joined two months ago: three months charged, nothing paid.
    const alice = await student("Alice", 11, daysAgo(60));
    const result = await listDebtCases(cashier, list(), {});
    const row = result.items.find((d) => d.studentId === alice.id);
    expect(row).toBeDefined();
    expect(row!.status).toBe("OPEN");
    expect(row!.amount).toBeGreaterThan(0);
    expect(row!.openedAt).toBe(`${daysAgo(60).slice(0, 7)}-01`);
    expect(row!.daysOverdue).toBeGreaterThanOrEqual(30);
    expect(row!.groups.map((g) => g.groupName)).toEqual([`${TAG} Group`]);
    expect(row!.needsCall).toBe(false);
    expect(result.summary.debtors).toBeGreaterThanOrEqual(1);
    expect(result.summary.amount).toBeGreaterThanOrEqual(row!.amount);

    // A payment that covers everything closes the case inside the payment's transaction.
    await createPayment(cashier, {
      membershipId: alice.groups[0]!.membershipId,
      paymentMethodId: methodId,
      amount: Math.ceil(row!.amount),
      bonus: 0,
      effectiveMonth: TODAY.slice(0, 7),
      paidAt: TODAY,
      comment: null,
    });
    const closed = await prisma.debtCase.findFirstOrThrow({ where: { id: row!.id } });
    expect(closed.status).toBe("CLOSED");
    expect(closed.closedReason).toBe("PAID");
    const after = await listDebtCases(cashier, list(), {});
    expect(after.items.some((d) => d.studentId === alice.id)).toBe(false);
    const all = await listDebtCases(cashier, list(), { status: "CLOSED" });
    expect(all.items.find((d) => d.id === row!.id)?.closedReason).toBe("PAID");
  });

  it("keeps a teacher out and a cashier inside their own branch", async () => {
    await expect(listDebtCases(teacher, list(), {})).rejects.toMatchObject({ status: 403 });
    const other = (await demoBranchIds()).find((id) => id !== branchId)!;
    await expect(listDebtCases(cashier, list(), { branchId: other })).rejects.toMatchObject({
      status: 403,
    });
  });

  it("logs contacts, pauses on a promise, counts a missed promise and reopens the cadence", async () => {
    const bob = await student("Bob", 12, daysAgo(40));
    await syncDebtCases(prisma, { branchIds: [branchId] });
    const open = await prisma.debtCase.findFirstOrThrow({
      where: { studentId: bob.id, status: { not: "CLOSED" } },
    });
    const amount = Number(open.amount);

    // No answer first, then a promise for tomorrow.
    let dto = await logDebtContact(cashier, open.id, {
      channel: "CALL",
      outcome: "NO_ANSWER",
      promisedAt: null,
      promisedAmount: null,
      note: "Voicemail",
    });
    expect(dto.status).toBe("OPEN");
    expect(dto.lastChannel).toBe("CALL");
    expect(dto.lastOutcome).toBe("NO_ANSWER");
    expect(dto.lastContactBy).toBe(`${TAG} Cashier`);
    const tomorrow = daysAgo(-1);
    dto = await logDebtContact(cashier, open.id, {
      channel: "CALL",
      outcome: "PROMISED",
      promisedAt: tomorrow,
      promisedAmount: 100_000,
      note: null,
    });
    expect(dto.status).toBe("PROMISED");
    expect(dto.promisedAt).toBe(tomorrow);
    expect(dto.promisedAmount).toBe(100_000);

    // The cadence leaves a promised case alone.
    await runDailyDebtCollection(prisma, TODAY, { branchIds: [branchId] });
    const stillPromised = await prisma.debtCase.findUniqueOrThrow({ where: { id: open.id } });
    expect(stillPromised.status).toBe("PROMISED");
    expect(stillPromised.telegramAt).toBeNull();
    expect(stillPromised.smsAt).toBeNull();

    // Two days later nothing arrived: the promise is missed, the managers are told.
    const dayAfter = daysAgo(-2);
    await runDailyDebtCollection(prisma, dayAfter, { branchIds: [branchId] });
    const broken = await getDebtCase(cashier, open.id);
    expect(broken.status).toBe("OPEN");
    expect(broken.brokenPromises).toBe(1);
    expect(broken.promiseMissed).toBe(true);
    expect(broken.needsCall).toBe(true);
    // The cadence resumed at once: the seed's DEBTOR SMS went out after the missed promise.
    const history = await listDebtContacts(cashier, open.id);
    expect(history.filter((c) => c.outcome).map((c) => c.outcome)).toEqual([
      "PROMISE_BROKEN",
      "PROMISED",
      "NO_ANSWER",
    ]);
    expect(history.find((c) => c.outcome === "PROMISE_BROKEN")?.auto).toBe(true);
    expect(history.filter((c) => c.auto && c.channel === "SMS")).toHaveLength(1);
    const bell = await listNotifications(cashier, { unread: true, page: 1 });
    expect(
      bell.items.some((n) => n.kind === "DEBT_PROMISE_BROKEN" && n.params.name === `${TAG} Bob`),
    ).toBe(true);

    // The promised sum arrives on a new promise: the case stays open, the promise counts as kept.
    await logDebtContact(cashier, open.id, {
      channel: "TELEGRAM",
      outcome: "PROMISED",
      promisedAt: daysAgo(-5),
      promisedAmount: 100_000,
      note: null,
    });
    await createPayment(cashier, {
      membershipId: bob.groups[0]!.membershipId,
      paymentMethodId: methodId,
      amount: 100_000,
      bonus: 0,
      effectiveMonth: TODAY.slice(0, 7),
      paidAt: TODAY,
      comment: null,
    });
    const kept = await getDebtCase(cashier, open.id);
    expect(kept.status).toBe("OPEN");
    expect(kept.promisedAt).toBeNull();
    expect(kept.amount).toBeCloseTo(amount - 100_000, 0);
    expect((await listDebtContacts(cashier, open.id))[0]!.outcome).toBe("PROMISE_KEPT");

    // A correction that clears the rest closes the case as paid.
    await createAdjustment(ceo, {
      membershipId: bob.groups[0]!.membershipId,
      amount: kept.amount,
      kind: "CORRECTION",
      date: TODAY,
      comment: "Agreed write-off",
    });
    const done = await prisma.debtCase.findUniqueOrThrow({ where: { id: open.id } });
    expect(done.status).toBe("CLOSED");
    expect(done.closedReason).toBe("PAID");
  });

  it("runs the cadence: Telegram, then SMS, then a task for the branch, each once", async () => {
    const carol = await student("Carol", 13, daysAgo(45));
    await prisma.studentTelegramChat.create({
      data: { studentId: carol.id, chatId: `${TAG}-chat`, locale: "en" },
    });
    await prisma.autoSmsSetting.upsert({
      where: { organizationId_event: { organizationId: DEMO_ORG_ID, event: "DEBTOR" } },
      update: { isActive: true },
      create: {
        organizationId: DEMO_ORG_ID,
        event: "DEBTOR",
        isActive: true,
        template: "{studentName}, {groupName}: {debt}",
      },
    });
    const first = await runDailyDebtCollection(prisma, TODAY, { branchIds: [branchId] });
    expect(first.telegram).toBeGreaterThanOrEqual(1);
    expect(first.sms).toBeGreaterThanOrEqual(1);
    expect(first.tasks).toBeGreaterThanOrEqual(1);
    const row = await prisma.debtCase.findFirstOrThrow({
      where: { studentId: carol.id, status: { not: "CLOSED" } },
      include: { contacts: true },
    });
    expect(row.telegramAt).not.toBeNull();
    expect(row.smsAt).not.toBeNull();
    expect(row.taskAt).not.toBeNull();
    expect(row.contacts.map((c) => c.channel).sort()).toEqual(["SMS", "TELEGRAM"]);
    expect(row.contacts.every((c) => c.auto)).toBe(true);
    const job = await prisma.job.findFirst({
      where: { uniqueKey: `tg:debt:${row.id}:telegram:${TAG}-chat` },
    });
    expect(job).not.toBeNull();
    const sms = await prisma.smsMessage.findUnique({ where: { refKey: `debt:${row.id}:sms` } });
    expect(sms?.text).toContain(`${TAG} Group`);
    const bell = await listNotifications(cashier, { unread: true, page: 1 });
    expect(bell.items.some((n) => n.kind === "DEBT_TASK" && n.params.day === TODAY)).toBe(true);

    // The same day again sends nothing more; the list shows the flag and the filter finds it.
    const again = await runDailyDebtCollection(prisma, TODAY, { branchIds: [branchId] });
    expect(again.telegram).toBe(0);
    expect(again.sms).toBe(0);
    const flagged = await listDebtCases(cashier, list(), { status: "NEEDS_CALL" });
    expect(flagged.items.map((d) => d.studentId)).toContain(carol.id);
    expect(flagged.summary.needsCall).toBeGreaterThanOrEqual(1);

    // A manual reminder goes to the linked chat and counts as a contact, clearing the flag.
    const sent = await sendDebtReminder(cashier, row.id);
    expect(sent.queued).toBe(1);
    const afterReminder = await getDebtCase(cashier, row.id);
    expect(afterReminder.needsCall).toBe(false);
    expect(afterReminder.lastChannel).toBe("TELEGRAM");
    expect(afterReminder.hasTelegram).toBe(true);
  });

  it("respects switched-off steps", async () => {
    await prisma.orgSettings.update({
      where: { organizationId: DEMO_ORG_ID },
      data: { debtTelegramDays: null, debtSmsDays: null, debtTaskDays: null },
    });
    try {
      const dave = await student("Dave", 14, daysAgo(50));
      const run = await runDailyDebtCollection(prisma, TODAY, { branchIds: [branchId] });
      const row = await prisma.debtCase.findFirstOrThrow({
        where: { studentId: dave.id, status: { not: "CLOSED" } },
      });
      expect(row.telegramAt).toBeNull();
      expect(row.smsAt).toBeNull();
      expect(row.taskAt).toBeNull();
      expect(run.tasks).toBe(0);
    } finally {
      await prisma.orgSettings.update({
        where: { organizationId: DEMO_ORG_ID },
        data: savedCadence,
      });
    }
  });
});
