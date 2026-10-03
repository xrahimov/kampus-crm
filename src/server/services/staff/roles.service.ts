import { randomBytes } from "node:crypto";

import { ALL_PERMISSIONS, PERMISSIONS, type Permission } from "@/lib/rbac/permissions";
import type { RoleInput, RoleUpdateInput } from "@/lib/validation/staff";
import { recordAudit } from "@/server/audit/audit";
import { prisma, type DbClient } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";
import { authorize, authorizeAny, type Actor } from "@/server/rbac/authorize";

import { mustFind, rethrowAsAppError } from "../settings/shared";

/* Roles (EXP §8 "Rollar (Beta)"): system roles come from the seed, custom ones from here. */

export interface RoleDto {
  id: string;
  code: string;
  name: string;
  isSystem: boolean;
  isActive: boolean;
  permissions: string[];
  userCount: number;
}

const select = {
  id: true,
  code: true,
  name: true,
  isSystem: true,
  isActive: true,
  permissions: true,
  _count: { select: { users: true } },
} as const;

type Row = { permissions: string[]; _count: { users: number } } & Omit<
  RoleDto,
  "permissions" | "userCount"
>;

function toDto(row: Row): RoleDto {
  const { _count, ...rest } = row;
  return { ...rest, userCount: _count.users };
}

/** True when the actor's own grants cover every permission in `permissions`. */
export function canGrantPermissions(actor: Actor, permissions: readonly string[]): boolean {
  if (actor.permissions.includes(ALL_PERMISSIONS)) return true;
  return permissions.every((p) => p !== ALL_PERMISSIONS && actor.permissions.includes(p));
}

/** Nobody hands out more than they hold (A-44). */
export function assertCanGrantRole(actor: Actor, role: { permissions: string[] }): void {
  if (!canGrantPermissions(actor, role.permissions)) {
    throw AppError.forbidden("errors.roleBeyondOwn");
  }
}

/** The staff and teacher forms need the role list, so viewing is wide; editing needs settings.roles. */
export async function listRoles(actor: Actor, db: DbClient = prisma): Promise<RoleDto[]> {
  authorizeAny(actor, ["settings.roles", "staff.view", "teachers.view"]);
  const rows = await db.role.findMany({ orderBy: [{ isSystem: "desc" }, { name: "asc" }], select });
  return rows.map(toDto);
}

/** Permissions grouped by module for the role editor (EXP §8 permission cards). */
export function permissionCatalogue(): Array<{ module: string; permissions: Permission[] }> {
  const groups = new Map<string, Permission[]>();
  for (const p of PERMISSIONS) {
    const moduleKey = p.split(".")[0]!;
    (groups.get(moduleKey) ?? groups.set(moduleKey, []).get(moduleKey)!).push(p);
  }
  return Array.from(groups, ([module, permissions]) => ({ module, permissions }));
}

function codeFor(name: string): string {
  const slug = name
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .replace(/[\s-]+/g, "_")
    .toUpperCase()
    .slice(0, 40);
  return `${slug || "ROLE"}_${randomBytes(2).toString("hex").toUpperCase()}`;
}

export async function createRole(
  actor: Actor,
  input: RoleInput,
  db: DbClient = prisma,
): Promise<RoleDto> {
  authorize(actor, "settings.roles");
  if (!canGrantPermissions(actor, input.permissions)) {
    throw AppError.forbidden("errors.roleBeyondOwn");
  }
  try {
    return await db.$transaction(async (tx) => {
      const row = await tx.role.create({
        data: {
          code: codeFor(input.name),
          name: input.name,
          isActive: input.isActive,
          permissions: Array.from(new Set(input.permissions)),
        },
        select,
      });
      const dto = toDto(row);
      await recordAudit(tx, actor, {
        action: "role.create",
        entity: "Role",
        entityId: row.id,
        after: dto,
      });
      return dto;
    });
  } catch (error) {
    rethrowAsAppError(error, "name");
  }
}

export async function updateRole(
  actor: Actor,
  id: string,
  input: RoleUpdateInput,
  db: DbClient = prisma,
): Promise<RoleDto> {
  authorize(actor, "settings.roles");
  return db.$transaction(async (tx) => {
    const existing = await mustFind(tx.role.findUnique({ where: { id }, select }));
    // The CEO role is the `*` grant; changing it could lock the centre out.
    if (existing.code === "CEO") throw AppError.forbidden("errors.systemRole");
    // Only someone who already holds a role's permissions may reshape it.
    assertCanGrantRole(actor, existing);
    if (input.permissions && !canGrantPermissions(actor, input.permissions)) {
      throw AppError.forbidden("errors.roleBeyondOwn");
    }
    const before = toDto(existing);
    const row = await tx.role.update({
      where: { id },
      data: {
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.isActive !== undefined ? { isActive: input.isActive } : {}),
        ...(input.permissions !== undefined
          ? { permissions: Array.from(new Set(input.permissions)) }
          : {}),
      },
      select,
    });
    const after = toDto(row);
    await recordAudit(tx, actor, {
      action: "role.update",
      entity: "Role",
      entityId: id,
      before,
      after,
    });
    return after;
  });
}

/** Custom roles only; a role still assigned to someone cannot go. */
export async function deleteRole(actor: Actor, id: string, db: DbClient = prisma): Promise<void> {
  authorize(actor, "settings.roles");
  await db.$transaction(async (tx) => {
    const existing = await mustFind(tx.role.findUnique({ where: { id }, select }));
    if (existing.isSystem) throw AppError.forbidden("errors.systemRole");
    assertCanGrantRole(actor, existing);
    if (existing._count.users > 0) throw AppError.conflict("errors.inUse");
    await tx.role.delete({ where: { id } });
    await recordAudit(tx, actor, {
      action: "role.delete",
      entity: "Role",
      entityId: id,
      before: toDto(existing),
    });
  });
}
