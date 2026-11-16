import type { PasswordSignInInput, StudentPasswordInput } from "@/lib/validation/sign-in";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import {
  checkLoginLock,
  clearLoginFailures,
  loginKeys,
  recordLoginFailure,
} from "@/server/auth/rate-limit";
import { prisma, type DbClient } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";
import type { Actor } from "@/server/rbac/authorize";
import { recordAudit } from "@/server/audit/audit";
import {
  finishStaffPassword,
  staffByPassword,
  type LoginContext,
  type LoginOutcome,
} from "@/server/services/auth.service";
import {
  createStudentSession,
  type StudentPrincipal,
} from "@/server/services/student-auth/student-auth.service";

/*
 * Phone and password, for everyone (A-196). A password exists only after the
 * person signed in with Telegram and chose one, so it never opens an account
 * whose phone was not proven. Staff and students keep separate accounts and
 * sessions; one form serves both, and the page the person is on decides which
 * is tried first when a phone and password fit both.
 */

export type PasswordSignInOutcome =
  { kind: "staff"; outcome: LoginOutcome } | { kind: "student"; token: string };

/** The student or parent account this phone and password open, limited to a centre's own address. */
async function studentByPassword(
  db: DbClient,
  input: { phone: string; password: string },
  scopeOrganizationId: string | null,
): Promise<string | null> {
  const accounts = await db.studentAccount.findMany({
    where: {
      phone: input.phone,
      passwordHash: { not: null },
      links: {
        some: scopeOrganizationId ? { organizationId: scopeOrganizationId } : {},
      },
    },
    select: { id: true, passwordHash: true },
  });
  for (const account of accounts) {
    if (await verifyPassword(account.passwordHash!, input.password)) return account.id;
  }
  return null;
}

export async function passwordSignIn(
  input: PasswordSignInInput & { scopeOrganizationId: string | null },
  ctx: LoginContext,
  db: DbClient = prisma,
): Promise<PasswordSignInOutcome> {
  const keys = [loginKeys.phone(input.phone), ...(ctx.ip ? [loginKeys.ip(ctx.ip)] : [])];
  const lock = await checkLoginLock(db, keys);
  if (lock.locked) throw AppError.rateLimited(lock.retryAfterSeconds);

  const staff = await staffByPassword(db, input);
  const user = staff.user;
  // A student account opens only the records of the centre whose address this is.
  const accountId =
    user && input.door === "STAFF"
      ? null
      : await studentByPassword(db, input, input.scopeOrganizationId);

  if (!user && !accountId) {
    await recordLoginFailure(db, keys);
    await db.loginLog.create({
      data: {
        userId: staff.seenUserId,
        phone: input.phone,
        success: false,
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      },
    });
    throw AppError.unauthenticated("errors.invalidCredentials");
  }
  await clearLoginFailures(db, keys);

  if (accountId && (input.door === "STUDENT" || !user)) {
    return {
      kind: "student",
      token: await createStudentSession(db, accountId, ctx, new Date(), "PASSWORD"),
    };
  }
  return { kind: "staff", outcome: await finishStaffPassword(db, user!, ctx) };
}

/**
 * A staff member chooses a password in a session Telegram opened (A-196):
 * Telegram has just proven who they are, so the old password, which they may
 * never have known, is not asked for. This is also the way back after a
 * forgotten password. Their other sessions end.
 */
export async function setOwnPassword(
  actor: Actor,
  sessionId: string,
  newPassword: string,
  db: DbClient = prisma,
): Promise<void> {
  if (actor.signedInWith !== "TELEGRAM") throw AppError.forbidden("errors.passwordNeedsTelegram");
  const passwordHash = await hashPassword(newPassword);
  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: actor.userId },
      data: { passwordHash, mustChangePassword: false, passwordChangedAt: new Date() },
    });
    await tx.session.deleteMany({ where: { userId: actor.userId, id: { not: sessionId } } });
    await recordAudit(tx, actor, {
      action: "auth.passwordSet",
      entity: "User",
      entityId: actor.userId,
    });
  });
}

/**
 * A student or parent chooses or changes their password. In a session a
 * Telegram code opened nothing else is asked; in a password session the
 * current password is. Their other devices are signed out.
 */
export async function setStudentPassword(
  principal: StudentPrincipal,
  input: StudentPasswordInput,
  db: DbClient = prisma,
): Promise<void> {
  const account = await db.studentAccount.findUniqueOrThrow({
    where: { id: principal.account.id },
    select: { passwordHash: true },
  });
  if (principal.signedInWith !== "TELEGRAM") {
    const ok =
      account.passwordHash &&
      input.currentPassword &&
      (await verifyPassword(account.passwordHash, input.currentPassword));
    if (!ok) throw AppError.validation({ currentPassword: ["validation.wrongPassword"] });
  }
  const passwordHash = await hashPassword(input.newPassword);
  await db.$transaction(async (tx) => {
    await tx.studentAccount.update({
      where: { id: principal.account.id },
      data: { passwordHash, passwordSetAt: new Date() },
    });
    await tx.studentSession.deleteMany({
      where: { accountId: principal.account.id, id: { not: principal.sessionId } },
    });
  });
}
