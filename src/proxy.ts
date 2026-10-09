import createIntlMiddleware from "next-intl/middleware";
import { NextResponse, type NextRequest } from "next/server";

import { SESSION_COOKIE } from "@/lib/auth/constants";
import { locales, routing } from "@/i18n/routing";

const intl = createIntlMiddleware(routing);

/** The server's own host (APP_URL), where the root always leads to the login. */
const ownHost = (() => {
  try {
    return new URL(process.env.APP_URL ?? "http://localhost:3000").host.toLowerCase();
  } catch {
    return "localhost:3000";
  }
})();

/** Whether the request came in on the server's own address rather than a centre's (A-114). */
function onOwnHost(request: NextRequest): boolean {
  const host = (request.headers.get("x-forwarded-host") ?? request.headers.get("host") ?? "")
    .trim()
    .toLowerCase();
  return host === "" || host === ownHost || /^(localhost|\d+(\.\d+){3})(:\d+)?$/.test(host);
}

const PUBLIC_PATHS = new Set(["/login"]);
/** Path prefixes anyone may open (public lead forms, students' pages, centres' public pages). */
const PUBLIC_PREFIXES = ["/forms/", "/class/", "/family/", "/c/"];

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

  // On a centre's own address the root is open to visitors: it is the centre's public
  // page (A-121), or the page sends them to sign in when there is none.
  if (isOpen || (rest === "/" && !hasSession && !onOwnHost(request))) return intl(request);

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
