import type { Prisma } from "@/generated/prisma/client";
import type { DiscountInput } from "@/lib/validation/students";
import { recordAudit } from "@/server/audit/audit";
import { prisma, type DbClient } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";
import { authorize, type Actor } from "@/server/rbac/authorize";
import { findGroupInScope, today } from "@/server/services/groups/shared";
import { dateToIso, decimalToNumber, isoToDate, mustFind } from "@/server/services/settings/shared";

/* "Chegirmalar" tab (EXP §5): a reduced price for the next N charged months (A-10). */

export interface DiscountDto {
  id: string;
  membershipId: string;
  studentId: string;
  studentName: string;
  discountedPrice: number;
  amount: number;
  percent: number;
  months: number;
  remainingMonths: number;
  givenAt: string;
  comment: string | null;
  createdByName: string | null;
}

const include = {
  membership: {
    select: {
      studentId: true,
      customPrice: true,
      student: { select: { fullName: true } },
      group: { select: { course: { select: { price: true } } } },
    },
  },
  createdBy: { select: { fullName: true } },
  _count: { select: { charges: true } },
} satisfies Prisma.DiscountInclude;
type Row = Prisma.DiscountGetPayload<{ include: typeof include }>;

function toDto(row: Row): DiscountDto {
  const base = row.membership.customPrice
    ? decimalToNumber(row.membership.customPrice)
    : decimalToNumber(row.membership.group.course.price);
  const discountedPrice = decimalToNumber(row.discountedPrice);
  return {
    id: row.id,
    membershipId: row.membershipId,
    studentId: row.membership.studentId,
    studentName: row.membership.student.fullName,
    discountedPrice,
    amount: decimalToNumber(row.amount),
    percent: base > 0 ? Math.round(((base - discountedPrice) / base) * 100) : 0,
    months: row.months,
    remainingMonths: Math.max(0, row.months - row._count.charges),
    givenAt: dateToIso(row.givenAt),
    comment: row.comment,
    createdByName: row.createdBy?.fullName ?? null,
  };
}

export async function listGroupDiscounts(
  actor: Actor,
  groupId: string,
  db: DbClient = prisma,
): Promise<DiscountDto[]> {
  authorize(actor, "groups.view");
  await findGroupInScope(db, actor, groupId, {});
  const rows = await db.discount.findMany({
    where: { membership: { groupId } },
    include,
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toDto);
}

export async function giveDiscount(
  actor: Actor,
  input: DiscountInput,
  /** When given, the membership must belong to this group (the URL the request came through). */
  expectedGroupId?: string,
  db: DbClient = prisma,
): Promise<DiscountDto> {
  authorize(actor, "discounts.give");
  const m = await mustFind(
    db.groupMembership.findUnique({
      where: { id: input.membershipId },
      select: {
        groupId: true,
        status: true,
        customPrice: true,
        group: { select: { branchId: true, course: { select: { price: true } } } },
      },
    }),
    "errors.memberUnknown",
  );
  if (expectedGroupId && m.groupId !== expectedGroupId) {
    throw AppError.validation({ membershipId: ["validation.memberUnknown"] });
  }
  await findGroupInScope(db, actor, m.groupId, {});
  const base = m.customPrice
    ? decimalToNumber(m.customPrice)
    : decimalToNumber(m.group.course.price);
  if (input.discountedPrice >= base) {
    throw AppError.validation({ discountedPrice: ["validation.discountBelowPrice"] });
  }
  return db.$transaction(async (tx) => {
    const row = await tx.discount.create({
      data: {
        membershipId: input.membershipId,
        discountedPrice: input.discountedPrice,
        amount: base - input.discountedPrice,
        months: input.months,
        givenAt: isoToDate(today()),
        comment: input.comment ?? null,
        createdById: actor.userId || null,
      },
      include,
    });
    const dto = toDto(row);
    await recordAudit(tx, actor, {
      action: "discount.give",
      entity: "GroupMembership",
      entityId: input.membershipId,
      after: { discountedPrice: dto.discountedPrice, months: dto.months, comment: dto.comment },
      branchId: m.group.branchId,
    });
    return dto;
  });
}

/** Removing a discount keeps the months already charged at the reduced price. */
export async function deleteDiscount(
  actor: Actor,
  id: string,
  db: DbClient = prisma,
): Promise<void> {
  authorize(actor, "discounts.give");
  const row = await mustFind(db.discount.findUnique({ where: { id }, include }));
  const membership = await db.groupMembership.findUniqueOrThrow({
    where: { id: row.membershipId },
    select: { groupId: true, group: { select: { branchId: true } } },
  });
  await findGroupInScope(db, actor, membership.groupId, {});
  await db.$transaction(async (tx) => {
    await tx.discount.delete({ where: { id } });
    await recordAudit(tx, actor, {
      action: "discount.remove",
      entity: "GroupMembership",
      entityId: row.membershipId,
      before: { discountedPrice: decimalToNumber(row.discountedPrice), months: row.months },
      branchId: membership.group.branchId,
    });
  });
}
