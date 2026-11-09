import type { Prisma } from "@/generated/prisma/client";
import type { AttendanceStatus, MembershipStatus } from "@/lib/validation/groups";
import type {
  LessonPackageInput,
  LessonPackageUpdateInput,
  SellPackageInput,
} from "@/lib/validation/packages";
import { recordAudit } from "@/server/audit/audit";
import { prisma, type DbClient } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";
import { authorize, type Actor } from "@/server/rbac/authorize";
import { findGroupInScope } from "@/server/services/groups/shared";
import { dateToIso, decimalToNumber, isoToDate, mustFind } from "@/server/services/settings/shared";
import { notifyStudents } from "@/server/services/telegram/student-telegram.service";

import { preparePayment, writePayment } from "./payments.service";

/*
 * Lesson packages (A-178): a group with `billingMode = PACKAGES` sells packages
 * of N lessons at a price instead of a monthly fee. Each lesson a member is
 * marked present at takes one credit from their oldest package with credits
 * left; with none left the lesson is owed, and the next package bought takes
 * the owed lessons over. Monthly groups never touch any of this.
 */

export interface LessonPackageDto {
  id: string;
  groupId: string;
  name: string;
  lessons: number;
  price: number;
  isActive: boolean;
  sortOrder: number;
  /** How many times it was sold; a sold package cannot be deleted, only deactivated. */
  sold: number;
}

export interface PackageCreditsDto {
  membershipId: string;
  studentId: string;
  studentName: string;
  status: MembershipStatus;
  purchased: number;
  used: number;
  /** Purchased minus used; negative when lessons are owed. */
  left: number;
  lastPurchaseAt: string | null;
}

export interface PackagePurchaseDto {
  id: string;
  membershipId: string;
  studentName: string;
  name: string;
  lessons: number;
  used: number;
  price: number;
  purchasedAt: string;
  note: string | null;
  paymentId: string | null;
  createdByName: string | null;
}

export interface GroupPackagesDto {
  packages: LessonPackageDto[];
  credits: PackageCreditsDto[];
  purchases: PackagePurchaseDto[];
}

/** A member's credits: what every balance, list and portal shows (A-178). */
export interface MembershipCredits {
  purchased: number;
  used: number;
  left: number;
}

const LEFT: MembershipStatus[] = ["ARCHIVED", "GRADUATED"];

const packageInclude = {
  _count: { select: { purchases: true } },
} satisfies Prisma.LessonPackageInclude;

function toPackageDto(
  row: Prisma.LessonPackageGetPayload<{ include: typeof packageInclude }>,
): LessonPackageDto {
  return {
    id: row.id,
    groupId: row.groupId,
    name: row.name,
    lessons: row.lessons,
    price: decimalToNumber(row.price),
    isActive: row.isActive,
    sortOrder: row.sortOrder,
    sold: row._count.purchases,
  };
}

/** Credits per membership from their purchases and uses; memberships without rows get zeros. */
export async function membershipCredits(
  db: DbClient,
  membershipIds: string[],
): Promise<Map<string, MembershipCredits>> {
  const result = new Map<string, MembershipCredits>();
  if (membershipIds.length === 0) return result;
  const [purchases, uses] = await Promise.all([
    db.packagePurchase.groupBy({
      by: ["membershipId"],
      where: { membershipId: { in: membershipIds } },
      _sum: { lessons: true },
    }),
    db.packageUse.groupBy({
      by: ["membershipId"],
      where: { membershipId: { in: membershipIds } },
      _count: { _all: true },
    }),
  ]);
  const usedBy = new Map(uses.map((u) => [u.membershipId, u._count._all]));
  for (const id of membershipIds) {
    const purchased = purchases.find((p) => p.membershipId === id)?._sum.lessons ?? 0;
    const used = usedBy.get(id) ?? 0;
    result.set(id, { purchased, used, left: purchased - used });
  }
  return result;
}

async function groupWithPackages(db: DbClient, actor: Actor, groupId: string) {
  return findGroupInScope(db, actor, groupId, {
    packages: { include: packageInclude, orderBy: [{ sortOrder: "asc" }, { createdAt: "asc" }] },
  });
}

/** The Packages tab of a group page: offers, every member's credits and the sales so far. */
export async function listGroupPackages(
  actor: Actor,
  groupId: string,
  db: DbClient = prisma,
): Promise<GroupPackagesDto> {
  authorize(actor, "groups.view");
  const group = await groupWithPackages(db, actor, groupId);
  const members = await db.groupMembership.findMany({
    where: { groupId },
    select: {
      id: true,
      studentId: true,
      status: true,
      student: { select: { fullName: true } },
    },
    orderBy: [{ student: { fullName: "asc" } }, { id: "asc" }],
  });
  const [credits, purchases, lastPurchase] = await Promise.all([
    membershipCredits(
      db,
      members.map((m) => m.id),
    ),
    db.packagePurchase.findMany({
      where: { membership: { groupId } },
      include: {
        membership: { select: { student: { select: { fullName: true } } } },
        createdBy: { select: { fullName: true } },
        _count: { select: { uses: true } },
      },
      orderBy: [{ purchasedAt: "desc" }, { createdAt: "desc" }],
    }),
    db.packagePurchase.groupBy({
      by: ["membershipId"],
      where: { membership: { groupId } },
      _max: { purchasedAt: true },
    }),
  ]);
  const lastBy = new Map(lastPurchase.map((p) => [p.membershipId, p._max.purchasedAt]));
  return {
    packages: group.packages.map(toPackageDto),
    credits: members
      // Members who left stay listed only while they still have (or owe) lessons.
      .filter((m) => !LEFT.includes(m.status) || (credits.get(m.id)?.left ?? 0) !== 0)
      .map((m) => {
        const c = credits.get(m.id) ?? { purchased: 0, used: 0, left: 0 };
        const last = lastBy.get(m.id) ?? null;
        return {
          membershipId: m.id,
          studentId: m.studentId,
          studentName: m.student.fullName,
          status: m.status,
          purchased: c.purchased,
          used: c.used,
          left: c.left,
          lastPurchaseAt: last ? dateToIso(last) : null,
        };
      }),
    purchases: purchases.map((p) => ({
      id: p.id,
      membershipId: p.membershipId,
      studentName: p.membership.student.fullName,
      name: p.name,
      lessons: p.lessons,
      used: p._count.uses,
      price: decimalToNumber(p.price),
      purchasedAt: dateToIso(p.purchasedAt),
      note: p.note,
      paymentId: p.paymentId,
      createdByName: p.createdBy?.fullName ?? null,
    })),
  };
}

export async function createLessonPackage(
  actor: Actor,
  groupId: string,
  input: LessonPackageInput,
  db: DbClient = prisma,
): Promise<LessonPackageDto> {
  authorize(actor, "groups.update");
  const group = await findGroupInScope(db, actor, groupId, {});
  return db.$transaction(async (tx) => {
    const row = await tx.lessonPackage.create({
      data: {
        groupId,
        name: input.name,
        lessons: input.lessons,
        price: input.price,
        isActive: input.isActive,
        sortOrder: input.sortOrder,
      },
      include: packageInclude,
    });
    await recordAudit(tx, actor, {
      action: "package.create",
      entity: "LessonPackage",
      entityId: row.id,
      after: { groupId, name: row.name, lessons: row.lessons, price: decimalToNumber(row.price) },
      branchId: group.branchId,
    });
    return toPackageDto(row);
  });
}

async function findPackage(db: DbClient, groupId: string, packageId: string) {
  return mustFind(
    db.lessonPackage.findFirst({ where: { id: packageId, groupId }, include: packageInclude }),
    "errors.packageUnknown",
  );
}

export async function updateLessonPackage(
  actor: Actor,
  groupId: string,
  packageId: string,
  input: LessonPackageUpdateInput,
  db: DbClient = prisma,
): Promise<LessonPackageDto> {
  authorize(actor, "groups.update");
  const group = await findGroupInScope(db, actor, groupId, {});
  const before = await findPackage(db, groupId, packageId);
  return db.$transaction(async (tx) => {
    const row = await tx.lessonPackage.update({
      where: { id: packageId },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.lessons !== undefined ? { lessons: input.lessons } : {}),
        ...(input.price !== undefined ? { price: input.price } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.sortOrder !== undefined ? { sortOrder: input.sortOrder } : {}),
      },
      include: packageInclude,
    });
    await recordAudit(tx, actor, {
      action: "package.update",
      entity: "LessonPackage",
      entityId: row.id,
      before: {
        name: before.name,
        lessons: before.lessons,
        price: decimalToNumber(before.price),
        isActive: before.isActive,
      },
      after: {
        name: row.name,
        lessons: row.lessons,
        price: decimalToNumber(row.price),
        isActive: row.isActive,
      },
      branchId: group.branchId,
    });
    return toPackageDto(row);
  });
}

/** Removes an unsold package; a sold one is deactivated instead so its sales keep their name. */
export async function deleteLessonPackage(
  actor: Actor,
  groupId: string,
  packageId: string,
  db: DbClient = prisma,
): Promise<void> {
  authorize(actor, "groups.update");
  const group = await findGroupInScope(db, actor, groupId, {});
  const row = await findPackage(db, groupId, packageId);
  await db.$transaction(async (tx) => {
    if (row._count.purchases > 0) {
      await tx.lessonPackage.update({ where: { id: packageId }, data: { isActive: false } });
    } else {
      await tx.lessonPackage.delete({ where: { id: packageId } });
    }
    await recordAudit(tx, actor, {
      action: "package.delete",
      entity: "LessonPackage",
      entityId: packageId,
      before: { name: row.name, lessons: row.lessons, price: decimalToNumber(row.price) },
      branchId: group.branchId,
    });
  });
}

/**
 * Sells a package to a member: one payment of its price through the cash desk
 * (with the receipt, SMS and feed every payment gets) and the credits, in one
 * transaction. Lessons the member already owes are covered first.
 */
export async function sellPackage(
  actor: Actor,
  groupId: string,
  input: SellPackageInput,
  db: DbClient = prisma,
): Promise<PackagePurchaseDto> {
  authorize(actor, "payments.create");
  const group = await findGroupInScope(db, actor, groupId, {});
  if (group.billingMode !== "PACKAGES") throw AppError.conflict("errors.billingNotPackages");
  const pkg = await findPackage(db, groupId, input.packageId);
  if (!pkg.isActive) throw AppError.conflict("errors.packageInactive");
  const prepared = await preparePayment(db, actor, input);
  if (prepared.m.groupId !== groupId) throw AppError.notFound("errors.memberUnknown");
  if (LEFT.includes(prepared.m.status)) throw AppError.conflict("errors.memberLeft");
  return db.$transaction(async (tx) => {
    const price = decimalToNumber(pkg.price);
    const payment =
      price > 0
        ? await writePayment(tx, actor, prepared, {
            membershipId: input.membershipId,
            paymentMethodId: input.paymentMethodId,
            amount: price,
            bonus: 0,
            effectiveMonth: `${input.paidAt.slice(0, 7)}-01`,
            paidAt: input.paidAt,
            comment: input.comment || pkg.name,
          })
        : null;
    const row = await tx.packagePurchase.create({
      data: {
        membershipId: input.membershipId,
        packageId: pkg.id,
        paymentId: payment?.id ?? null,
        name: pkg.name,
        lessons: pkg.lessons,
        price: pkg.price,
        purchasedAt: isoToDate(input.paidAt),
        note: input.comment || null,
        createdById: actor.userId || null,
      },
      include: { createdBy: { select: { fullName: true } } },
    });
    // Lessons attended with no credit left are owed; the new package takes them over, oldest first.
    const owed = await tx.packageUse.findMany({
      where: { membershipId: input.membershipId, purchaseId: null },
      orderBy: { createdAt: "asc" },
      take: pkg.lessons,
      select: { lessonId: true },
    });
    if (owed.length > 0) {
      await tx.packageUse.updateMany({
        where: {
          membershipId: input.membershipId,
          lessonId: { in: owed.map((u) => u.lessonId) },
        },
        data: { purchaseId: row.id },
      });
    }
    await recordAudit(tx, actor, {
      action: "package.sell",
      entity: "PackagePurchase",
      entityId: row.id,
      after: {
        groupId,
        membershipId: input.membershipId,
        name: row.name,
        lessons: row.lessons,
        price,
        paymentId: payment?.id ?? null,
      },
      branchId: group.branchId,
    });
    return {
      id: row.id,
      membershipId: row.membershipId,
      studentName: prepared.m.student.fullName,
      name: row.name,
      lessons: row.lessons,
      used: owed.length,
      price,
      purchasedAt: dateToIso(row.purchasedAt),
      note: row.note,
      paymentId: row.paymentId,
      createdByName: row.createdBy?.fullName ?? null,
    };
  });
}

/**
 * Follows an attendance mark in a package group: PRESENT takes one credit from
 * the oldest package with credits left (or owes the lesson); any other mark
 * gives the credit back. Called inside the attendance transaction.
 */
export async function recordPackageUse(
  tx: DbClient,
  input: {
    lessonId: string;
    membershipId: string;
    studentId: string;
    groupName: string;
    status: AttendanceStatus;
  },
): Promise<void> {
  const key = { lessonId: input.lessonId, membershipId: input.membershipId };
  const existing = await tx.packageUse.findUnique({ where: { lessonId_membershipId: key } });
  if (input.status !== "PRESENT") {
    if (existing) await tx.packageUse.delete({ where: { lessonId_membershipId: key } });
    return;
  }
  if (existing) return;
  const purchases = await tx.packagePurchase.findMany({
    where: { membershipId: input.membershipId },
    select: { id: true, lessons: true, _count: { select: { uses: true } } },
    orderBy: [{ purchasedAt: "asc" }, { createdAt: "asc" }],
  });
  const open = purchases.find((p) => p._count.uses < p.lessons);
  await tx.packageUse.create({ data: { ...key, purchaseId: open?.id ?? null } });
  // One line on Telegram when the package is about to run out (A-178).
  const purchased = purchases.reduce((s, p) => s + p.lessons, 0);
  const used = await tx.packageUse.count({ where: { membershipId: input.membershipId } });
  const left = purchased - used;
  if (purchased > 0 && left <= 1) {
    await notifyStudents(tx, {
      studentIds: [input.studentId],
      kind: "packageLow",
      refKey: `package-low:${input.membershipId}:${input.lessonId}`,
      values: { group: input.groupName, left: Math.max(left, 0) },
    });
  }
}
