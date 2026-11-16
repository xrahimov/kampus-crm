import type { IssuedSession } from "@/server/auth/session";
import type { DbClient } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";
import { issueSession, type LoginContext } from "@/server/services/auth.service";
import { botLoginUrl, resolveBotSetup } from "@/server/services/sign-in/setup";
import {
  phoneFromTelegram,
  resolveLoginSetup,
  verifyTelegramReturn,
  type TelegramReturn,
} from "@/server/services/student-auth/student-auth.service";

/*
 * Staff sign-in with Telegram (A-180). The same bot, keys and callback address
 * as the student sign-in (A-150); the difference is who is looked for: the
 * staff member whose phone equals the Telegram-verified one. Nobody is created
 * and nothing is linked: a staff phone is unique on the server, so the phone is
 * the whole match. Since A-196 the sign-in pages lead with a code from the bot;
 * this way through Telegram's own page stays as the second way in where its
 * login keys are set.
 */

export interface SignInOptions {
  /** A bot can send codes here: the page offers "Get a code in Telegram" (A-196). */
  code: boolean;
  /** The bot the code arrives from, for the page's instructions. */
  bot: { username: string | null; url: string | null };
  /** The older sign-in through Telegram's own page (A-150, A-180) is set up here too. */
  widget: boolean;
  brand: { name: string; logoUrl: string | null } | null;
}

/**
 * What a sign-in page offers on this address. Phone and password are always
 * there; the Telegram code appears where a bot can send one.
 */
export async function signInOptions(db: DbClient, host: string | null): Promise<SignInOptions> {
  const [bot, widget] = await Promise.all([resolveBotSetup(db, host), resolveLoginSetup(db, host)]);
  return {
    code: Boolean(bot),
    bot: { username: bot?.botUsername ?? null, url: botLoginUrl(bot?.botUsername ?? null) },
    widget: Boolean(widget),
    brand: bot?.brand ?? widget?.brand ?? null,
  };
}

/** Telegram came back with a code asked for on the staff page: open a staff session. */
export async function finishStaffTelegramLogin(
  db: DbClient,
  input: TelegramReturn,
  ctx: LoginContext,
): Promise<{ issued: IssuedSession; next: string; locale: string | null }> {
  const back = await verifyTelegramReturn(db, input);
  if (!back.staff) throw AppError.unauthenticated("errors.studentLoginExpired");
  const phone = phoneFromTelegram(back.identity.phone);
  if (!phone) throw AppError.forbidden("errors.staffTelegramNoPhone");

  const user = await db.user.findUnique({
    where: { phone },
    include: {
      branches: { select: { branchId: true } },
      organization: { select: { suspendedAt: true } },
    },
  });
  // On a centre's own address only that centre's people come in.
  const scope = back.setup.scopeOrganizationId;
  const ok = user && !user.isArchived && (!scope || user.organizationId === scope);
  if (!ok) {
    await db.loginLog.create({
      data: {
        userId: user?.id ?? null,
        phone,
        success: false,
        method: "TELEGRAM",
        ip: ctx.ip,
        userAgent: ctx.userAgent,
      },
    });
    throw AppError.forbidden("errors.staffTelegramUnknown");
  }
  if (user.organization.suspendedAt && !user.isSiteOwner) {
    throw AppError.forbidden("errors.organizationSuspended");
  }
  const activeBranchId = user.branches.length === 1 ? user.branches[0]!.branchId : null;
  // Telegram proved the phone: from now on the person's password works too (A-196).
  if (!user.telegramVerifiedAt) {
    await db.user.update({ where: { id: user.id }, data: { telegramVerifiedAt: new Date() } });
  }
  // Telegram is the proof here, so the Telegram code of A-124 is not asked for again.
  const issued = await issueSession(db, user, activeBranchId, ctx, "TELEGRAM");
  return { issued, next: back.next, locale: back.locale };
}
