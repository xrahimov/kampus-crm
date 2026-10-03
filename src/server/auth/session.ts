import { cookies } from "next/headers";

import {
  CSRF_COOKIE,
  SESSION_COOKIE,
  SESSION_TOUCH_INTERVAL_MS,
  SESSION_TTL_MS,
} from "@/lib/auth/constants";
import { prisma, type DbClient } from "@/server/db/prisma";

import { generateCsrfToken } from "./csrf";
import { generateToken, sha256 } from "./tokens";

export interface SessionRecord {
  id: string;
  userId: string;
  activeBranchId: string | null;
  csrfSecret: string;
  expiresAt: Date;
  lastSeenAt: Date;
}

export interface IssuedSession {
  /** Raw token for the cookie. Never stored. */
  token: string;
  csrfToken: string;
  session: SessionRecord;
}

export async function createSession(
  db: DbClient,
  input: {
    userId: string;
    activeBranchId: string | null;
    ip?: string | null;
    userAgent?: string | null;
  },
  now = new Date(),
): Promise<IssuedSession> {
  const token = generateToken();
  const csrfToken = generateCsrfToken();
  const session = await db.session.create({
    data: {
      tokenHash: sha256(token),
      userId: input.userId,
      activeBranchId: input.activeBranchId,
      csrfSecret: csrfToken,
      ip: input.ip ?? null,
      userAgent: input.userAgent?.slice(0, 512) ?? null,
      expiresAt: new Date(now.getTime() + SESSION_TTL_MS),
      lastSeenAt: now,
    },
  });
  return { token, csrfToken, session };
}

/**
 * Looks up the session for a raw token. Expired sessions are deleted and read as
 * missing. Active sessions have their expiry pushed forward at most every
 * SESSION_TOUCH_INTERVAL_MS (sliding expiration without a write per request).
 */
export async function findSessionByToken(
  db: DbClient,
  token: string,
  now = new Date(),
): Promise<SessionRecord | null> {
  const session = await db.session.findUnique({ where: { tokenHash: sha256(token) } });
  if (!session) return null;
  if (session.expiresAt.getTime() <= now.getTime()) {
    await db.session.delete({ where: { id: session.id } }).catch(() => undefined);
    return null;
  }
  if (now.getTime() - session.lastSeenAt.getTime() > SESSION_TOUCH_INTERVAL_MS) {
    return db.session.update({
      where: { id: session.id },
      data: { lastSeenAt: now, expiresAt: new Date(now.getTime() + SESSION_TTL_MS) },
    });
  }
  return session;
}

export async function revokeSession(db: DbClient, sessionId: string): Promise<void> {
  await db.session.deleteMany({ where: { id: sessionId } });
}

export async function revokeAllUserSessions(db: DbClient, userId: string): Promise<void> {
  await db.session.deleteMany({ where: { userId } });
}

// ---------------------------------------------------------------------------
// Cookies
// ---------------------------------------------------------------------------

function cookieSecure(): boolean {
  if (process.env.COOKIE_SECURE === "false") return false;
  return process.env.NODE_ENV === "production";
}

export async function setSessionCookies(issued: IssuedSession): Promise<void> {
  const store = await cookies();
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  store.set(SESSION_COOKIE, issued.token, {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: "lax",
    path: "/",
    maxAge,
  });
  // Readable by the browser so the API client can echo it in the CSRF header.
  store.set(CSRF_COOKIE, issued.csrfToken, {
    httpOnly: false,
    secure: cookieSecure(),
    sameSite: "lax",
    path: "/",
    maxAge,
  });
}

export async function clearSessionCookies(): Promise<void> {
  const store = await cookies();
  store.delete(SESSION_COOKIE);
  store.delete(CSRF_COOKIE);
}

export async function readSessionToken(): Promise<string | null> {
  const store = await cookies();
  return store.get(SESSION_COOKIE)?.value ?? null;
}

/** Convenience for callers outside a transaction. */
export const sessions = {
  create: (input: Parameters<typeof createSession>[1]) => createSession(prisma, input),
  findByToken: (token: string) => findSessionByToken(prisma, token),
  revoke: (id: string) => revokeSession(prisma, id),
};
