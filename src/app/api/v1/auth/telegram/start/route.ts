import { NextResponse, type NextRequest } from "next/server";

import { STUDENT_LOGIN_STATE_COOKIE } from "@/lib/auth/constants";
import { prisma } from "@/server/db/prisma";
import {
  cookieSecure,
  requestHost,
  requestLocale,
  requestOrigin,
  staffLoginErrorRedirect,
} from "@/server/services/student-auth/http";
import {
  LOGIN_STATE_TTL_MS,
  startTelegramLogin,
} from "@/server/services/student-auth/student-auth.service";

/**
 * Staff "Log in with Telegram" (A-180): off to Telegram's consent screen. The
 * way back is the address BotFather already knows (the student callback), so
 * the state cookie lives on that path and says the login is a staff one.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const origin = await requestOrigin(request);
  const locale = requestLocale(request.nextUrl.searchParams.get("locale"));
  try {
    const { url, cookie } = await startTelegramLogin(prisma, {
      host: requestHost(request),
      origin,
      next: request.nextUrl.searchParams.get("next"),
      locale,
      kind: "staff",
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
    return staffLoginErrorRedirect(origin, locale, error);
  }
}
