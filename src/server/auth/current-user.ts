import { cache } from "react";

import { resolveStaffView, type StaffView } from "@/lib/rbac/views";
import { prisma } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";
import type { Actor } from "@/server/rbac/authorize";

import { findSessionByToken, readSessionToken, type SessionRecord } from "./session";

export interface CurrentUser {
  actor: Actor;
  session: SessionRecord;
  user: {
    id: string;
    fullName: string;
    phone: string;
    photoUrl: string | null;
    /** Someone else chose the password: the app shows only the change-password page (A-124). */
    mustChangePassword: boolean;
    signInCode: "OFF" | "TELEGRAM";
    /** Has a salary rule or teaches a group, so "My salary" applies (A-127). */
    hasSalary: boolean;
  };
  /** Every active role the person holds, whichever view they are in. */
  roles: Array<{ code: string; name: string }>;
  /**
   * Which side of Kampus the person is looking at (A-194). In the teaching
   * view the actor carries only the teaching roles; `canSwitch` says the
   * header offers the other side.
   */
  view: {
    current: StaffView;
    canSwitch: boolean;
    /** The person has not used the switch yet. */
    pristine: boolean;
    teachingRoles: Array<{ code: string; name: string }>;
    otherRoles: Array<{ code: string; name: string }>;
  };
  branches: Array<{ id: string; name: string }>;
  activeBranch: { id: string; name: string } | null;
}

/**
 * Resolves the signed-in user from a raw session token.
 * Shared by the app layout (cookie) and the API wrapper (cookie or header).
 */
export async function resolveCurrentUser(
  token: string | null,
  ip?: string | null,
): Promise<CurrentUser | null> {
  if (!token) return null;
  const session = await findSessionByToken(prisma, token);
  if (!session) return null;

  const user = await prisma.user.findUnique({
    where: { id: session.userId },
    include: {
      roles: { include: { role: true } },
      branches: { include: { branch: true } },
      organization: { select: { suspendedAt: true } },
      _count: { select: { groupsTaught: true } },
    },
  });
  if (!user || user.isArchived) return null;
  // A suspended centre (A-144) signs its people out; the site owner keeps working.
  if (user.organization.suspendedAt && !user.isSiteOwner) return null;

  const roles = user.roles.filter((r) => r.role.isActive).map((r) => r.role);
  const allPermissions = Array.from(new Set(roles.flatMap((r) => r.permissions)));
  // The view in force decides which of the person's roles act (A-194). It only ever narrows.
  const view = resolveStaffView(roles, user.staffView);
  const permissions = Array.from(new Set(view.roles.flatMap((r) => r.permissions)));
  const branches = user.branches
    .map((b) => b.branch)
    .filter((b) => b.isActive)
    .map((b) => ({ id: b.id, name: b.name }));

  // Users who see every branch see every branch of their own centre (A-108):
  // the selector lists the active ones, the actor may act in all of them.
  // The branches come from all the person's roles, so the groups a director
  // teaches stay in reach in the teaching view, which shows only those groups.
  const allBranchAccess = allPermissions.includes("*") || allPermissions.includes("settings.org");
  const orgBranches = allBranchAccess
    ? await prisma.branch.findMany({
        where: { organizationId: user.organizationId },
        orderBy: { name: "asc" },
        select: { id: true, name: true, isActive: true },
      })
    : [];
  const visibleBranches = allBranchAccess
    ? orgBranches.filter((b) => b.isActive).map((b) => ({ id: b.id, name: b.name }))
    : branches;
  const actorBranchIds = allBranchAccess ? orgBranches.map((b) => b.id) : branches.map((b) => b.id);

  const activeBranch = visibleBranches.find((b) => b.id === session.activeBranchId) ?? null;

  return {
    session,
    user: {
      id: user.id,
      fullName: user.fullName,
      phone: user.phone,
      photoUrl: user.photoUrl,
      // Someone who came in through Telegram has no use for the password they were given (A-180).
      mustChangePassword: user.mustChangePassword && session.signedInWith !== "TELEGRAM",
      signInCode: user.signInCode,
      hasSalary: user.salaryMethod !== null || user._count.groupsTaught > 0,
    },
    roles: roles.map((r) => ({ code: r.code, name: r.name })),
    view: {
      current: view.current,
      canSwitch: view.canSwitch,
      pristine: user.staffView === null,
      teachingRoles: view.teachingRoles.map((r) => ({ code: r.code, name: r.name })),
      otherRoles: view.otherRoles.map((r) => ({ code: r.code, name: r.name })),
    },
    branches: visibleBranches,
    activeBranch,
    actor: {
      userId: user.id,
      fullName: user.fullName,
      organizationId: user.organizationId,
      roles: view.roles.map((r) => r.code),
      permissions,
      branchIds: actorBranchIds,
      activeBranchId: activeBranch?.id ?? null,
      // Running the server is not a teacher's business either.
      isSiteOwner: user.isSiteOwner && view.current === "FULL",
      signedInWith: session.signedInWith,
      ip: ip ?? null,
    },
  };
}

/** For server components: cached per request. */
export const getCurrentUser = cache(async (): Promise<CurrentUser | null> => {
  const token = await readSessionToken();
  return resolveCurrentUser(token);
});

export async function requireCurrentUser(): Promise<CurrentUser> {
  const current = await getCurrentUser();
  if (!current) throw AppError.unauthenticated();
  return current;
}
