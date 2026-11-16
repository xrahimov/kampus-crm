import { randomInt } from "node:crypto";

import type { SignInDoor } from "@/generated/prisma/client";
import { LOGIN_WINDOW_MS } from "@/lib/auth/constants";
import type { CodeRequestInput, CodeVerifyInput } from "@/lib/validation/sign-in";
import {
  checkLoginLock,
  clearLoginFailures,
  loginKeys,
  recordLoginFailure,
} from "@/server/auth/rate-limit";
import type { IssuedSession } from "@/server/auth/session";
import { generateToken, safeEqual, sha256 } from "@/server/auth/tokens";
import { prisma, type DbClient } from "@/server/db/prisma";
import { AppError, isAppError } from "@/server/errors/app-error";
import { issueSession, type LoginContext } from "@/server/services/auth.service";
import { getTelegramNotifier } from "@/server/services/integrations/integrations.service";
import { linkChatForNotices } from "@/server/services/student-auth/bot-login.service";
import {
  accountForIdentity,
  createStudentSession,
} from "@/server/services/student-auth/student-auth.service";
import { botLocale, botText } from "@/server/services/telegram/student-telegram.service";

import { openJoinRequest, type JoinState } from "./join-requests.service";
import { settleJoinRequests } from "./join-settle";
import { botLoginUrl, fakeTelegram, resolveBotSetup, type BotSetup } from "./setup";

/*
 * Sign-in with a code from the Telegram bot (A-196). The person types their
 * phone on the sign-in page; the bot sends a six-digit code to the chat of the
 * Telegram account that shared exactly that number with it. Sharing happens
 * once, with the bot's "Share my number" button: Telegram then vouches that
 * the number is the sender's own, and the chat is remembered. Someone the bot
 * has not met gets the code the moment they share their number.
 *
 * The code proves the phone. Who the phone is decides the rest: a staff
 * member or a student or parent gets a session; anyone else goes on the
 * waiting list.
 */

/** Long enough to open Telegram, press Start and share a number the first time. */
export const PHONE_CODE_TTL_MS = 10 * 60 * 1000;
export const PHONE_CODE_MAX_ATTEMPTS = 5;
/** Codes one phone, or one address, may ask for inside the login window. */
export const PHONE_CODES_PER_PHONE = 5;
export const PHONE_CODES_PER_IP = 30;
const KEEP_MS = 24 * 60 * 60 * 1000;

export interface CodeTicket {
  id: string;
  expiresAt: string;
  /** Where the code arrives, for the page's instructions. */
  bot: { username: string | null; url: string | null };
}

function makeCode(phone: string): string {
  // The test stand-in has no Telegram to read the code from: it is the phone's last six digits.
  if (fakeTelegram()) return phone.slice(-6);
  return String(randomInt(0, 1_000_000)).padStart(6, "0");
}

async function requireSetup(db: DbClient, host: string | null): Promise<BotSetup> {
  const setup = await resolveBotSetup(db, host);
  if (!setup) throw AppError.notFound("errors.codeSignInOff");
  return setup;
}

/** Makes the code of a waiting request and hands it over for sending. */
async function armCode(db: DbClient, id: string, phone: string): Promise<string> {
  const code = makeCode(phone);
  await db.phoneSignInCode.update({
    where: { id },
    data: {
      codeHash: sha256(`${id}:${code}`),
      attempts: 0,
      expiresAt: new Date(Date.now() + PHONE_CODE_TTL_MS),
    },
  });
  return code;
}

/**
 * Step one: the phone was typed. Answers the same way whoever the phone is and
 * whether or not the bot knows it, so the page cannot be used to look people up.
 */
export async function requestSignInCode(
  input: CodeRequestInput & { host: string | null },
  ctx: LoginContext,
  db: DbClient = prisma,
): Promise<CodeTicket> {
  const setup = await requireSetup(db, input.host);
  const now = new Date();
  const lock = await checkLoginLock(db, [
    loginKeys.phone(input.phone),
    ...(ctx.ip ? [loginKeys.ip(ctx.ip)] : []),
  ]);
  if (lock.locked) throw AppError.rateLimited(lock.retryAfterSeconds);

  const since = new Date(now.getTime() - LOGIN_WINDOW_MS);
  const [byPhone, byIp] = await Promise.all([
    db.phoneSignInCode.count({ where: { phone: input.phone, createdAt: { gt: since } } }),
    ctx.ip ? db.phoneSignInCode.count({ where: { ip: ctx.ip, createdAt: { gt: since } } }) : 0,
  ]);
  if (byPhone >= PHONE_CODES_PER_PHONE || byIp >= PHONE_CODES_PER_IP) {
    throw AppError.rateLimited(Math.ceil(LOGIN_WINDOW_MS / 1000), "errors.codeTooMany");
  }
  await db.phoneSignInCode.deleteMany({
    where: { createdAt: { lt: new Date(now.getTime() - KEEP_MS) } },
  });

  const id = generateToken(18);
  const expiresAt = new Date(now.getTime() + PHONE_CODE_TTL_MS);
  await db.phoneSignInCode.create({
    data: {
      id,
      phone: input.phone,
      door: input.door,
      botOrganizationId: setup.botOrganizationId,
      ip: ctx.ip ?? null,
      userAgent: ctx.userAgent?.slice(0, 512) ?? null,
      expiresAt,
    },
  });

  const contact = await db.telegramContact.findFirst({
    where: { botOrganizationId: setup.botOrganizationId, phone: input.phone },
    orderBy: { verifiedAt: "desc" },
  });
  if (contact) {
    const code = await armCode(db, id, input.phone);
    try {
      const notifier = await getTelegramNotifier(db, setup.botOrganizationId);
      await notifier.sendMessage(
        contact.chatId,
        botText(botLocale(contact.locale), "phoneCode", { code }),
      );
    } catch (error) {
      // The person blocked the bot or Telegram is away: the page tells them to open the bot,
      // and sharing the number again sends a fresh code.
      console.error("sign-in code not sent", error);
      await db.phoneSignInCode.update({ where: { id }, data: { codeHash: null } });
    }
  }
  return {
    id,
    expiresAt: expiresAt.toISOString(),
    bot: { username: setup.botUsername, url: botLoginUrl(setup.botUsername) },
  };
}

export interface SharedContact {
  telegramUserId: string;
  chatId: string;
  /** As Telegram sent it; digits with or without a plus. */
  phone: string;
  name: string;
  username: string | null;
  locale: string;
}

/**
 * The bot received the sender's own number: the chat is remembered for that
 * phone. A phone belongs to one Telegram account at a time, so an older
 * account's claim on it is dropped.
 */
export async function rememberContact(
  db: DbClient,
  botOrganizationId: string,
  contact: SharedContact,
): Promise<void> {
  await db.$transaction(async (tx) => {
    await tx.telegramContact.deleteMany({
      where: {
        botOrganizationId,
        phone: contact.phone,
        telegramUserId: { not: contact.telegramUserId },
      },
    });
    const data = {
      chatId: contact.chatId,
      phone: contact.phone,
      name: contact.name,
      username: contact.username,
      locale: botLocale(contact.locale),
      verifiedAt: new Date(),
    };
    await tx.telegramContact.upsert({
      where: {
        botOrganizationId_telegramUserId: {
          botOrganizationId,
          telegramUserId: contact.telegramUserId,
        },
      },
      create: { botOrganizationId, telegramUserId: contact.telegramUserId, ...data },
      update: data,
    });
  });
}

/**
 * The code for the sign-in this phone is in the middle of, if there is one:
 * the newest request that is still open. Called when the person shares their
 * number, or opens the bot again, so the code follows at once.
 */
export async function pendingCodeFor(
  db: DbClient,
  botOrganizationId: string,
  phone: string,
): Promise<string | null> {
  const row = await db.phoneSignInCode.findFirst({
    where: { botOrganizationId, phone, usedAt: null, expiresAt: { gt: new Date() } },
    orderBy: { createdAt: "desc" },
    select: { id: true },
  });
  return row ? armCode(db, row.id, phone) : null;
}

export type CodeSignInOutcome =
  | { kind: "staff"; issued: IssuedSession; offerPassword: boolean }
  | { kind: "student"; token: string; offerPassword: boolean }
  | { kind: "waiting"; join: JoinState };

/** Step two: the code from the chat. Opens a session, or the waiting list. */
export async function verifySignInCode(
  input: CodeVerifyInput & { host: string | null },
  ctx: LoginContext,
  db: DbClient = prisma,
): Promise<CodeSignInOutcome> {
  const setup = await requireSetup(db, input.host);
  const now = new Date();
  const row = await db.phoneSignInCode.findUnique({ where: { id: input.id } });
  if (
    !row ||
    row.usedAt ||
    row.expiresAt <= now ||
    row.attempts >= PHONE_CODE_MAX_ATTEMPTS ||
    row.botOrganizationId !== setup.botOrganizationId
  ) {
    throw AppError.unauthenticated("errors.signInCodeExpired");
  }
  // Wrong codes count like wrong passwords: five in a quarter of an hour lock the phone,
  // so asking for code after code is no way to guess one.
  const keys = [loginKeys.phone(row.phone), ...(ctx.ip ? [loginKeys.ip(ctx.ip)] : [])];
  const lock = await checkLoginLock(db, keys);
  if (lock.locked) throw AppError.rateLimited(lock.retryAfterSeconds);
  if (!row.codeHash || !safeEqual(row.codeHash, sha256(`${row.id}:${input.code}`))) {
    const attempts = row.attempts + 1;
    await db.phoneSignInCode.update({ where: { id: row.id }, data: { attempts } });
    await recordLoginFailure(db, keys);
    throw AppError.unauthenticated(
      attempts >= PHONE_CODE_MAX_ATTEMPTS ? "errors.signInCodeExpired" : "errors.signInCodeWrong",
    );
  }
  // One code opens one session, even when two tabs send it at the same moment.
  const spent = await db.phoneSignInCode.updateMany({
    where: { id: row.id, usedAt: null },
    data: { usedAt: now },
  });
  if (spent.count !== 1) throw AppError.unauthenticated("errors.signInCodeExpired");
  await clearLoginFailures(db, [loginKeys.phone(row.phone)]);

  const contact = await db.telegramContact.findFirst({
    where: { botOrganizationId: setup.botOrganizationId, phone: row.phone },
    orderBy: { verifiedAt: "desc" },
  });
  if (!contact) throw AppError.unauthenticated("errors.signInCodeExpired");

  const scope = setup.scopeOrganizationId;
  const order: SignInDoor[] =
    input.door === "STUDENT" ? ["STUDENT", "STAFF"] : ["STAFF", "STUDENT"];
  let refused: AppError | null = null;
  for (const door of order) {
    try {
      const outcome =
        door === "STAFF"
          ? await staffByPhone(db, row.phone, scope, ctx)
          : await studentByContact(db, contact, scope, ctx);
      if (outcome) {
        // Whoever was waiting with this number is in now.
        await settleJoinRequests(db, row.phone, { quiet: true });
        return outcome;
      }
    } catch (error) {
      // A reason to say "no" at one door (a suspended centre, a profile linked to another
      // Telegram account) is kept in case the other door has nobody either.
      if (isAppError(error) && error.status === 403) refused ??= error;
      else throw error;
    }
  }
  if (refused) throw refused;

  await db.loginLog.create({
    data: {
      phone: row.phone,
      success: false,
      method: "TELEGRAM",
      ip: ctx.ip,
      userAgent: ctx.userAgent,
    },
  });
  const join = await openJoinRequest(db, {
    phone: row.phone,
    door: input.door,
    name: contact.name,
    telegramUserId: contact.telegramUserId,
    chatId: contact.chatId,
    botOrganizationId: setup.botOrganizationId,
    locale: contact.locale,
    scopeOrganizationId: scope,
  });
  return { kind: "waiting", join };
}

async function staffByPhone(
  db: DbClient,
  phone: string,
  scope: string | null,
  ctx: LoginContext,
): Promise<CodeSignInOutcome | null> {
  const user = await db.user.findUnique({
    where: { phone },
    include: {
      branches: { select: { branchId: true } },
      organization: { select: { suspendedAt: true } },
    },
  });
  // On a centre's own address only that centre's people come in.
  if (!user || user.isArchived || (scope && user.organizationId !== scope)) return null;
  if (user.organization.suspendedAt && !user.isSiteOwner) {
    throw AppError.forbidden("errors.organizationSuspended");
  }
  // Offered once: someone who has no password of their own is asked to choose one.
  const offerPassword = user.mustChangePassword && !user.passwordOfferedAt;
  if (!user.telegramVerifiedAt || offerPassword) {
    await db.user.update({
      where: { id: user.id },
      data: {
        ...(user.telegramVerifiedAt ? {} : { telegramVerifiedAt: new Date() }),
        ...(offerPassword ? { passwordOfferedAt: new Date() } : {}),
      },
    });
  }
  const activeBranchId = user.branches.length === 1 ? user.branches[0]!.branchId : null;
  const issued = await issueSession(db, user, activeBranchId, ctx, "TELEGRAM");
  return { kind: "staff", issued, offerPassword };
}

async function studentByContact(
  db: DbClient,
  contact: {
    telegramUserId: string;
    chatId: string;
    phone: string;
    name: string;
    username: string | null;
    locale: string;
  },
  scope: string | null,
  ctx: LoginContext,
): Promise<CodeSignInOutcome | null> {
  let account;
  try {
    account = await db.$transaction((tx) =>
      accountForIdentity(
        tx,
        {
          telegramUserId: contact.telegramUserId,
          name: contact.name,
          username: contact.username,
          photoUrl: null,
          phone: contact.phone.replace(/\D/g, ""),
        },
        scope,
      ),
    );
  } catch (error) {
    if (isAppError(error) && error.message === "errors.studentNotRegistered") return null;
    throw error;
  }
  await linkChatForNotices(db, account.id, contact.chatId, contact.name, contact.locale);
  const offerPassword = !account.passwordHash && !account.passwordOfferedAt;
  if (offerPassword) {
    await db.studentAccount.update({
      where: { id: account.id },
      data: { passwordOfferedAt: new Date() },
    });
  }
  const token = await createStudentSession(db, account.id, ctx);
  return { kind: "student", token, offerPassword };
}
