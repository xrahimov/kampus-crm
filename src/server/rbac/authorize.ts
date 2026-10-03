import { hasPermission, type Permission } from "@/lib/rbac/permissions";
import { AppError } from "@/server/errors/app-error";

/** What every service receives: who is acting and in which branch. */
export interface Actor {
  userId: string;
  fullName: string;
  roles: string[];
  permissions: string[];
  /** Branches the user may work in. Empty for users with `*` means "all". */
  branchIds: string[];
  activeBranchId: string | null;
  ip?: string | null;
}

export function can(actor: Actor, permission: Permission): boolean {
  return hasPermission(actor.permissions, permission);
}

export function authorize(actor: Actor, permission: Permission): void {
  if (!can(actor, permission)) {
    throw AppError.forbidden();
  }
}

export function canAccessAllBranches(actor: Actor): boolean {
  return actor.permissions.includes("*") || actor.permissions.includes("settings.org");
}

/** Throws unless the actor may act in `branchId`. */
export function authorizeBranch(actor: Actor, branchId: string): void {
  if (canAccessAllBranches(actor)) return;
  if (!actor.branchIds.includes(branchId)) {
    throw AppError.forbidden("errors.branchForbidden");
  }
}

/**
 * Branch filter for list queries: `undefined` means no filter (all branches),
 * otherwise the set of allowed branch ids, narrowed to the active one if set.
 */
export function branchScope(
  actor: Actor,
): { branchId: { in: string[] } } | { branchId: string } | undefined {
  if (actor.activeBranchId) {
    authorizeBranch(actor, actor.activeBranchId);
    return { branchId: actor.activeBranchId };
  }
  if (canAccessAllBranches(actor)) return undefined;
  return { branchId: { in: actor.branchIds } };
}
