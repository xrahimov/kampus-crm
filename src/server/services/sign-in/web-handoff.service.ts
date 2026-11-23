import { createSession, type IssuedSession, type SessionRecord } from "@/server/auth/session";
import { generateToken, sha256 } from "@/server/auth/tokens";
import { prisma, type DbClient } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";

/*
 * From the phone app to the site without signing in twice (A-204). The app has
 * a session token but no cookie, and some pages exist only on the site (the
 * lesson room, the office's tables). The app asks for a link; opened within a
 * minute, once, it gives the browser an ordinary 12-hour session for the same
 * person and sends it to the page. Only the link's hash is stored.
 */

/** How long a link may wait to be opened. */
export const WEB_HANDOFF_TTL_MS = 60 * 1000;
/** Unopened links one person may hold at a time; a loop in the app cannot fill the table. */
const MAX_PENDING = 5;

/** A page of this site: one leading slash, nothing that a browser reads as another address. */
export function isSitePath(path: string): boolean {
  return (
    path.length <= 500 &&
    path.startsWith("/") &&
    !path.startsWith("//") &&
    !path.includes("\\") &&
    !/[\u0000-\u001f\u007f]/.test(path) &&
    !path.startsWith("/api/")
  );
}

export async function createWebHandoff(
  session: SessionRecord,
  path: string,
  db: DbClient = prisma,
  now = new Date(),
): Promise<{ code: string; expiresAt: Date }> {
  // A browser already has its cookie; only the app, which has none, needs the link.
  if (!session.app) throw AppError.forbidden();
  if (!isSitePath(path)) throw AppError.validation({ to: ["validation.invalid"] });

  await db.webHandoff.deleteMany({
    where: { userId: session.userId, OR: [{ expiresAt: { lt: now } }, { usedAt: { not: null } }] },
  });
  const pending = await db.webHandoff.count({ where: { userId: session.userId } });
  if (pending >= MAX_PENDING) throw AppError.rateLimited(Math.ceil(WEB_HANDOFF_TTL_MS / 1000));

  const code = generateToken();
  const expiresAt = new Date(now.getTime() + WEB_HANDOFF_TTL_MS);
  await db.webHandoff.create({
    data: {
      userId: session.userId,
      tokenHash: sha256(code),
      path,
      activeBranchId: session.activeBranchId,
      expiresAt,
    },
  });
  return { code, expiresAt };
}

/** Opens the link: null when it is unknown, used or too old, or the person may no longer sign in. */
export async function redeemWebHandoff(
  code: string,
  ctx: { ip: string | null; userAgent: string | null },
  db: DbClient = prisma,
  now = new Date(),
): Promise<{ issued: IssuedSession; path: string } | null> {
  if (!/^[A-Za-z0-9_-]{20,200}$/.test(code)) return null;
  // Marking it used and reading it are one statement, so two openings cannot both win.
  const claimed = await db.webHandoff.updateMany({
    where: { tokenHash: sha256(code), usedAt: null, expiresAt: { gt: now } },
    data: { usedAt: now },
  });
  if (claimed.count !== 1) return null;
  const handoff = await db.webHandoff.findUnique({
    where: { tokenHash: sha256(code) },
    include: { user: { select: { isArchived: true } } },
  });
  if (!handoff || handoff.user.isArchived) return null;
  const issued = await createSession(db, {
    userId: handoff.userId,
    activeBranchId: handoff.activeBranchId,
    ip: ctx.ip,
    userAgent: ctx.userAgent,
  });
  return { issued, path: handoff.path };
}
