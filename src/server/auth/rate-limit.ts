import { LOGIN_MAX_FAILURES, LOGIN_WINDOW_MS } from "@/lib/auth/constants";
import type { DbClient } from "@/server/db/prisma";

export type LockState = { locked: false } | { locked: true; retryAfterSeconds: number };

/**
 * Pure decision: given the timestamps of recent failures, is the key locked?
 * The newest failure inside the window starts a new lock period.
 */
export function evaluateLock(
  failureTimes: readonly Date[],
  now: Date,
  max = LOGIN_MAX_FAILURES,
  windowMs = LOGIN_WINDOW_MS,
): LockState {
  const windowStart = now.getTime() - windowMs;
  const recent = failureTimes.filter((t) => t.getTime() > windowStart);
  if (recent.length < max) return { locked: false };
  const newest = Math.max(...recent.map((t) => t.getTime()));
  const retryAfterSeconds = Math.max(1, Math.ceil((newest + windowMs - now.getTime()) / 1000));
  return { locked: true, retryAfterSeconds };
}

/** Keys are namespaced so a phone and an IP can never collide. */
export const loginKeys = {
  phone: (phone: string) => `login:phone:${phone}`,
  ip: (ip: string) => `login:ip:${ip}`,
};

export async function checkLoginLock(
  db: DbClient,
  keys: string[],
  now = new Date(),
): Promise<LockState> {
  const since = new Date(now.getTime() - LOGIN_WINDOW_MS);
  const attempts = await db.loginAttempt.findMany({
    where: { key: { in: keys }, createdAt: { gt: since } },
    select: { key: true, createdAt: true },
  });
  let worst: LockState = { locked: false };
  for (const key of keys) {
    const state = evaluateLock(
      attempts.filter((a) => a.key === key).map((a) => a.createdAt),
      now,
    );
    if (state.locked && (!worst.locked || state.retryAfterSeconds > worst.retryAfterSeconds)) {
      worst = state;
    }
  }
  return worst;
}

export async function recordLoginFailure(db: DbClient, keys: string[]): Promise<void> {
  await db.loginAttempt.createMany({ data: keys.map((key) => ({ key })) });
}

export async function clearLoginFailures(db: DbClient, keys: string[]): Promise<void> {
  await db.loginAttempt.deleteMany({ where: { key: { in: keys } } });
}
