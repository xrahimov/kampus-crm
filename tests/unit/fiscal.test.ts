/**
 * Online fiscal receipts (A-147) against the real database, inside a centre of
 * its own: a payment files a PENDING receipt and a job, the job issues it through
 * the fake provider, a refund gets its own REFUND receipt, a failure is kept with
 * its error and retried by hand, and a centre with the integration off sees nothing.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/server/db/prisma";
import { isAppError } from "@/server/errors/app-error";
import { failNextFiscalReceipt, fakeFiscalOutbox } from "@/server/integrations/fiscal/provider";
import type { Actor } from "@/server/rbac/authorize";
import { tashkentDate } from "@/server/services/finance/cash-close.service";
import { createGroup } from "@/server/services/groups/groups.service";
import { updateIntegration } from "@/server/services/integrations/integrations.service";
import {
  issueFiscalReceipt,
  issueFiscalReceiptNow,
} from "@/server/services/payments/fiscal.service";
import { createCourse } from "@/server/services/settings/courses.service";
import { createOrganization } from "@/server/services/settings/organizations.service";
import { createRoom } from "@/server/services/settings/rooms.service";
import {
  createPayment,
  getPayment,
  refundPayment,
} from "@/server/services/students/payments.service";
import { createStudent } from "@/server/services/students/students.service";

import { DEMO_ORG_ID, demoBranchIds } from "./support/tenant";

const RUN = String(Date.now() % 100_000).padStart(5, "0");
const TAG = `fr${RUN}`;
const phone = (n: number) => `+99894${RUN}${String(n).padStart(2, "0")}`;
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
let organizationId = "";
let branchId = "";
let cashId = "";
let membershipId = "";

const code = (error: unknown) => (isAppError(error) ? error.code : String(error));
const pay = (amount: number) =>
  createPayment(ceo, {
    membershipId,
    paymentMethodId: cashId,
    amount,
    bonus: 0,
    effectiveMonth: month,
    paidAt: today,
    comment: null,
  });

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
    branches: [`${TAG} Main`],
    ceoFullName: `${TAG} Director`,
    ceoPhone: phone(2),
    ceoPassword: "FirstPass!2026",
  });
  organizationId = org.id;
  branchId = org.branches[0]!.id;
  const ceoUser = await prisma.user.findUniqueOrThrow({ where: { phone: phone(2) } });
  ceo = {
    userId: ceoUser.id,
    fullName: `${TAG} Director`,
    organizationId,
    roles: ["CEO"],
    permissions: ["*"],
    branchIds: [branchId],
    activeBranchId: branchId,
  };
  await prisma.orgSettings.upsert({
    where: { organizationId },
    update: { refundsEnabled: true },
    create: { organizationId, refundsEnabled: true },
  });
  cashId = (await prisma.paymentMethod.findFirstOrThrow({ where: { organizationId } })).id;

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
    gender: "MALE",
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
  if (!organizationId) return;
  await prisma.user.deleteMany({ where: { id: owner.userId } });
  await prisma.auditLog.deleteMany({
    where: { OR: [{ branchId }, { organizationId }] },
  });
  await prisma.job.deleteMany({
    where: { uniqueKey: { startsWith: "fiscal:" }, type: "fiscal.issue" },
  });
  await prisma.payment.deleteMany({ where: { branchId } });
  await prisma.group.deleteMany({ where: { branchId } });
  await prisma.student.deleteMany({ where: { branchId } });
  await prisma.course.deleteMany({ where: { branchId } });
  await prisma.room.deleteMany({ where: { branchId } });
  await prisma.paymentMethod.deleteMany({ where: { organizationId } });
  await prisma.user.deleteMany({ where: { organizationId } });
  await prisma.branch.deleteMany({ where: { organizationId } });
  await prisma.organization.deleteMany({ where: { id: organizationId } });
  await prisma.$disconnect();
});

describe("fiscal receipts", () => {
  it("files nothing while the integration is off", async () => {
    const payment = await pay(100_000);
    expect(payment.fiscal).toBeNull();
    expect(await prisma.fiscalReceipt.count({ where: { paymentId: payment.id } })).toBe(0);
    await expect(issueFiscalReceiptNow(ceo, payment.id)).rejects.toSatisfy(
      (e) => code(e) === "CONFLICT",
    );
  });

  it("files a pending receipt with a job on every payment and the job issues it", async () => {
    await updateIntegration(ceo, "FISCAL", {
      isEnabled: true,
      apiUrl: "",
      apiKey: "",
      inn: "123456789",
      cashRegisterId: "KKM-1",
      vatPercent: 12,
      ikpuCode: "",
      autoIssue: true,
    });
    const payment = await pay(250_000);
    expect(payment.fiscal).toMatchObject({ kind: "SALE", status: "PENDING", provider: "fake" });
    const job = await prisma.job.findUnique({
      where: { uniqueKey: `fiscal:${payment.fiscal!.id}` },
    });
    expect(job).toMatchObject({ type: "fiscal.issue", status: "PENDING" });

    const before = fakeFiscalOutbox.length;
    const issued = await issueFiscalReceipt(prisma, payment.fiscal!.id);
    expect(issued).toMatchObject({ status: "ISSUED", attempts: 1 });
    expect(issued?.fiscalSign).toMatch(/^[0-9A-F]{12}$/);
    expect(issued?.externalId).toMatch(/^fake-sale-/);
    const sent = fakeFiscalOutbox[before]!;
    expect(sent).toMatchObject({
      kind: "SALE",
      reference: payment.id,
      amount: 250_000,
      paymentType: "CASH",
      inn: "123456789",
      cashRegisterId: "KKM-1",
      vatPercent: 12,
    });
    expect(sent.items[0]!.name).toContain(`${TAG} English`);
    // Running the job again changes nothing.
    expect(await issueFiscalReceipt(prisma, payment.fiscal!.id)).toMatchObject({ attempts: 1 });
    // The payment now carries the sign for the printed receipt.
    expect((await getPayment(ceo, payment.id)).fiscal).toMatchObject({
      status: "ISSUED",
      fiscalSign: issued?.fiscalSign,
    });

    // A refund gets its own receipt for the returned amount.
    await refundPayment(ceo, payment.id, { amount: 50_000, reason: "Overpaid" });
    const refundReceipt = await prisma.fiscalReceipt.findFirstOrThrow({
      where: { paymentId: payment.id, kind: "REFUND" },
    });
    expect(refundReceipt.refundId).not.toBeNull();
    const refundIssued = await issueFiscalReceipt(prisma, refundReceipt.id);
    expect(refundIssued).toMatchObject({ status: "ISSUED" });
    expect(fakeFiscalOutbox.at(-1)).toMatchObject({
      kind: "REFUND",
      amount: 50_000,
      originalReference: payment.id,
    });
    // A sale already issued is not issued twice by hand.
    await expect(issueFiscalReceiptNow(ceo, payment.id)).rejects.toSatisfy(
      (e) => code(e) === "CONFLICT",
    );
  });

  it("keeps a refused receipt with its error and issues it on retry", async () => {
    const payment = await pay(120_000);
    failNextFiscalReceipt("provider offline");
    await expect(issueFiscalReceipt(prisma, payment.fiscal!.id)).rejects.toThrow(
      "provider offline",
    );
    expect(
      await prisma.fiscalReceipt.findUniqueOrThrow({ where: { id: payment.fiscal!.id } }),
    ).toMatchObject({ status: "FAILED", error: "provider offline", attempts: 1 });
    const retried = await issueFiscalReceiptNow(ceo, payment.id);
    expect(retried).toMatchObject({ id: payment.fiscal!.id, status: "ISSUED", attempts: 2 });
  });

  it("files a receipt by hand for a payment made with auto-issue off", async () => {
    await updateIntegration(ceo, "FISCAL", {
      isEnabled: true,
      apiUrl: "",
      apiKey: "",
      inn: "123456789",
      cashRegisterId: "KKM-1",
      vatPercent: 12,
      ikpuCode: "",
      autoIssue: false,
    });
    const payment = await pay(90_000);
    expect(payment.fiscal).toBeNull();
    const issued = await issueFiscalReceiptNow(ceo, payment.id);
    expect(issued).toMatchObject({ kind: "SALE", status: "ISSUED", attempts: 1 });
    expect((await getPayment(ceo, payment.id)).fiscal?.status).toBe("ISSUED");
  });
});
