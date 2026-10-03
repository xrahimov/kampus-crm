import type { Prisma } from "@/generated/prisma/client";
import type {
  AddMemberInput,
  MembershipStatus,
  MembershipUpdateInput,
} from "@/lib/validation/groups";
import { recordAudit } from "@/server/audit/audit";
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

function toDto(row: Row): MembershipDto {
  return {
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
  return rows.map(toDto);
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

export async function updateMembership(
  actor: Actor,
  id: string,
  input: MembershipUpdateInput,
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
  const terminal = input.status === "ARCHIVED" || input.status === "GRADUATED";
  return db.$transaction(async (tx) => {
    const updated = await tx.groupMembership.update({
      where: { id },
      data: {
        ...(input.status !== undefined ? { status: input.status } : {}),
        ...(terminal ? { leftAt: isoToDate(today()) } : {}),
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

/** "Guruhdan chiqarish": the membership is archived with today's leave date. */
export async function removeMember(
  actor: Actor,
  id: string,
  db: DbClient = prisma,
): Promise<MembershipDto> {
  return updateMembership(actor, id, { status: "ARCHIVED" }, db);
}
