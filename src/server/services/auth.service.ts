import type { LoginInput } from "@/lib/validation/auth";
import { verifyPassword } from "@/server/auth/password";
import {
  checkLoginLock,
  clearLoginFailures,
  loginKeys,
  recordLoginFailure,
} from "@/server/auth/rate-limit";
import { createSession, revokeSession, type IssuedSession } from "@/server/auth/session";
import { prisma, type DbClient } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";
import type { Actor } from "@/server/rbac/authorize";
import { authorizeBranch, canAccessAllBranches } from "@/server/rbac/authorize";

export interface LoginContext {
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * Phone + password login with per-phone and per-IP lockout.
 * Wrong phone and wrong password produce the same error, so the response does
 * not reveal which phones exist.
 */
export async function login(
  input: LoginInput,
  ctx: LoginContext,
  db: DbClient = prisma,
): Promise<IssuedSession> {
  const keys = [loginKeys.phone(input.phone), ...(ctx.ip ? [loginKeys.ip(ctx.ip)] : [])];

  const lock = await checkLoginLock(db, keys);
  if (lock.locked) throw AppError.rateLimited(lock.retryAfterSeconds);

  const user = await db.user.findUnique({
    where: { phone: input.phone },
    include: { branches: { select: { branchId: true } } },
  });

  const ok = user && !user.isArchived && (await verifyPassword(user.passwordHash, input.password));

  if (!ok) {
    await recordLoginFailure(db, keys);
    await db.loginLog.create({
      data: {
        userId: user?.id ?? null,
        phone: input.phone,
        success: false,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      },
    });
    throw AppError.unauthenticated("errors.invalidCredentials");
  }

  await clearLoginFailures(db, keys);
  await db.loginLog.create({
    data: {
      userId: user.id,
      phone: input.phone,
      success: true,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    },
  });

  // Default to the user's only branch; users with several pick one in the header.
  const activeBranchId = user.branches.length === 1 ? user.branches[0]!.branchId : null;

  return createSession(db, {
    userId: user.id,
    activeBranchId,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  });
}

export async function logout(sessionId: string, db: DbClient = prisma): Promise<void> {
  await revokeSession(db, sessionId);
}

/** Switches the header branch selector (EXP §0). `null` means "all branches". */
export async function setActiveBranch(
  actor: Actor,
  sessionId: string,
  branchId: string | null,
  db: DbClient = prisma,
): Promise<void> {
  if (branchId === null) {
    if (!canAccessAllBranches(actor)) throw AppError.forbidden("errors.branchForbidden");
  } else {
    const branch = await db.branch.findFirst({ where: { id: branchId, isActive: true } });
    if (!branch) throw AppError.notFound("errors.branchNotFound");
    authorizeBranch(actor, branchId);
  }
  await db.session.update({ where: { id: sessionId }, data: { activeBranchId: branchId } });
}
