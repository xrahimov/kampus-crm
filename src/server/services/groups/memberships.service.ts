import type { Prisma } from "@/generated/prisma/client";
import type {
  AddMemberInput,
  MembershipStatus,
  MembershipUpdateInput,
} from "@/lib/validation/groups";
import type { TransferInput } from "@/lib/validation/students";
import { recordAudit } from "@/server/audit/audit";
import { queueAutoSms } from "@/server/services/sms/auto-sms.service";
import { prisma, type DbClient } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";
import { authorize, branchScope, canAccessAllBranches, type Actor } from "@/server/rbac/authorize";
import {
  dateToIso,
  decimalToNumber,
  isoToDate,
  mustFind,
  rethrowAsAppError,
} from "@/server/services/settings/shared";

import { membershipBalances } from "@/server/services/students/balances";

import { findGroupInScope, today } from "./shared";

/* Students in a group (EXP §5 left panel). The full student module is Phase 6 (A-49). */

export interface MembershipDto {
  id: string;
  groupId: string;
  studentId: string;
  fullName: string;
  phone: string | null;
  status: MembershipStatus;
  joinedAt: string;
  leftAt: string | null;
  customPrice: number | null;
  note: string | null;
  activatedAt: string | null;
  frozenAt: string | null;
  leaveReason: string | null;
  /** Filled by `listMembers` only (Phase 6); null elsewhere. */
  balance: number | null;
}

export const MEMBER_SORT_FIELDS = ["fullName", "status", "joinedAt"] as const;
export type MemberSortField = (typeof MEMBER_SORT_FIELDS)[number];

/** Allowed status moves (A-08). ARCHIVED and GRADUATED are terminal here; Phase 6 adds "return to leads". */
const TRANSITIONS: Record<MembershipStatus, MembershipStatus[]> = {
  NEW: ["TRIAL", "ACTIVE", "ARCHIVED"],
  TRIAL: ["ACTIVE", "ARCHIVED"],
  ACTIVE: ["FROZEN", "GRADUATED", "ARCHIVED"],
  FROZEN: ["ACTIVE", "ARCHIVED"],
  ARCHIVED: [],
  GRADUATED: [],
};

const LEFT_STATUSES: MembershipStatus[] = ["ARCHIVED", "GRADUATED"];

const include = {
  student: { select: { fullName: true, phone: true } },
} satisfies Prisma.GroupMembershipInclude;
type Row = Prisma.GroupMembershipGetPayload<{ include: typeof include }>;

function toDto(row: Row, balance: number | null = null): MembershipDto {
  return {
    balance,
    id: row.id,
    groupId: row.groupId,
    studentId: row.studentId,
    fullName: row.student.fullName,
    phone: row.student.phone,
    status: row.status,
    joinedAt: dateToIso(row.joinedAt),
    leftAt: row.leftAt ? dateToIso(row.leftAt) : null,
    customPrice: row.customPrice ? decimalToNumber(row.customPrice) : null,
    note: row.note,
    activatedAt: row.activatedAt ? dateToIso(row.activatedAt) : null,
    frozenAt: row.frozenAt ? dateToIso(row.frozenAt) : null,
    leaveReason: row.leaveReason,
  };
}

export async function listMembers(
  actor: Actor,
  groupId: string,
  options: {
    archived?: boolean;
    q?: string;
    sort?: { field: MemberSortField; direction: "asc" | "desc" };
  } = {},
  db: DbClient = prisma,
): Promise<MembershipDto[]> {
  authorize(actor, "groups.view");
  await findGroupInScope(db, actor, groupId, {});
  const sort = options.sort ?? { field: "fullName", direction: "asc" };
  const orderBy: Prisma.GroupMembershipOrderByWithRelationInput =
    sort.field === "fullName"
      ? { student: { fullName: sort.direction } }
      : { [sort.field]: sort.direction };
  const rows = await db.groupMembership.findMany({
    where: {
      groupId,
      // "Removed" shows everyone who left the group (removed or graduated).
      status: options.archived ? { in: LEFT_STATUSES } : { notIn: LEFT_STATUSES },
      ...(options.q
        ? {
            student: {
              OR: [
                { fullName: { contains: options.q, mode: "insensitive" } },
                { phone: { contains: options.q } },
              ],
            },
          }
        : {}),
    },
    include,
    orderBy: [orderBy, { id: "asc" }],
  });
  const balances = await membershipBalances(
    db,
    rows.map((r) => r.id),
  );
  return rows.map((r) => toDto(r, balances.get(r.id)?.balance ?? 0));
}

/** Autocomplete for "O'quvchilarni qidiring": name or phone, inside the actor's branches. */
export async function searchStudents(
  actor: Actor,
  q: string,
  db: DbClient = prisma,
): Promise<Array<{ id: string; fullName: string; phone: string | null }>> {
  authorize(actor, "groups.update");
  if (q.trim().length < 2) return [];
  return db.student.findMany({
    where: {
      ...(branchScope(actor) ?? {}),
      isArchived: false,
      OR: [{ fullName: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }],
    },
    select: { id: true, fullName: true, phone: true },
    orderBy: { fullName: "asc" },
    take: 10,
  });
}

/** "Guruhga o'quvchi qo'shish" (manual mode). A new minimal student needs students.create. */
export async function addMember(
  actor: Actor,
  groupId: string,
  input: AddMemberInput,
  db: DbClient = prisma,
): Promise<MembershipDto> {
  authorize(actor, "groups.update");
  const group = await findGroupInScope(db, actor, groupId, {});
  if (group.status === "ARCHIVED") throw AppError.conflict("errors.groupArchived");
  let studentId = input.studentId;
  if (input.newStudent) authorize(actor, "students.create");
  if (studentId) {
    const student = await mustFind(
      db.student.findUnique({ where: { id: studentId } }),
      "errors.studentNotFound",
    );
    if (!canAccessAllBranches(actor) && !actor.branchIds.includes(student.branchId)) {
      throw AppError.forbidden("errors.branchForbidden");
    }
    if (student.isBlacklisted) throw AppError.conflict("errors.studentBlacklisted");
  }
  try {
    return await db.$transaction(async (tx) => {
      if (!studentId && input.newStudent) {
        const student = await tx.student.create({
          data: {
            branchId: group.branchId,
            fullName: input.newStudent.fullName,
            phone: input.newStudent.phone ?? null,
          },
        });
        studentId = student.id;
        await recordAudit(tx, actor, {
          action: "student.create",
          entity: "Student",
          entityId: student.id,
          after: { fullName: student.fullName, phone: student.phone, branchId: group.branchId },
          branchId: group.branchId,
        });
      }
      const row = await tx.groupMembership.create({
        data: {
          groupId,
          studentId: studentId!,
          status: input.status,
          joinedAt: isoToDate(input.joinedAt),
          activatedAt: input.status === "ACTIVE" ? isoToDate(input.joinedAt) : null,
          customPrice: input.customPrice ?? null,
          note: input.note ?? null,
        },
        include,
      });
      const dto = toDto(row);
      await recordAudit(tx, actor, {
        action: "membership.create",
        entity: "GroupMembership",
        entityId: row.id,
        after: dto,
        branchId: group.branchId,
      });
      // "Guruhga birinchi qo'shilganda" (A-88).
      await queueAutoSms(tx, {
        event: "ADDED_TO_GROUP",
        studentId: studentId!,
        refKey: `membership:${row.id}`,
        vars: { groupName: group.name },
      });
      return dto;
    });
  } catch (error) {
    rethrowAsAppError(error, "studentId");
  }
}

async function findMembershipInScope(db: DbClient, actor: Actor, id: string) {
  const row = await mustFind(db.groupMembership.findUnique({ where: { id }, include }));
  const group = await findGroupInScope(db, actor, row.groupId, {});
  return { row, group };
}

/** Charging side effects of a status move (A-10, A-59). */
function statusData(
  from: MembershipStatus,
  to: MembershipStatus,
): Prisma.GroupMembershipUpdateInput {
  const now = isoToDate(today());
  const data: Prisma.GroupMembershipUpdateInput = { status: to };
  if (to === "ACTIVE" && from !== "ACTIVE") {
    data.frozenAt = null;
    if (from === "NEW" || from === "TRIAL") data.activatedAt = now;
  }
  if (to === "FROZEN") data.frozenAt = now;
  if (to === "ARCHIVED" || to === "GRADUATED") data.leftAt = now;
  return data;
}

export async function updateMembership(
  actor: Actor,
  id: string,
  input: MembershipUpdateInput & { leaveReason?: string | null },
  db: DbClient = prisma,
): Promise<MembershipDto> {
  authorize(actor, "groups.update");
  const { row, group } = await findMembershipInScope(db, actor, id);
  const before = toDto(row);
  if (
    input.status &&
    input.status !== row.status &&
    !TRANSITIONS[row.status].includes(input.status)
  ) {
    throw AppError.validation({ status: ["validation.statusTransition"] });
  }
  return db.$transaction(async (tx) => {
    const updated = await tx.groupMembership.update({
      where: { id },
      data: {
        ...(input.status !== undefined && input.status !== row.status
          ? statusData(row.status, input.status)
          : {}),
        ...(input.leaveReason !== undefined ? { leaveReason: input.leaveReason } : {}),
        ...(input.customPrice !== undefined ? { customPrice: input.customPrice } : {}),
        ...(input.note !== undefined ? { note: input.note } : {}),
      },
      include,
    });
    const after = toDto(updated);
    await recordAudit(tx, actor, {
      action: "membership.update",
      entity: "GroupMembership",
      entityId: id,
      before,
      after,
      branchId: group.branchId,
    });
    return after;
  });
}

/** "O'quvchilarni faollashtirish": every NEW or TRIAL member of the group becomes ACTIVE. */
export async function activateMembers(
  actor: Actor,
  groupId: string,
  db: DbClient = prisma,
): Promise<number> {
  authorize(actor, "groups.update");
  const group = await findGroupInScope(db, actor, groupId, {});
  const rows = await db.groupMembership.findMany({
    where: { groupId, status: { in: ["NEW", "TRIAL"] } },
    include,
  });
  await db.$transaction(async (tx) => {
    for (const row of rows) {
      const updated = await tx.groupMembership.update({
        where: { id: row.id },
        data: statusData(row.status, "ACTIVE"),
        include,
      });
      await recordAudit(tx, actor, {
        action: "membership.update",
        entity: "GroupMembership",
        entityId: row.id,
        before: toDto(row),
        after: toDto(updated),
        branchId: group.branchId,
      });
    }
  });
  return rows.length;
}

/**
 * "FAOLLASHTIRISH" on the students list (EXP §6, A-68): every NEW or TRIAL
 * membership of the given students becomes ACTIVE today. Students outside the
 * actor's scope are ignored, not refused.
 */
export async function activateStudents(
  actor: Actor,
  studentIds: string[],
  db: DbClient = prisma,
): Promise<number> {
  authorize(actor, "groups.update");
  const rows = await db.groupMembership.findMany({
    where: {
      studentId: { in: studentIds },
      status: { in: ["NEW", "TRIAL"] },
      group: { ...(branchScope(actor) ?? {}), status: { not: "ARCHIVED" } },
    },
    include: { ...include, group: { select: { branchId: true } } },
  });
  await db.$transaction(async (tx) => {
    for (const row of rows) {
      const updated = await tx.groupMembership.update({
        where: { id: row.id },
        data: statusData(row.status, "ACTIVE"),
        include,
      });
      await recordAudit(tx, actor, {
        action: "membership.update",
        entity: "GroupMembership",
        entityId: row.id,
        before: toDto(row),
        after: toDto(updated),
        branchId: row.group.branchId,
      });
    }
  });
  return rows.length;
}

/**
 * "Boshqa guruhga ko'chirish": the old membership ends on the transfer date and
 * a new one starts in the target group. Money stays on the old membership; the
 * student's total balance is unchanged (A-63).
 */
export async function transferMember(
  actor: Actor,
  id: string,
  input: TransferInput,
  db: DbClient = prisma,
): Promise<MembershipDto> {
  authorize(actor, "groups.update");
  const { row, group } = await findMembershipInScope(db, actor, id);
  if (LEFT_STATUSES.includes(row.status)) throw AppError.conflict("errors.memberLeft");
  const target = await findGroupInScope(db, actor, input.groupId, {});
  if (target.id === group.id) throw AppError.validation({ groupId: ["validation.sameGroup"] });
  if (target.status === "ARCHIVED") throw AppError.conflict("errors.groupArchived");
  try {
    return await db.$transaction(async (tx) => {
      const closed = await tx.groupMembership.update({
        where: { id },
        data: {
          status: "ARCHIVED",
          leftAt: isoToDate(input.joinedAt),
          leaveReason: input.reason ?? "transfer",
        },
        include,
      });
      await recordAudit(tx, actor, {
        action: "membership.transfer",
        entity: "GroupMembership",
        entityId: id,
        before: toDto(row),
        after: { ...toDto(closed), toGroupId: target.id },
        branchId: group.branchId,
      });
      const created = await tx.groupMembership.create({
        data: {
          groupId: target.id,
          studentId: row.studentId,
          status: "ACTIVE",
          joinedAt: isoToDate(input.joinedAt),
          activatedAt: isoToDate(input.joinedAt),
          customPrice: input.customPrice ?? null,
          note: input.note ?? null,
        },
        include,
      });
      const dto = toDto(created);
      await recordAudit(tx, actor, {
        action: "membership.create",
        entity: "GroupMembership",
        entityId: created.id,
        after: { ...dto, fromGroupId: group.id },
        branchId: target.branchId,
      });
      return dto;
    });
  } catch (error) {
    rethrowAsAppError(error, "groupId");
  }
}

/** "Guruhdan chiqarish": the membership is archived with today's leave date. */
export async function removeMember(
  actor: Actor,
  id: string,
  db: DbClient = prisma,
): Promise<MembershipDto> {
  return updateMembership(actor, id, { status: "ARCHIVED" }, db);
}
