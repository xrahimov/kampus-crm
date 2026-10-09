import type { Prisma } from "@/generated/prisma/client";
import type { Page } from "@/lib/validation/common";
import type {
  PaymentFilters,
  PaymentInput,
  PaymentSortField,
  RefundInput,
} from "@/lib/validation/students";
import { recordAudit } from "@/server/audit/audit";
import { notifyUsers } from "@/server/services/dashboard/notifications.service";
import { refreshStudentDebts } from "@/server/services/debts/debts.service";
import { notifyStaff } from "@/server/services/integrations/bot-recipients.service";
import { queueAutoSms } from "@/server/services/sms/auto-sms.service";
import { prisma, type DbClient } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";
import type { ParsedList } from "@/server/http/list-query";
import { authorize, branchScope, type Actor } from "@/server/rbac/authorize";
import { findGroupInScope } from "@/server/services/groups/shared";
import { dateToIso, decimalToNumber, isoToDate, mustFind } from "@/server/services/settings/shared";

import { membershipBalances, type MembershipBalance } from "./balances";
import { studentScope } from "./students.service";

/* "To'lov" (EXP §5 form, §6 history, §11 header button) and "Pul qaytarish". */

export interface PaymentDto {
  id: string;
  studentId: string;
  studentName: string;
  membershipId: string;
  groupId: string;
  groupName: string;
  branchId: string;
  methodName: string | null;
  amount: number;
  bonus: number;
  refunded: number;
  effectiveMonth: string;
  paidAt: string;
  comment: string | null;
  receivedByName: string | null;
  createdAt: string;
}

export interface PaymentInfoDto extends MembershipBalance {
  groupName: string;
  studentName: string;
  groupStatus: string;
  /** Course months the payment may apply to. */
  months: string[];
}

export interface ReceiptDto extends PaymentDto {
  organizationName: string;
  logoUrl: string | null;
  teacherName: string | null;
  coursePrice: number;
  settings: {
    address: string | null;
    phone: string | null;
    visibleFields: string[];
    logoPosition: "TOP" | "BOTTOM";
    footerText: string | null;
  };
}

const include = {
  student: { select: { fullName: true } },
  membership: { select: { groupId: true, group: { select: { name: true } } } },
  paymentMethod: { select: { name: true } },
  receivedBy: { select: { fullName: true } },
  refunds: { select: { amount: true } },
} satisfies Prisma.PaymentInclude;
type Row = Prisma.PaymentGetPayload<{ include: typeof include }>;

function toDto(row: Row): PaymentDto {
  return {
    id: row.id,
    studentId: row.studentId,
    studentName: row.student.fullName,
    membershipId: row.membershipId,
    groupId: row.membership.groupId,
    groupName: row.membership.group.name,
    branchId: row.branchId,
    methodName: row.paymentMethod?.name ?? null,
    amount: decimalToNumber(row.amount),
    bonus: decimalToNumber(row.bonus),
    refunded: row.refunds.reduce((s, r) => s + decimalToNumber(r.amount), 0),
    effectiveMonth: dateToIso(row.effectiveMonth),
    paidAt: dateToIso(row.paidAt),
    comment: row.comment,
    receivedByName: row.receivedBy?.fullName ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

async function findMembershipForPayment(db: DbClient, actor: Actor, membershipId: string) {
  const m = await mustFind(
    db.groupMembership.findUnique({
      where: { id: membershipId },
      select: {
        id: true,
        studentId: true,
        groupId: true,
        status: true,
        student: { select: { fullName: true, branchId: true } },
        group: {
          select: { name: true, status: true, branchId: true, startDate: true, endDate: true },
        },
      },
    }),
    "errors.memberUnknown",
  );
  await findGroupInScope(db, actor, m.groupId, {});
  return m;
}

/** What the "To'lov" dialog needs for a chosen group: balance, suggestions, months. */
export async function getPaymentInfo(
  actor: Actor,
  membershipId: string,
  db: DbClient = prisma,
): Promise<PaymentInfoDto> {
  authorize(actor, "students.view");
  const m = await findMembershipForPayment(db, actor, membershipId);
  const balance = (await membershipBalances(db, [membershipId])).get(membershipId)!;
  const months: string[] = [];
  const start = `${dateToIso(m.group.startDate).slice(0, 7)}-01`;
  const end = `${dateToIso(m.group.endDate).slice(0, 7)}-01`;
  for (let x = start; x <= end;) {
    months.push(x);
    const [y, mo] = x.split("-").map(Number) as [number, number];
    x = mo === 12 ? `${y + 1}-01-01` : `${y}-${String(mo + 1).padStart(2, "0")}-01`;
  }
  return {
    ...balance,
    groupName: m.group.name,
    studentName: m.student.fullName,
    groupStatus: m.group.status,
    months,
  };
}

export async function createPayment(
  actor: Actor,
  input: PaymentInput,
  db: DbClient = prisma,
): Promise<PaymentDto> {
  authorize(actor, "payments.create");
  const m = await findMembershipForPayment(db, actor, input.membershipId);
  const organizationId = actor.organizationId;
  const method = await mustFind(
    db.paymentMethod.findFirst({
      where: { id: input.paymentMethodId, organizationId, isActive: true },
    }),
    "errors.paymentMethodUnknown",
  );
  return db.$transaction(async (tx) => {
    const row = await tx.payment.create({
      data: {
        studentId: m.studentId,
        membershipId: m.id,
        branchId: m.group.branchId,
        paymentMethodId: method.id,
        amount: input.amount,
        bonus: input.bonus,
        effectiveMonth: isoToDate(input.effectiveMonth),
        paidAt: isoToDate(input.paidAt),
        comment: input.comment ?? null,
        receivedById: actor.userId || null,
      },
      include,
    });
    const dto = toDto(row);
    await recordAudit(tx, actor, {
      action: "payment.create",
      entity: "Payment",
      entityId: row.id,
      after: {
        amount: dto.amount,
        bonus: dto.bonus,
        effectiveMonth: dto.effectiveMonth,
        paidAt: dto.paidAt,
        groupId: dto.groupId,
        method: dto.methodName,
      },
      branchId: m.group.branchId,
    });
    // "To'lov qilgandan so'ng sms yuborish" and the Telegram staff feed (A-88, A-85).
    await queueAutoSms(tx, {
      event: "PAYMENT_MADE",
      studentId: m.studentId,
      refKey: `payment:${row.id}`,
      vars: { groupName: dto.groupName, amount: String(dto.amount), date: dto.paidAt },
    });
    await notifyStaff(tx, {
      organizationId: actor.organizationId,
      branchId: m.group.branchId,
      text: `To'lov: ${dto.studentName} — ${dto.amount} (${dto.groupName}), ${actor.fullName}`,
    });
    // The in-app bell for the branch's cashiers and managers (A-97).
    await notifyUsers(tx, {
      kind: "PAYMENT",
      params: {
        name: dto.studentName,
        amount: dto.amount,
        group: dto.groupName,
        by: actor.fullName,
      },
      href: `/students/${m.studentId}`,
      branchId: m.group.branchId,
      permission: "payments.create",
      excludeUserId: actor.userId,
    });
    // A payment that clears the debt closes the student's collection case at once (A-112).
    await refreshStudentDebts(tx, m.studentId);
    return dto;
  });
}

export async function getPayment(
  actor: Actor,
  id: string,
  db: DbClient = prisma,
): Promise<PaymentDto> {
  authorize(actor, "students.view");
  const row = await mustFind(db.payment.findUnique({ where: { id }, include }));
  if (!actor.branchIds.includes(row.branchId)) {
    throw AppError.forbidden("errors.branchForbidden");
  }
  const visible = await db.student.count({ where: { id: row.studentId, ...studentScope(actor) } });
  if (visible === 0) throw AppError.forbidden();
  return toDto(row);
}

/** Everything the printable receipt shows (EXP §8 "Chek sozlamalari" preview). */
export async function getReceipt(
  actor: Actor,
  id: string,
  db: DbClient = prisma,
): Promise<ReceiptDto> {
  const payment = await getPayment(actor, id, db);
  const organizationId = actor.organizationId;
  const [org, settings, membership] = await Promise.all([
    db.organization.findUniqueOrThrow({
      where: { id: organizationId },
      select: { name: true, logoUrl: true },
    }),
    db.receiptSettings.findUnique({ where: { organizationId } }),
    db.groupMembership.findUniqueOrThrow({
      where: { id: payment.membershipId },
      select: {
        group: {
          select: {
            course: { select: { price: true } },
            teachers: {
              where: { role: "MAIN" },
              take: 1,
              select: { user: { select: { fullName: true } } },
            },
          },
        },
      },
    }),
  ]);
  return {
    ...payment,
    organizationName: org.name,
    logoUrl: org.logoUrl,
    teacherName: membership.group.teachers[0]?.user.fullName ?? null,
    coursePrice: decimalToNumber(membership.group.course.price),
    settings: {
      address: settings?.address ?? null,
      phone: settings?.phone ?? null,
      visibleFields: settings?.visibleFields ?? DEFAULT_RECEIPT_FIELDS,
      logoPosition: settings?.logoPosition ?? "TOP",
      footerText: settings?.footerText ?? null,
    },
  };
}

export const DEFAULT_RECEIPT_FIELDS = [
  "logo",
  "header",
  "address",
  "phone",
  "printedAt",
  "paymentId",
  "student",
  "group",
  "method",
  "paidAt",
  "cashier",
  "amount",
  "footer",
  "qr",
];

export async function listPayments(
  actor: Actor,
  query: ParsedList<PaymentSortField>,
  filters: PaymentFilters = {},
  db: DbClient = prisma,
): Promise<Page<PaymentDto> & { totalAmount: number }> {
  authorize(actor, "students.view");
  const where: Prisma.PaymentWhereInput = {
    ...branchScope(actor),
    student: studentScope(actor),
    ...(filters.studentId ? { studentId: filters.studentId } : {}),
    ...(filters.membershipId ? { membershipId: filters.membershipId } : {}),
    ...(filters.groupId ? { membership: { groupId: filters.groupId } } : {}),
    ...(filters.paymentMethodId ? { paymentMethodId: filters.paymentMethodId } : {}),
    ...(filters.receivedById ? { receivedById: filters.receivedById } : {}),
    ...(filters.from || filters.to
      ? {
          paidAt: {
            ...(filters.from ? { gte: isoToDate(filters.from) } : {}),
            ...(filters.to ? { lte: isoToDate(filters.to) } : {}),
          },
        }
      : {}),
    ...(query.q
      ? {
          student: { ...studentScope(actor), fullName: { contains: query.q, mode: "insensitive" } },
        }
      : {}),
  };
  const [total, sum, rows] = await Promise.all([
    db.payment.count({ where }),
    db.payment.aggregate({ where, _sum: { amount: true } }),
    db.payment.findMany({
      where,
      include,
      orderBy: [{ [query.sort.field]: query.sort.direction }, { id: "asc" }],
      skip: query.skip,
      take: query.take,
    }),
  ]);
  return {
    items: rows.map(toDto),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalAmount: sum._sum.amount ? decimalToNumber(sum._sum.amount) : 0,
  };
}

/** "Pul qaytarish": needs the org switch (EXP §8) and never more than what is left of the payment. */
export async function refundPayment(
  actor: Actor,
  paymentId: string,
  input: RefundInput,
  db: DbClient = prisma,
): Promise<PaymentDto> {
  authorize(actor, "payments.refund");
  const settings = await db.orgSettings.findFirst({
    where: { organizationId: actor.organizationId },
    select: { refundsEnabled: true },
  });
  if (!settings?.refundsEnabled) throw AppError.conflict("errors.refundsDisabled");
  const payment = await getPayment(actor, paymentId, db);
  const left = payment.amount - payment.refunded;
  if (input.amount > left) throw AppError.validation({ amount: ["validation.refundTooLarge"] });
  return db.$transaction(async (tx) => {
    await tx.refund.create({
      data: {
        paymentId,
        amount: input.amount,
        reason: input.reason ?? null,
        refundedById: actor.userId || null,
      },
    });
    await recordAudit(tx, actor, {
      action: "payment.refund",
      entity: "Payment",
      entityId: paymentId,
      after: { amount: input.amount, reason: input.reason ?? null, groupId: payment.groupId },
      branchId: payment.branchId,
    });
    const row = await tx.payment.findUniqueOrThrow({ where: { id: paymentId }, include });
    await refreshStudentDebts(tx, row.studentId);
    return toDto(row);
  });
}

export interface PaymentOptionsDto {
  methods: Array<{ id: string; name: string }>;
  printReceiptAfterPayment: boolean;
  refundsEnabled: boolean;
}

/** What the "To'lov" and "Pul qaytarish" dialogs need, for anyone who may see students. */
export async function getPaymentOptions(
  actor: Actor,
  db: DbClient = prisma,
): Promise<PaymentOptionsDto> {
  authorize(actor, "students.view");
  const organizationId = actor.organizationId;
  const [methods, settings] = await Promise.all([
    db.paymentMethod.findMany({
      where: { organizationId, isActive: true },
      select: { id: true, name: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
    db.orgSettings.findUnique({
      where: { organizationId },
      select: { printReceiptAfterPayment: true, refundsEnabled: true },
    }),
  ]);
  return {
    methods,
    printReceiptAfterPayment: settings?.printReceiptAfterPayment ?? false,
    refundsEnabled: settings?.refundsEnabled ?? false,
  };
}
