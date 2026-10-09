import { randomInt } from "node:crypto";

import type { LoginInput, VerifyCodeInput } from "@/lib/validation/auth";
import { verifyPassword } from "@/server/auth/password";
import {
  checkLoginLock,
  clearLoginFailures,
  loginKeys,
  recordLoginFailure,
} from "@/server/auth/rate-limit";
import { createSession, revokeSession, type IssuedSession } from "@/server/auth/session";
import { generateToken, safeEqual, sha256 } from "@/server/auth/tokens";
import { prisma, type DbClient } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";
import type { Actor } from "@/server/rbac/authorize";
import { authorizeBranch, canAccessAllBranches } from "@/server/rbac/authorize";
import { getTelegramNotifier } from "@/server/services/integrations/integrations.service";
import { botText } from "@/server/services/telegram/student-telegram.service";

import { noteSignIn } from "./account.service";

export interface LoginContext {
  ip?: string | null;
  userAgent?: string | null;
}

/** A Telegram sign-in code lives five minutes and survives four wrong guesses (A-124). */
export const SIGN_IN_CODE_TTL_MS = 5 * 60 * 1000;
export const SIGN_IN_CODE_MAX_ATTEMPTS = 5;

export type LoginOutcome =
  | { kind: "session"; issued: IssuedSession }
  /** The password was right; the session is issued once the Telegram code is entered. */
  | { kind: "challenge"; challengeId: string; expiresAt: string };

interface SignedInUser {
  id: string;
  phone: string;
  organizationId: string;
  fullName: string;
}

/**
 * Phone + password login with per-phone and per-IP lockout.
 * Wrong phone and wrong password produce the same error, so the response does
 * not reveal which phones exist. A person with the Telegram code switched on
 * gets a challenge instead of a session (A-124).
 */
export async function login(
  input: LoginInput,
  ctx: LoginContext,
  db: DbClient = prisma,
): Promise<LoginOutcome> {
  const keys = [loginKeys.phone(input.phone), ...(ctx.ip ? [loginKeys.ip(ctx.ip)] : [])];

  const lock = await checkLoginLock(db, keys);
  if (lock.locked) throw AppError.rateLimited(lock.retryAfterSeconds);

  const user = await db.user.findUnique({
    where: { phone: input.phone },
    include: {
      branches: { select: { branchId: true } },
      botRecipient: { select: { chatId: true } },
      organization: { select: { suspendedAt: true } },
    },
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

  // A suspended centre (A-144) keeps everyone but the site owner out, with a clear message.
  if (user.organization.suspendedAt && !user.isSiteOwner) {
    throw AppError.forbidden("errors.organizationSuspended");
  }

  // Default to the user's only branch; users with several pick one in the header.
  const activeBranchId = user.branches.length === 1 ? user.branches[0]!.branchId : null;

  // Without a known chat the switch has nothing to send to, so the password alone signs in.
  if (user.signInCode === "TELEGRAM" && user.botRecipient) {
    return startChallenge(db, user, user.botRecipient.chatId, activeBranchId, ctx);
  }
  return { kind: "session", issued: await issueSession(db, user, activeBranchId, ctx) };
}

async function issueSession(
  db: DbClient,
  user: SignedInUser,
  activeBranchId: string | null,
  ctx: LoginContext,
): Promise<IssuedSession> {
  // The alert looks at earlier sign-ins, so it runs before this one is logged.
  await noteSignIn(db, user, ctx);
  await db.loginLog.create({
    data: {
      userId: user.id,
      phone: user.phone,
      success: true,
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    },
  });
  return createSession(db, {
    userId: user.id,
    activeBranchId,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  });
}

async function startChallenge(
  db: DbClient,
  user: SignedInUser,
  chatId: string,
  activeBranchId: string | null,
  ctx: LoginContext,
): Promise<LoginOutcome> {
  const now = new Date();
  // One live challenge per person; expired ones of anyone are swept along the way.
  await db.loginChallenge.deleteMany({
    where: { OR: [{ userId: user.id }, { expiresAt: { lt: now } }] },
  });
  const id = generateToken(18);
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const expiresAt = new Date(now.getTime() + SIGN_IN_CODE_TTL_MS);
  await db.loginChallenge.create({
    data: {
      id,
      userId: user.id,
      codeHash: sha256(`${id}:${code}`),
      activeBranchId,
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent?.slice(0, 512) ?? null,
      expiresAt,
    },
  });
  try {
    const notifier = await getTelegramNotifier(db, user.organizationId);
    await notifier.sendMessage(chatId, botText("uz", "signInCode", { code }));
  } catch (error) {
    await db.loginChallenge.deleteMany({ where: { id } });
    console.error("sign-in code not sent", error);
    throw AppError.conflict("errors.signInCodeFailed");
  }
  return { kind: "challenge", challengeId: id, expiresAt: expiresAt.toISOString() };
}

/** The second step: the code from the Telegram message. */
export async function verifySignInCode(
  input: VerifyCodeInput,
  ctx: LoginContext,
  db: DbClient = prisma,
): Promise<IssuedSession> {
  const now = new Date();
  const challenge = await db.loginChallenge.findUnique({
    where: { id: input.challengeId },
    include: {
      user: {
        select: { id: true, phone: true, organizationId: true, fullName: true, isArchived: true },
      },
    },
  });
  if (
    !challenge ||
    challenge.expiresAt <= now ||
    challenge.attempts >= SIGN_IN_CODE_MAX_ATTEMPTS ||
    challenge.user.isArchived
  ) {
    if (challenge) await db.loginChallenge.deleteMany({ where: { id: challenge.id } });
    throw AppError.unauthenticated("errors.signInCodeExpired");
  }
  if (!safeEqual(challenge.codeHash, sha256(`${challenge.id}:${input.code}`))) {
    const attempts = challenge.attempts + 1;
    if (attempts >= SIGN_IN_CODE_MAX_ATTEMPTS) {
      await db.loginChallenge.deleteMany({ where: { id: challenge.id } });
      throw AppError.unauthenticated("errors.signInCodeExpired");
    }
    await db.loginChallenge.update({ where: { id: challenge.id }, data: { attempts } });
    throw AppError.unauthenticated("errors.signInCodeWrong");
  }
  await db.loginChallenge.deleteMany({ where: { id: challenge.id } });
  return issueSession(db, challenge.user, challenge.activeBranchId, ctx);
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
