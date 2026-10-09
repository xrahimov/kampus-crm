import type { ChangePasswordInput, SignInCode } from "@/lib/validation/auth";
import { recordAudit } from "@/server/audit/audit";
import { describeDevice } from "@/server/auth/device";
import { hashPassword, verifyPassword } from "@/server/auth/password";
import { prisma, type DbClient } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";
import { enqueue } from "@/server/jobs/queue";
import type { Actor } from "@/server/rbac/authorize";
import { botText, wallClock } from "@/server/services/telegram/student-telegram.service";

/*
 * "My account" (A-124): the signed-in person's own password, second sign-in
 * step and devices. Nothing here needs a permission beyond being signed in.
 */

/** A sign-in from a browser and address not seen for this long gets a Telegram alert. */
export const SIGN_IN_MEMORY_MS = 30 * 24 * 60 * 60 * 1000;

export interface AccountDto {
  fullName: string;
  phone: string;
  signInCode: SignInCode;
  /** A Telegram chat is linked under Settings → Bot notifications; the code and the alerts go there. */
  telegramLinked: boolean;
  mustChangePassword: boolean;
  passwordChangedAt: string | null;
}

export interface SessionDto {
  id: string;
  device: string;
  ip: string | null;
  createdAt: string;
  lastSeenAt: string;
  /** The session this request came in on. */
  current: boolean;
}

export async function getAccount(actor: Actor, db: DbClient = prisma): Promise<AccountDto> {
  const user = await db.user.findUniqueOrThrow({
    where: { id: actor.userId },
    select: {
      fullName: true,
      phone: true,
      signInCode: true,
      mustChangePassword: true,
      passwordChangedAt: true,
      botRecipient: { select: { id: true } },
    },
  });
  return {
    fullName: user.fullName,
    phone: user.phone,
    signInCode: user.signInCode,
    telegramLinked: user.botRecipient !== null,
    mustChangePassword: user.mustChangePassword,
    passwordChangedAt: user.passwordChangedAt?.toISOString() ?? null,
  };
}

/** The Telegram code can only be switched on for a person whose chat the bot knows. */
export async function requireTelegramChat(db: DbClient, userId: string): Promise<void> {
  const recipient = await db.botRecipient.findUnique({ where: { userId }, select: { id: true } });
  if (!recipient) throw AppError.validation({ signInCode: ["validation.signInCodeNeedsTelegram"] });
}

/**
 * The person picks a new password. Every other session of theirs ends, so whoever
 * else knew the old password is out; the session this was done from stays.
 */
export async function changePassword(
  actor: Actor,
  sessionId: string,
  input: ChangePasswordInput,
  db: DbClient = prisma,
): Promise<void> {
  const user = await db.user.findUniqueOrThrow({
    where: { id: actor.userId },
    select: { passwordHash: true },
  });
  if (!(await verifyPassword(user.passwordHash, input.currentPassword))) {
    throw AppError.validation({ currentPassword: ["validation.wrongPassword"] });
  }
  if (input.currentPassword === input.newPassword) {
    throw AppError.validation({ newPassword: ["validation.passwordSame"] });
  }
  const passwordHash = await hashPassword(input.newPassword);
  await db.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: actor.userId },
      data: { passwordHash, mustChangePassword: false, passwordChangedAt: new Date() },
    });
    await tx.session.deleteMany({ where: { userId: actor.userId, id: { not: sessionId } } });
    await recordAudit(tx, actor, {
      action: "auth.passwordChange",
      entity: "User",
      entityId: actor.userId,
    });
  });
}

export async function listOwnSessions(
  actor: Actor,
  sessionId: string,
  db: DbClient = prisma,
): Promise<SessionDto[]> {
  const rows = await db.session.findMany({
    where: { userId: actor.userId, expiresAt: { gt: new Date() } },
    orderBy: { lastSeenAt: "desc" },
    select: { id: true, ip: true, userAgent: true, createdAt: true, lastSeenAt: true },
  });
  return rows.map((r) => ({
    id: r.id,
    device: describeDevice(r.userAgent),
    ip: r.ip,
    createdAt: r.createdAt.toISOString(),
    lastSeenAt: r.lastSeenAt.toISOString(),
    current: r.id === sessionId,
  }));
}

/** Ends one of the person's other sessions; the current one ends through "Sign out". */
export async function revokeOwnSession(
  actor: Actor,
  sessionId: string,
  id: string,
  db: DbClient = prisma,
): Promise<void> {
  if (id === sessionId) throw AppError.validation({ id: ["validation.currentSession"] });
  await db.session.deleteMany({ where: { id, userId: actor.userId } });
}

/** "Sign out everywhere else": every session but the current one ends. */
export async function revokeOtherSessions(
  actor: Actor,
  sessionId: string,
  db: DbClient = prisma,
): Promise<number> {
  return db.$transaction(async (tx) => {
    const { count } = await tx.session.deleteMany({
      where: { userId: actor.userId, id: { not: sessionId } },
    });
    await recordAudit(tx, actor, {
      action: "auth.signOutAll",
      entity: "User",
      entityId: actor.userId,
      after: { sessions: count },
    });
    return count;
  });
}

export async function setOwnSignInCode(
  actor: Actor,
  signInCode: SignInCode,
  db: DbClient = prisma,
): Promise<AccountDto> {
  if (signInCode === "TELEGRAM") await requireTelegramChat(db, actor.userId);
  await db.$transaction(async (tx) => {
    const before = await tx.user.findUniqueOrThrow({
      where: { id: actor.userId },
      select: { signInCode: true },
    });
    if (before.signInCode === signInCode) return;
    await tx.user.update({ where: { id: actor.userId }, data: { signInCode } });
    await recordAudit(tx, actor, {
      action: "auth.signInCode",
      entity: "User",
      entityId: actor.userId,
      before: { signInCode: before.signInCode },
      after: { signInCode },
    });
  });
  return getAccount(actor, db);
}

/**
 * Called before a successful sign-in is logged: a browser and address this
 * person has not signed in from in the last 30 days gets them a Telegram
 * message, if the bot knows their chat. The staff feed is in Uzbek (A-85).
 */
export async function noteSignIn(
  db: DbClient,
  user: { id: string; organizationId: string; fullName: string },
  ctx: { ip?: string | null; userAgent?: string | null },
): Promise<boolean> {
  const recipient = await db.botRecipient.findUnique({
    where: { userId: user.id },
    select: { chatId: true },
  });
  if (!recipient) return false;
  const seen = await db.loginLog.findFirst({
    where: {
      userId: user.id,
      success: true,
      createdAt: { gte: new Date(Date.now() - SIGN_IN_MEMORY_MS) },
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent ?? null,
    },
    select: { id: true },
  });
  if (seen) return false;
  const clock = wallClock(new Date());
  const hh = String(Math.floor(clock.minutes / 60)).padStart(2, "0");
  const mm = String(clock.minutes % 60).padStart(2, "0");
  await enqueue(db, {
    type: "telegram.send",
    payload: {
      organizationId: user.organizationId,
      chatId: recipient.chatId,
      text: botText("uz", "signInAlert", {
        name: user.fullName,
        when: `${clock.date} ${hh}:${mm}`,
        device: describeDevice(ctx.userAgent),
        ip: ctx.ip ?? "—",
      }),
    },
  });
  return true;
}
