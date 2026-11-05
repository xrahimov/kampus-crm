import { NextResponse, type NextRequest } from "next/server";

import { STUDENT_LOGIN_STATE_COOKIE } from "@/lib/auth/constants";
import { prisma } from "@/server/db/prisma";
import {
  cookieSecure,
  loginErrorRedirect,
  requestHost,
  requestLocale,
  requestOrigin,
} from "@/server/services/student-auth/http";
import {
  LOGIN_STATE_TTL_MS,
  startTelegramLogin,
} from "@/server/services/student-auth/student-auth.service";

/** "Log in with Telegram" (A-150): off to Telegram's consent screen, with PKCE state in a cookie. */
export async function GET(request: NextRequest): Promise<Response> {
  const origin = await requestOrigin(request);
  const locale = requestLocale(request.nextUrl.searchParams.get("locale"));
  try {
    const { url, cookie } = await startTelegramLogin(prisma, {
      host: requestHost(request),
      origin,
      next: request.nextUrl.searchParams.get("next"),
      locale,
    });
    const response = NextResponse.redirect(url, 303);
    response.cookies.set(STUDENT_LOGIN_STATE_COOKIE, cookie, {
      httpOnly: true,
      secure: cookieSecure(),
      sameSite: "lax",
      path: "/api/v1/student-auth",
      maxAge: Math.floor(LOGIN_STATE_TTL_MS / 1000),
    });
    return response;
  } catch (error) {
    return loginErrorRedirect(origin, locale, error);
  }
}
