import type { Prisma } from "@/generated/prisma/client";
import type { DbClient } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";
import { branchScope, canAccessAllBranches, type Actor } from "@/server/rbac/authorize";
import { dateToIso } from "@/server/services/settings/shared";
import { TEACHER_ROLE_CODES } from "@/server/services/staff/staff.service";

export const today = (): string => dateToIso(new Date());

/** Users whose only roles are teacher roles see just the groups they teach (A-52). */
export function ownGroupsOnly(actor: Actor): boolean {
  return (
    !actor.permissions.includes("*") &&
    actor.roles.length > 0 &&
    actor.roles.every((r) => TEACHER_ROLE_CODES.includes(r))
  );
}

/** Branch scope plus the "own groups" narrowing, as a Group filter. */
export function groupScope(actor: Actor): Prisma.GroupWhereInput {
  const where: Prisma.GroupWhereInput = { ...(branchScope(actor) ?? {}) };
  if (ownGroupsOnly(actor)) {
    where.OR = [
      { teachers: { some: { userId: actor.userId } } },
      { supportTeachers: { some: { userId: actor.userId } } },
    ];
  }
  return where;
}

/** Loads a group the actor may see, or throws NOT_FOUND / FORBIDDEN. */
export async function findGroupInScope<T extends Prisma.GroupInclude>(
  db: DbClient,
  actor: Actor,
  id: string,
  include: T,
): Promise<Prisma.GroupGetPayload<{ include: T }>> {
  const row = await db.group.findUnique({ where: { id }, include });
  if (!row) throw AppError.notFound();
  if (!canAccessAllBranches(actor) && !actor.branchIds.includes(row.branchId)) {
    throw AppError.forbidden("errors.branchForbidden");
  }
  if (ownGroupsOnly(actor)) {
    const mine = await db.group.count({
      where: {
        id,
        OR: [
          { teachers: { some: { userId: actor.userId } } },
          { supportTeachers: { some: { userId: actor.userId } } },
        ],
      },
    });
    if (mine === 0) throw AppError.forbidden();
  }
  return row as Prisma.GroupGetPayload<{ include: T }>;
}
