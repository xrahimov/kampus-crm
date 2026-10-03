import createIntlMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE } from "@/lib/auth/constants";
import { locales, routing } from "@/i18n/routing";

const intl = createIntlMiddleware(routing);

const PUBLIC_PATHS = new Set(["/login"]);
/** Path prefixes anyone may open (public lead forms, Phase 7). */
const PUBLIC_PREFIXES = ["/forms/"];

function stripLocale(pathname: string): { locale: string | null; rest: string } {
  const match = pathname.match(/^\/([a-z]{2})(\/.*)?$/);
  if (match && (locales as readonly string[]).includes(match[1]!)) {
    return { locale: match[1]!, rest: match[2] ?? "/" };
  }
  return { locale: null, rest: pathname };
}

/**
 * Runs before every page request (not /api): adds the locale prefix and sends
 * visitors without a session cookie to the login page. Only the presence of the
 * cookie is checked here; the real session lookup happens in the app layout.
 */
export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const { locale, rest } = stripLocale(pathname);
  const hasSession = request.cookies.has(SESSION_COOKIE);
  const isPublic = PUBLIC_PATHS.has(rest);
  const isOpen = PUBLIC_PREFIXES.some((prefix) => rest.startsWith(prefix));

  if (isOpen) return intl(request);

  if (!hasSession && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = `/${locale ?? routing.defaultLocale}/login`;
    url.searchParams.set("next", rest);
    return NextResponse.redirect(url);
  }

  if (hasSession && isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = `/${locale ?? routing.defaultLocale}/dashboard`;
    url.search = "";
    return NextResponse.redirect(url);
  }

  return intl(request);
}

export const config = {
  // Everything except API routes, Next internals and static files.
  matcher: ["/((?!api|_next|_vercel|.*\\..*).*)"],
};
