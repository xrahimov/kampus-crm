import { CSRF_HEADER } from "@/lib/auth/constants";
import { AppError } from "@/server/errors/app-error";

import { generateToken, safeEqual } from "./tokens";

export function generateCsrfToken(): string {
  return generateToken(32);
}

/**
 * Two independent checks for every state-changing request:
 * 1. Origin (or Referer) must match the request host when present.
 * 2. Double submit: the `x-csrf-token` header must equal the token the session
 *    was issued (stored server-side on the session and mirrored in a readable cookie).
 */
export function assertCsrf(request: Request, expectedToken: string | null): void {
  assertSameOrigin(request);
  const header = request.headers.get(CSRF_HEADER);
  if (!expectedToken || !header || !safeEqual(header, expectedToken)) {
    throw AppError.forbidden("errors.csrf");
  }
}

export function assertSameOrigin(request: Request): void {
  const host = request.headers.get("x-forwarded-host") ?? request.headers.get("host");
  const source = request.headers.get("origin") ?? request.headers.get("referer");
  if (!host || !source) {
    // Browsers always send Origin on cross-origin and same-origin POST/PUT/DELETE
    // with fetch; a missing header means a non-browser client, which the token
    // check still covers.
    return;
  }
  let sourceHost: string;
  try {
    sourceHost = new URL(source).host;
  } catch {
    throw AppError.forbidden("errors.csrf");
  }
  if (sourceHost !== host) {
    throw AppError.forbidden("errors.csrf");
  }
}

export const MUTATING_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);
