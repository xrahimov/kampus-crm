import { cache } from "react";

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
  };
  roles: Array<{ code: string; name: string }>;
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
    },
  });
  if (!user || user.isArchived) return null;

  const roles = user.roles.filter((r) => r.role.isActive).map((r) => r.role);
  const permissions = Array.from(new Set(roles.flatMap((r) => r.permissions)));
  const branches = user.branches
    .map((b) => b.branch)
    .filter((b) => b.isActive)
    .map((b) => ({ id: b.id, name: b.name }));

  // Users who see every branch see every branch of their own centre (A-108):
  // the selector lists the active ones, the actor may act in all of them.
  const allBranchAccess = permissions.includes("*") || permissions.includes("settings.org");
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
      mustChangePassword: user.mustChangePassword,
      signInCode: user.signInCode,
    },
    roles: roles.map((r) => ({ code: r.code, name: r.name })),
    branches: visibleBranches,
    activeBranch,
    actor: {
      userId: user.id,
      fullName: user.fullName,
      organizationId: user.organizationId,
      roles: roles.map((r) => r.code),
      permissions,
      branchIds: actorBranchIds,
      activeBranchId: activeBranch?.id ?? null,
      isSiteOwner: user.isSiteOwner,
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
