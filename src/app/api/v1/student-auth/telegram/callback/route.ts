import { NextResponse, type NextRequest } from "next/server";

import { STUDENT_LOGIN_STATE_COOKIE } from "@/lib/auth/constants";
import { prisma } from "@/server/db/prisma";
import { clientIp } from "@/server/http/handler";
import {
  loginErrorRedirect,
  requestHost,
  requestLocale,
  requestOrigin,
  setStudentCookie,
} from "@/server/services/student-auth/http";
import {
  finishTelegramLogin,
  stateLocale,
  studentHomeUrl,
} from "@/server/services/student-auth/student-auth.service";

/** Telegram sends the browser back here with a code (A-150); registered in BotFather. */
export async function GET(request: NextRequest): Promise<Response> {
  const origin = await requestOrigin(request);
  const cookie = request.cookies.get(STUDENT_LOGIN_STATE_COOKIE)?.value;
  const locale = requestLocale(stateLocale(cookie));
  const params = request.nextUrl.searchParams;
  try {
    if (params.get("error")) throw new Error(`telegram login: ${params.get("error")}`);
    const done = await finishTelegramLogin(
      prisma,
      {
        host: requestHost(request),
        origin,
        code: params.get("code"),
        state: params.get("state"),
        cookie,
      },
      { ip: clientIp(request), userAgent: request.headers.get("user-agent") },
    );
    const response = NextResponse.redirect(studentHomeUrl(origin, locale, done.next), 303);
    setStudentCookie(response, done.token);
    response.cookies.delete({ name: STUDENT_LOGIN_STATE_COOKIE, path: "/api/v1/student-auth" });
    return response;
  } catch (error) {
    const response = loginErrorRedirect(origin, locale, error);
    response.cookies.delete({ name: STUDENT_LOGIN_STATE_COOKIE, path: "/api/v1/student-auth" });
    return response;
  }
}
