/**
 * Student, payment, discount and membership services against the real
 * database (Phase 6). Rows carry a run-specific tag and are removed at the end.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/rbac/default-roles";
import { prisma } from "@/server/db/prisma";
import type { Actor } from "@/server/rbac/authorize";
import { createGroup } from "@/server/services/groups/groups.service";
import {
  activateMembers,
  addMember,
  listMembers,
  transferMember,
  updateMembership,
} from "@/server/services/groups/memberships.service";
import { createBranch } from "@/server/services/settings/branches.service";
import { createCourse } from "@/server/services/settings/courses.service";
import { updateOrgSettings, getOrgSettings } from "@/server/services/settings/org-settings.service";
import { createPaymentMethod } from "@/server/services/settings/payment-methods.service";
import {
  getReceiptSettings,
  updateReceiptSettings,
} from "@/server/services/settings/receipt-settings.service";
import { membershipBalances } from "@/server/services/students/balances";
import {
  deleteDiscount,
  giveDiscount,
  listGroupDiscounts,
} from "@/server/services/students/discounts.service";
import {
  createPayment,
  getPaymentInfo,
  getReceipt,
  listPayments,
  refundPayment,
} from "@/server/services/students/payments.service";
import {
  addParent,
  addStudentComment,
  archiveStudent,
  createStudent,
  deleteCustomField,
  getMembershipCalendar,
  getStudent,
  getStudentOptions,
  listGroupComments,
  listStudentHistory,
  listStudents,
  restoreStudent,
  setBlacklisted,
  setCustomField,
  updateStudent,
} from "@/server/services/students/students.service";

const RUN = String(Date.now() % 100_000).padStart(5, "0");
const TAG = `s${RUN}`;
const phone = (n: number) => `+99893${RUN}${String(n).padStart(2, "0")}`;

const actor = (fullName: string, roles: string[], permissions: string[]): Actor => ({
  userId: "",
  fullName,
  roles,
  permissions,
  branchIds: [],
  activeBranchId: null,
});
const ceo = actor("CEO", ["CEO"], ["*"]);
const teacher = actor("Teacher", ["TEACHER"], [...DEFAULT_ROLE_PERMISSIONS.TEACHER]);
const outsider = actor("Outsider", ["TEACHER"], [...DEFAULT_ROLE_PERMISSIONS.TEACHER]);
const cashier = actor("Cashier", ["CASHIER"], ["students.view", "payments.create"]);

let branchA: string;
let courseA: string;
let groupA: string;
let groupB: string;
let methodId: string;

const list = <F extends string = "fullName">(
  sort: { field: F; direction: "asc" | "desc" } = {
    field: "fullName" as F,
    direction: "asc",
  },
) => ({
  page: 1,
  pageSize: 100,
  skip: 0,
  take: 100,
  sort,
});

beforeAll(async () => {
  const teacherRole = await prisma.role.findUniqueOrThrow({ where: { code: "TEACHER" } });
  for (const [a, n] of [
    [ceo, 1],
    [teacher, 2],
    [outsider, 3],
    [cashier, 4],
  ] as const) {
    const user = await prisma.user.create({
      data: { phone: phone(n), fullName: `${TAG} ${a.fullName}`, passwordHash: "x" },
    });
    a.userId = user.id;
  }
  await prisma.userRole.createMany({
    data: [teacher, outsider].map((t) => ({ userId: t.userId, roleId: teacherRole.id })),
  });
  branchA = (await createBranch(ceo, { name: `${TAG} A`, isActive: true })).id;
  // Lists by the CEO are scoped to this run's branch so seed data stays out of the way.
  ceo.activeBranchId = branchA;
  await prisma.userBranch.createMany({
    data: [teacher, outsider, cashier].map((t) => ({ userId: t.userId, branchId: branchA })),
  });
  for (const a of [teacher, outsider, cashier]) a.branchIds = [branchA];
  courseA = (
    await createCourse(ceo, {
      branchId: branchA,
      name: `${TAG} English`,
      description: undefined,
      price: 500_000,
      durationMonths: 2,
      gradingSystemId: null,
      color: null,
    })
  ).id;
  const slots = [2, 4, 6].map((weekday) => ({
    weekday,
    startTime: "09:00",
    endTime: "10:30",
    roomId: null,
  }));
  const group = (name: string, teacherId: string) =>
    createGroup(ceo, {
      branchId: branchA,
      name,
      courseId: courseA,
      gradingSystemId: null,
      weekdayPattern: "EVEN",
      slots,
      teachers: [{ userId: teacherId, role: "MAIN", shareType: "PERCENT", shareValue: 40 }],
      startDate: "2026-09-01",
      endDate: null,
      status: "ACTIVE",
    });
  groupA = (await group(`${TAG} GE-A`, teacher.userId)).id;
  groupB = (await group(`${TAG} GE-B`, outsider.userId)).id;
  methodId = (await createPaymentMethod(ceo, { name: `${TAG} Cash`, isActive: true, sortOrder: 0 }))
    .id;
});

afterAll(async () => {
  const students = await prisma.student.findMany({ where: { branchId: branchA } });
  const memberships = await prisma.groupMembership.findMany({
    where: { studentId: { in: students.map((s) => s.id) } },
  });
  const payments = await prisma.payment.findMany({ where: { branchId: branchA } });
  await prisma.auditLog.deleteMany({
    where: {
      OR: [
        { branchId: branchA },
        { entityId: { in: [...students, ...memberships, ...payments].map((x) => x.id) } },
      ],
    },
  });
  await prisma.payment.deleteMany({ where: { branchId: branchA } });
  await prisma.group.deleteMany({ where: { branchId: branchA } });
  await prisma.student.deleteMany({ where: { branchId: branchA } });
  await prisma.course.deleteMany({ where: { branchId: branchA } });
  await prisma.paymentMethod.deleteMany({ where: { id: methodId } });
  const users = await prisma.user.findMany({ where: { phone: { startsWith: `+99893${RUN}` } } });
  const ids = users.map((u) => u.id);
  await prisma.auditLog.deleteMany({ where: { actorId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.branch.deleteMany({ where: { id: branchA } });
  await prisma.$disconnect();
});

const studentInput = (name: string, n: number) => ({
  branchId: branchA,
  fullName: `${TAG} ${name}`,
  phone: phone(n),
  birthDate: "2010-05-20",
  gender: "FEMALE" as const,
  photoUrl: null,
  password: null,
  sourceId: null,
  schoolId: null,
  note: null,
});

describe("students", () => {
  let aliceId: string;
  let aliceMembership: string;
  let bobId: string;

  it("creates a student with a group and a parent, charging from the join date (A-10)", async () => {
    const dto = await createStudent(ceo, {
      ...studentInput("Alice", 10),
      membership: {
        groupId: groupA,
        joinedAt: "2026-09-15",
        customPrice: null,
        note: null,
        status: "ACTIVE",
      },
      parent: { fullName: "Alice Mum", phone: phone(11) },
    });
    aliceId = dto.id;
    expect(dto.parents).toHaveLength(1);
    expect(dto.groups).toHaveLength(1);
    aliceMembership = dto.groups[0]!.membershipId;
    // September 2026 even days: 13 lessons, 7 of them on or after the 15th. October: all 14.
    const charges = await prisma.charge.findMany({
      where: { membershipId: aliceMembership },
      orderBy: { month: "asc" },
    });
    expect(
      charges
        .slice(0, 2)
        .map((c) => [
          c.month.toISOString().slice(0, 10),
          Number(c.amount),
          c.lessonsTotal,
          c.lessonsCounted,
        ]),
    ).toEqual([
      ["2026-09-01", 269_231, 13, 7],
      ["2026-10-01", 500_000, 14, 14],
    ]);
    expect(dto.balance).toBe(-769_231);
    expect(dto.nextPaymentDate).toBe("2026-09-01");
    expect(dto.groups[0]).toMatchObject({
      groupName: `${TAG} GE-A`,
      status: "ACTIVE",
      monthlyPrice: 500_000,
    });
  });

  it("does not charge trial students, and lists NEW/TRIAL under 'new'", async () => {
    const dto = await createStudent(ceo, {
      ...studentInput("Bob", 12),
      membership: {
        groupId: groupA,
        joinedAt: "2026-09-01",
        customPrice: null,
        note: null,
        status: "TRIAL",
      },
    });
    bobId = dto.id;
    expect(dto.balance).toBe(0);
    const page = await listStudents(ceo, list(), { groupStatus: "NEW" });
    expect(page.items.map((s) => s.id)).toEqual([bobId]);
    const none = await listStudents(ceo, list(), { groupStatus: "NO_GROUP" });
    expect(none.items.map((s) => s.id)).toEqual([]);
  });

  it("filters by payment status and sorts by balance (A-60)", async () => {
    const debtors = await listStudents(ceo, list(), { paymentStatus: "DEBTOR" });
    expect(debtors.items.map((s) => s.id)).toEqual([aliceId]);
    const notDebtors = await listStudents(ceo, list(), { paymentStatus: "NOT_DEBTOR" });
    expect(notDebtors.items.map((s) => s.id)).toEqual([bobId]);
    const sorted = await listStudents(ceo, list({ field: "balance", direction: "asc" }));
    expect(sorted.items.map((s) => s.id)).toEqual([aliceId, bobId]);
    const byCourse = await listStudents(ceo, list(), {
      courseId: courseA,
      teacherId: teacher.userId,
    });
    expect(byCourse.total).toBe(2);
  });

  it("takes payments, suggests the debt, then one month's price", async () => {
    const info = await getPaymentInfo(cashier, aliceMembership);
    expect(info).toMatchObject({
      suggestedAmount: 769_231,
      suggestedMonth: "2026-09-01",
      months: ["2026-09-01", "2026-10-01", "2026-11-01"],
    });
    const p1 = await createPayment(cashier, {
      membershipId: aliceMembership,
      paymentMethodId: methodId,
      amount: 269_231,
      bonus: 0,
      effectiveMonth: "2026-09",
      paidAt: "2026-09-15",
      comment: "first",
    });
    expect(p1).toMatchObject({
      amount: 269_231,
      effectiveMonth: "2026-09-01",
      methodName: `${TAG} Cash`,
      receivedByName: `${TAG} Cashier`,
    });
    let after = await getPaymentInfo(cashier, aliceMembership);
    expect(after).toMatchObject({
      balance: -500_000,
      suggestedAmount: 500_000,
      suggestedMonth: "2026-10-01",
      nextPaymentDate: "2026-10-01",
    });
    await createPayment(cashier, {
      membershipId: aliceMembership,
      paymentMethodId: methodId,
      amount: 600_000,
      bonus: 50_000,
      effectiveMonth: "2026-10-01",
      paidAt: "2026-10-01",
      comment: null,
    });
    after = await getPaymentInfo(cashier, aliceMembership);
    expect(after.balance).toBe(150_000);
    expect(after.suggestedAmount).toBe(500_000);
    const student = await getStudent(ceo, aliceId);
    expect(student.balance).toBe(150_000);
    const history = await listPayments(
      ceo,
      { ...list({ field: "paidAt", direction: "desc" }) },
      { studentId: aliceId },
    );
    expect(history.total).toBe(2);
    expect(history.totalAmount).toBe(869_231);
  });

  it("refunds only when the org switch is on and never more than what is left", async () => {
    const payment = (
      await listPayments(ceo, list({ field: "paidAt", direction: "asc" }), { studentId: aliceId })
    ).items[0]!;
    const settings = await getOrgSettings(ceo);
    await updateOrgSettings(ceo, { ...settings, refundsEnabled: false });
    await expect(
      refundPayment(ceo, payment.id, { amount: 1000, reason: null }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await updateOrgSettings(ceo, { ...settings, refundsEnabled: true });
    await expect(
      refundPayment(ceo, payment.id, { amount: 300_000, reason: null }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    const refunded = await refundPayment(ceo, payment.id, { amount: 69_231, reason: "left early" });
    expect(refunded.refunded).toBe(69_231);
    expect((await getPaymentInfo(ceo, aliceMembership)).balance).toBe(80_769);
    await expect(
      refundPayment(cashier, payment.id, { amount: 1, reason: null }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await updateOrgSettings(ceo, { ...settings, refundsEnabled: false });
  });

  it("builds the receipt from the org, the payment and the receipt settings", async () => {
    await updateReceiptSettings(ceo, {
      address: "Main street 1",
      phone: "+998901112233",
      visibleFields: ["header", "student", "amount", "qr"],
      logoPosition: "BOTTOM",
      footerText: "Thanks",
    });
    expect((await getReceiptSettings(ceo)).visibleFields).toEqual([
      "header",
      "student",
      "amount",
      "qr",
    ]);
    const payment = (
      await listPayments(ceo, list({ field: "paidAt", direction: "asc" }), { studentId: aliceId })
    ).items[0]!;
    const receipt = await getReceipt(cashier, payment.id);
    expect(receipt).toMatchObject({
      studentName: `${TAG} Alice`,
      groupName: `${TAG} GE-A`,
      teacherName: `${TAG} Teacher`,
      coursePrice: 500_000,
      settings: { address: "Main street 1", logoPosition: "BOTTOM", footerText: "Thanks" },
    });
    await expect(getReceipt(outsider, payment.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("gives and removes a discount for coming months", async () => {
    await expect(
      giveDiscount(ceo, {
        membershipId: aliceMembership,
        discountedPrice: 600_000,
        months: 2,
        comment: null,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    const d = await giveDiscount(
      ceo,
      { membershipId: aliceMembership, discountedPrice: 400_000, months: 2, comment: "loyal" },
      groupA,
    );
    expect(d).toMatchObject({
      amount: 100_000,
      percent: 20,
      months: 2,
      remainingMonths: 2,
      studentName: `${TAG} Alice`,
    });
    await expect(
      giveDiscount(
        ceo,
        { membershipId: aliceMembership, discountedPrice: 400_000, months: 1, comment: null },
        groupB,
      ),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    const info = await getPaymentInfo(ceo, aliceMembership);
    expect(info.monthlyPrice).toBe(400_000);
    expect(info.discount).toMatchObject({ remainingMonths: 2, discountedPrice: 400_000 });
    expect((await listGroupDiscounts(ceo, groupA)).map((x) => x.id)).toEqual([d.id]);
    await deleteDiscount(ceo, d.id);
    expect(await listGroupDiscounts(ceo, groupA)).toEqual([]);
    await expect(
      giveDiscount(cashier, {
        membershipId: aliceMembership,
        discountedPrice: 1,
        months: 1,
        comment: null,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("activates trial members, freezes with a date, and transfers to another group (A-63)", async () => {
    expect(await activateMembers(ceo, groupA)).toBe(1);
    const bob = await getStudent(ceo, bobId);
    expect(bob.groups[0]!.status).toBe("ACTIVE");
    const bobMembership = bob.groups[0]!.membershipId;
    const frozen = await updateMembership(ceo, bobMembership, { status: "FROZEN" });
    expect(frozen.frozenAt).toBe(new Date().toISOString().slice(0, 10));
    const moved = await transferMember(ceo, aliceMembership, {
      groupId: groupB,
      joinedAt: "2026-10-20",
      customPrice: null,
      note: "moved",
      reason: "schedule",
    });
    expect(moved).toMatchObject({ groupId: groupB, status: "ACTIVE", joinedAt: "2026-10-20" });
    const old = (await listMembers(ceo, groupA, { archived: true })).find(
      (m) => m.id === aliceMembership,
    );
    // Since Phase 12 a transfer is its own reason (A-92); the typed reason is kept as the note.
    expect(old).toMatchObject({
      status: "ARCHIVED",
      leftAt: "2026-10-20",
      leaveReason: "transfer",
      note: "schedule",
    });
    await expect(
      transferMember(ceo, aliceMembership, {
        groupId: groupA,
        joinedAt: "2026-10-21",
        customPrice: null,
        note: null,
        reason: null,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    // The balance stays on the old membership; the student total is unchanged by the move itself.
    const balances = await membershipBalances(prisma, [aliceMembership]);
    expect(balances.get(aliceMembership)!.paid).toBe(869_231);
  });

  it("keeps comments, custom fields, parents and a history timeline", async () => {
    // Alice has moved to the outsider's group, so the teacher comments on Bob.
    const c = await addStudentComment(teacher, bobId, { text: "Doing well", groupId: groupA });
    await addStudentComment(ceo, aliceId, { text: "Moved groups", groupId: null });
    expect(c).toMatchObject({ groupName: `${TAG} GE-A`, authorName: `${TAG} Teacher` });
    expect((await listGroupComments(ceo, groupA)).map((x) => x.id)).toContain(c.id);
    const f = await setCustomField(ceo, aliceId, { name: "Passport", value: "AA 123" });
    await setCustomField(ceo, aliceId, { name: "Passport", value: "AA 999" });
    expect((await getStudent(ceo, aliceId)).customFields).toEqual([
      { id: f.id, name: "Passport", value: "AA 999" },
    ]);
    await deleteCustomField(ceo, f.id);
    await addParent(ceo, aliceId, { fullName: "Alice Dad", phone: phone(13) });
    expect((await getStudent(ceo, aliceId)).parents).toHaveLength(2);
    await updateStudent(ceo, aliceId, { note: "VIP", password: "Secret123!" });
    const detail = await getStudent(ceo, aliceId);
    expect(detail.hasAppPassword).toBe(true);
    const history = await listStudentHistory(ceo, aliceId, {
      page: 1,
      pageSize: 50,
      skip: 0,
      take: 50,
    });
    const actions = history.items.map((h) => h.action);
    expect(actions).toEqual(
      expect.arrayContaining([
        "student.create",
        "membership.create",
        "payment.create",
        "payment.refund",
        "membership.transfer",
        "student.update",
        "student.comment",
      ]),
    );
    const update = history.items.find((h) => h.action === "student.update");
    expect(update?.details).toMatchObject({ note: { from: null, to: "VIP" } });
  });

  it("shows the month calendar with marks and the paid flag", async () => {
    const bob = await getStudent(ceo, bobId);
    const cal = await getMembershipCalendar(ceo, bob.groups[0]!.membershipId, "2026-09-01");
    expect(cal.months).toEqual(["2026-09-01", "2026-10-01", "2026-11-01"]);
    expect(cal.days).toHaveLength(13);
    expect(cal.days[0]).toMatchObject({ date: "2026-09-01", paid: false });
    expect(cal.counts.present + cal.counts.absent + cal.counts.excused + cal.counts.notMarked).toBe(
      13,
    );
  });

  it("scopes teachers to their own students and lets them create only when the switch is on", async () => {
    const mine = await listStudents(teacher, list());
    // Alice moved to the outsider's group; Bob is still in the teacher's group.
    expect(mine.items.map((s) => s.id)).toEqual([bobId]);
    await expect(getStudent(outsider, bobId)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const settings = await getOrgSettings(ceo);
    await updateOrgSettings(ceo, { ...settings, teacherCanAddStudents: false });
    await expect(createStudent(teacher, studentInput("Carl", 14))).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await updateOrgSettings(ceo, { ...settings, teacherCanAddStudents: true });
    const carl = await createStudent(teacher, studentInput("Carl", 14));
    expect(carl.fullName).toBe(`${TAG} Carl`);
    await updateOrgSettings(ceo, { ...settings, teacherCanAddStudents: false });
    await expect(getStudentOptions(cashier)).resolves.toMatchObject({
      paymentMethods: expect.arrayContaining([expect.objectContaining({ id: methodId })]),
    });
  });

  it("blacklists, archives and restores", async () => {
    await setBlacklisted(ceo, bobId, true);
    const bob = await getStudent(ceo, bobId);
    expect(bob.isBlacklisted).toBe(true);
    expect(bob.groups[0]!.status).toBe("ARCHIVED");
    await expect(
      addMember(ceo, groupA, {
        studentId: bobId,
        joinedAt: "2026-10-01",
        customPrice: null,
        note: null,
        status: "ACTIVE",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await setBlacklisted(ceo, bobId, false);
    await archiveStudent(ceo, aliceId);
    expect((await listStudents(ceo, list())).items.map((s) => s.id)).not.toContain(aliceId);
    expect((await listStudents(ceo, list(), { archived: true })).items.map((s) => s.id)).toEqual([
      aliceId,
    ]);
    await restoreStudent(ceo, aliceId);
    expect((await getStudent(ceo, aliceId)).isArchived).toBe(false);
    await expect(archiveStudent(cashier, aliceId)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
