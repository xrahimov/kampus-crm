import { NextResponse, type NextRequest } from "next/server";

import { locales, routing } from "@/i18n/routing";
import { clearSessionCookies } from "@/server/auth/session";

/**
 * Where a page sends a browser whose session cookie no longer matches a session
 * (signed out from another device, A-124; archived; expired): the cookies go,
 * then the sign-in page. Pages cannot clear cookies themselves, and with the
 * cookie still set the proxy would keep sending the browser back to the app.
 */
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  const asked = params.get("locale") ?? "";
  const locale = (locales as readonly string[]).includes(asked) ? asked : routing.defaultLocale;
  const next = params.get("next");
  const url = new URL(`/${locale}/login`, request.url);
  if (next && next.startsWith("/") && !next.startsWith("//")) url.searchParams.set("next", next);
  await clearSessionCookies();
  return NextResponse.redirect(url);
}
