import type { IssuedSession } from "@/server/auth/session";
import type { DbClient } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";
import { issueSession, type LoginContext } from "@/server/services/auth.service";
import { organizationForHost } from "@/server/services/settings/domains.service";
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
 * the whole match. A centre may go further and refuse passwords altogether
 * (Settings → General → Staff sign in with Telegram only).
 */

export interface StaffSignInOptions {
  /** The sign-in page offers "Log in with Telegram". */
  telegram: boolean;
  /** The sign-in page offers phone and password. */
  password: boolean;
}

/**
 * What the staff sign-in page offers on this address. The password form goes
 * away only when every centre the page serves signs in with Telegram only and
 * a Telegram login is there to use.
 */
export async function staffSignInOptions(
  db: DbClient,
  host: string | null,
): Promise<StaffSignInOptions> {
  const telegram = Boolean(await resolveLoginSetup(db, host));
  if (!telegram || process.env.STAFF_PASSWORD_LOGIN === "on") return { telegram, password: true };
  const brand = await organizationForHost(host, db);
  const organizations = await db.organization.findMany({
    where: brand ? { id: brand.organizationId } : { suspendedAt: null },
    select: { id: true },
  });
  if (organizations.length === 0) return { telegram, password: true };
  const telegramOnly = await db.orgSettings.count({
    where: { staffTelegramOnly: true, organizationId: { in: organizations.map((o) => o.id) } },
  });
  return { telegram, password: telegramOnly < organizations.length };
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
  // Telegram is the proof here, so the Telegram code of A-124 is not asked for again.
  const issued = await issueSession(db, user, activeBranchId, ctx, "TELEGRAM");
  return { issued, next: back.next, locale: back.locale };
}
