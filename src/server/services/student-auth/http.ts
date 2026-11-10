import { NextResponse, type NextRequest } from "next/server";

import { STUDENT_SESSION_COOKIE } from "@/lib/auth/constants";
import { locales, routing } from "@/i18n/routing";
import { isAppError } from "@/server/errors/app-error";
import {
  normalizeHost,
  organizationForHost,
  serverOrigin,
} from "@/server/services/settings/domains.service";
import { STUDENT_SESSION_TTL_MS } from "@/server/services/student-auth/student-auth.service";

/* Request and cookie helpers for the student sign-in routes (A-150). */

export function requestHost(request: NextRequest): string | null {
  return normalizeHost(request.headers.get("x-forwarded-host") ?? request.headers.get("host"));
}

/** The public address this request came in on: a centre's own domain, else the server's. */
export async function requestOrigin(request: NextRequest): Promise<string> {
  const host = requestHost(request);
  return (await organizationForHost(host)) ? `https://${host}` : serverOrigin();
}

export function requestLocale(value: string | null | undefined): string {
  return value && (locales as readonly string[]).includes(value) ? value : routing.defaultLocale;
}

export function cookieSecure(): boolean {
  if (process.env.COOKIE_SECURE === "false") return false;
  return process.env.NODE_ENV === "production";
}

export function setStudentCookie(response: NextResponse, token: string): void {
  response.cookies.set(STUDENT_SESSION_COOKIE, token, {
    httpOnly: true,
    secure: cookieSecure(),
    sameSite: "lax",
    path: "/",
    maxAge: Math.floor(STUDENT_SESSION_TTL_MS / 1000),
  });
}

/** Back to the staff sign-in page with the reason as a message key (A-180). */
export function staffLoginErrorRedirect(
  origin: string,
  locale: string,
  error: unknown,
): NextResponse {
  let key = "errors.staffTelegramFailed";
  if (isAppError(error)) {
    // The shared checks speak of the student page; on the staff page they mean the same thing.
    key =
      error.message === "errors.studentLoginExpired"
        ? "errors.staffTelegramExpired"
        : error.message === "errors.studentLoginFailed"
          ? "errors.staffTelegramFailed"
          : error.message === "errors.studentLoginOff"
            ? "errors.staffTelegramOff"
            : error.message;
  } else console.error(error);
  const url = new URL(`${origin}/${locale}/login`);
  url.searchParams.set("error", key.replace(/^errors\./, ""));
  return NextResponse.redirect(url, 303);
}

/** Back to the sign-in page with the reason as a message key. */
export function loginErrorRedirect(origin: string, locale: string, error: unknown): NextResponse {
  let key = "errors.studentLoginFailed";
  if (isAppError(error)) key = error.message;
  else console.error(error);
  const url = new URL(`${origin}/${locale}/student/login`);
  url.searchParams.set("error", key.replace(/^errors\./, ""));
  return NextResponse.redirect(url, 303);
}
