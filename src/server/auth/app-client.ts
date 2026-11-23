import { APP_CLIENT_HEADER } from "@/lib/auth/constants";

/*
 * The phone app (A-203) is not a browser: it keeps no cookies. It names itself
 * with the `x-kampus-app` header, gets its session token in the sign-in answer
 * and sends it back as `Authorization: Bearer <token>`. The token is the same
 * opaque session token a browser holds in its cookie, so everything behind the
 * sign-in (roles, branches, signing out a device) works alike for both.
 */

/** Whether the request comes from the phone app. */
export function isAppRequest(request: Request): boolean {
  return Boolean(request.headers.get(APP_CLIENT_HEADER));
}

/** The session token of an `Authorization: Bearer` header, or null. */
export function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization");
  if (!header) return null;
  const match = /^Bearer\s+([A-Za-z0-9_-]{20,200})$/.exec(header.trim());
  return match ? match[1]! : null;
}

/**
 * The session token of a request: the app's header first, else the browser's
 * cookie. `fromHeader` tells the caller that no cookie was involved, so the
 * cross-site checks that guard cookies (CSRF) do not apply: another site can
 * make a browser send its cookies, but it cannot make it send this header.
 */
export function requestSessionToken(
  request: Request & { cookies: { get(name: string): { value: string } | undefined } },
  cookieName: string,
): { token: string | null; fromHeader: boolean } {
  const bearer = bearerToken(request);
  if (bearer) return { token: bearer, fromHeader: true };
  return { token: request.cookies.get(cookieName)?.value ?? null, fromHeader: false };
}
