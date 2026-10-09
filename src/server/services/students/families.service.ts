import type { Prisma } from "@/generated/prisma/client";
import type { MembershipStatus } from "@/lib/validation/groups";
import type { FamilyLinkInput, FamilyUpdateInput } from "@/lib/validation/students";
import { recordAudit } from "@/server/audit/audit";
import { prisma, type DbClient } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";
import { authorize, type Actor } from "@/server/rbac/authorize";
import { today } from "@/server/services/groups/shared";
import { decimalToNumber, isoToDate, mustFind } from "@/server/services/settings/shared";

/*
 * Families (A-123): siblings are linked, and one percent applies to every
 * member's groups as an ordinary discount row, so the fee engine, the reports
 * and the group's Discounts tab see it. The rows are replaced when the percent
 * changes and removed when a student leaves the family; months already charged
 * keep their price.
 */

/** Long enough to outlast any course; the row goes with the family, not by running out. */
const FAMILY_MONTHS = 120;
const CURRENT: MembershipStatus[] = ["NEW", "TRIAL", "ACTIVE", "FROZEN"];

export interface FamilyMemberDto {
  id: string;
  fullName: string;
  phone: string | null;
  isArchived: boolean;
  groups: string[];
}

export interface FamilyDto {
  id: string;
  name: string;
  discountPercent: number;
  note: string | null;
  members: FamilyMemberDto[];
}

const include = {
  students: {
    select: {
      id: true,
      fullName: true,
      phone: true,
      branchId: true,
      isArchived: true,
      memberships: {
        where: { status: { in: CURRENT } },
        select: { group: { select: { name: true } } },
        orderBy: { joinedAt: "asc" },
      },
    },
    orderBy: { fullName: "asc" },
  },
} satisfies Prisma.FamilyInclude;
type Row = Prisma.FamilyGetPayload<{ include: typeof include }>;

function toDto(row: Row): FamilyDto {
  return {
    id: row.id,
    name: row.name,
    discountPercent: row.discountPercent,
    note: row.note,
    members: row.students.map((s) => ({
      id: s.id,
      fullName: s.fullName,
      phone: s.phone,
      isArchived: s.isArchived,
      groups: s.memberships.map((m) => m.group.name),
    })),
  };
}

async function studentInScope(db: DbClient, actor: Actor, id: string) {
  const s = await mustFind(
    db.student.findUnique({
      where: { id },
      select: {
        id: true,
        fullName: true,
        branchId: true,
        familyId: true,
        branch: { select: { organizationId: true } },
      },
    }),
    "errors.studentNotFound",
  );
  if (!actor.branchIds.includes(s.branchId)) throw AppError.forbidden("errors.branchForbidden");
  return s;
}

export async function getStudentFamily(
  actor: Actor,
  studentId: string,
  db: DbClient = prisma,
): Promise<FamilyDto | null> {
  authorize(actor, "students.view");
  const s = await studentInScope(db, actor, studentId);
  if (!s.familyId) return null;
  const row = await db.family.findUnique({ where: { id: s.familyId }, include });
  return row ? toDto(row) : null;
}

/**
 * Gives every current membership of the family's members the family discount it
 * does not have yet. Cheap when the family has no discount.
 */
async function applyFamilyDiscounts(tx: DbClient, familyId: string): Promise<void> {
  const family = await tx.family.findUnique({
    where: { id: familyId },
    select: {
      discountPercent: true,
      students: {
        select: {
          memberships: {
            where: { status: { in: CURRENT }, discounts: { none: { familyId } } },
            select: {
              id: true,
              customPrice: true,
              group: { select: { course: { select: { price: true } } } },
            },
          },
        },
      },
    },
  });
  if (!family || family.discountPercent <= 0) return;
  const givenAt = isoToDate(today());
  for (const s of family.students) {
    for (const m of s.memberships) {
      const base = m.customPrice
        ? decimalToNumber(m.customPrice)
        : decimalToNumber(m.group.course.price);
      const discountedPrice = Math.round((base * (100 - family.discountPercent)) / 100);
      if (base <= 0 || discountedPrice >= base) continue;
      await tx.discount.create({
        data: {
          membershipId: m.id,
          familyId,
          discountedPrice,
          amount: base - discountedPrice,
          months: FAMILY_MONTHS,
          givenAt,
        },
      });
    }
  }
}

/** Hook for new memberships: a family member's new group gets the family discount. */
export async function applyFamilyDiscount(tx: DbClient, studentId: string): Promise<void> {
  const s = await tx.student.findUnique({ where: { id: studentId }, select: { familyId: true } });
  if (s?.familyId) await applyFamilyDiscounts(tx, s.familyId);
}

/**
 * Links two students as siblings. Whichever of them already has a family takes
 * the other in; with none, a new family is made with the given name and percent.
 */
export async function linkSibling(
  actor: Actor,
  studentId: string,
  input: FamilyLinkInput,
  db: DbClient = prisma,
): Promise<FamilyDto> {
  authorize(actor, "students.update");
  if (input.studentId === studentId) {
    throw AppError.validation({ studentId: ["validation.familySelf"] });
  }
  const [a, b] = await Promise.all([
    studentInScope(db, actor, studentId),
    studentInScope(db, actor, input.studentId),
  ]);
  if (a.branch.organizationId !== b.branch.organizationId) {
    throw AppError.validation({ studentId: ["validation.studentNotFound"] });
  }
  if (a.familyId && b.familyId && a.familyId !== b.familyId) {
    throw AppError.conflict("errors.familyOther");
  }
  const percent = input.discountPercent ?? 0;
  if (!a.familyId && !b.familyId && percent > 0) authorize(actor, "discounts.give");

  const familyId = await db.$transaction(async (tx) => {
    let id = a.familyId ?? b.familyId;
    if (!id) {
      const family = await tx.family.create({
        data: {
          organizationId: a.branch.organizationId,
          name: input.name?.trim() || a.fullName,
          discountPercent: percent,
        },
      });
      id = family.id;
    }
    for (const s of [a, b]) {
      if (s.familyId === id) continue;
      await tx.student.update({ where: { id: s.id }, data: { familyId: id } });
      await recordAudit(tx, actor, {
        action: "family.link",
        entity: "Student",
        entityId: s.id,
        after: { familyId: id, siblingId: s.id === a.id ? b.id : a.id },
        branchId: s.branchId,
      });
    }
    await applyFamilyDiscounts(tx, id);
    return id;
  });
  return toDto(await db.family.findUniqueOrThrow({ where: { id: familyId }, include }));
}

/** Takes a student out of their family; their family discount rows go, charged months keep their price. */
export async function unlinkStudent(
  actor: Actor,
  studentId: string,
  db: DbClient = prisma,
): Promise<void> {
  authorize(actor, "students.update");
  const s = await studentInScope(db, actor, studentId);
  const familyId = s.familyId;
  if (!familyId) return;
  await db.$transaction(async (tx) => {
    await tx.discount.deleteMany({ where: { familyId, membership: { studentId } } });
    await tx.student.update({ where: { id: studentId }, data: { familyId: null } });
    await recordAudit(tx, actor, {
      action: "family.unlink",
      entity: "Student",
      entityId: studentId,
      before: { familyId },
      branchId: s.branchId,
    });
    const left = await tx.student.count({ where: { familyId } });
    if (left === 0) await tx.family.delete({ where: { id: familyId } });
  });
}

/** Renames the family or changes its percent; a new percent applies from the next charged month. */
export async function updateFamily(
  actor: Actor,
  familyId: string,
  input: FamilyUpdateInput,
  db: DbClient = prisma,
): Promise<FamilyDto> {
  authorize(actor, "students.update");
  const row = await mustFind(db.family.findUnique({ where: { id: familyId }, include }));
  if (row.organizationId !== actor.organizationId) throw AppError.notFound();
  if (!row.students.some((s) => actor.branchIds.includes(s.branchId))) {
    throw AppError.forbidden("errors.branchForbidden");
  }
  const percentChanged = input.discountPercent !== row.discountPercent;
  if (percentChanged) authorize(actor, "discounts.give");
  await db.$transaction(async (tx) => {
    await tx.family.update({
      where: { id: familyId },
      data: { name: input.name, discountPercent: input.discountPercent, note: input.note ?? null },
    });
    if (percentChanged) await tx.discount.deleteMany({ where: { familyId } });
    await applyFamilyDiscounts(tx, familyId);
    await recordAudit(tx, actor, {
      action: "family.update",
      entity: "Family",
      entityId: familyId,
      before: { name: row.name, discountPercent: row.discountPercent, note: row.note },
      after: { name: input.name, discountPercent: input.discountPercent, note: input.note ?? null },
      branchId: row.students[0]?.branchId,
    });
  });
  return toDto(await db.family.findUniqueOrThrow({ where: { id: familyId }, include }));
}
