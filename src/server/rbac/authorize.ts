import { hasPermission, type Permission } from "@/lib/rbac/permissions";
import { AppError } from "@/server/errors/app-error";

/** What every service receives: who is acting, for which centre and in which branch. */
export interface Actor {
  userId: string;
  fullName: string;
  /** The organisation the account belongs to; nothing outside it is ever visible (A-108). */
  organizationId: string;
  roles: string[];
  permissions: string[];
  /**
   * Branches the user may work in. For users who see every branch (`*` or
   * `settings.org`) this is every branch of their organisation, so a branch
   * check never has to ask whether a branch belongs to another centre.
   */
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

/** Throws unless the actor holds at least one of the permissions. */
export function authorizeAny(actor: Actor, permissions: readonly Permission[]): void {
  if (!permissions.some((p) => can(actor, p))) {
    throw AppError.forbidden();
  }
}

/**
 * Whether the user sees every branch of their organisation (and may switch the
 * header selector to "all branches"). Their `branchIds` already list them all;
 * this only tells the two kinds of users apart.
 */
export function canAccessAllBranches(actor: Actor): boolean {
  return actor.permissions.includes("*") || actor.permissions.includes("settings.org");
}

/** Throws unless the actor may act in `branchId`. */
export function authorizeBranch(actor: Actor, branchId: string): void {
  if (!actor.branchIds.includes(branchId)) {
    throw AppError.forbidden("errors.branchForbidden");
  }
}

/**
 * Branch filter for list queries: the active branch if one is selected, else
 * every branch the actor may see. Never wider than the actor's organisation.
 */
export function branchScope(actor: Actor): { branchId: { in: string[] } } | { branchId: string } {
  if (actor.activeBranchId) {
    authorizeBranch(actor, actor.activeBranchId);
    return { branchId: actor.activeBranchId };
  }
  return { branchId: { in: actor.branchIds } };
}
