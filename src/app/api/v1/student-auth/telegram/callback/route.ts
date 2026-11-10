import { NextResponse, type NextRequest } from "next/server";

import { STUDENT_LOGIN_STATE_COOKIE } from "@/lib/auth/constants";
import { applySessionCookies } from "@/server/auth/session";
import { prisma } from "@/server/db/prisma";
import { clientIp } from "@/server/http/handler";
import { finishStaffTelegramLogin } from "@/server/services/staff-telegram-login.service";
import {
  loginErrorRedirect,
  requestHost,
  requestLocale,
  requestOrigin,
  setStudentCookie,
  staffLoginErrorRedirect,
} from "@/server/services/student-auth/http";
import {
  finishTelegramLogin,
  stateIsStaff,
  stateLocale,
  studentHomeUrl,
} from "@/server/services/student-auth/student-auth.service";

const STATE_COOKIE = { name: STUDENT_LOGIN_STATE_COOKIE, path: "/api/v1/student-auth" };

/**
 * Telegram sends the browser back here with a code (A-150); registered in
 * BotFather. Staff sign-ins (A-180) come back to the same address and are told
 * apart by the state the browser left with.
 */
export async function GET(request: NextRequest): Promise<Response> {
  const origin = await requestOrigin(request);
  const cookie = request.cookies.get(STUDENT_LOGIN_STATE_COOKIE)?.value;
  const locale = requestLocale(stateLocale(cookie));
  const params = request.nextUrl.searchParams;
  const input = {
    host: requestHost(request),
    origin,
    code: params.get("code"),
    state: params.get("state"),
    cookie,
  };
  const ctx = { ip: clientIp(request), userAgent: request.headers.get("user-agent") };

  if (stateIsStaff(cookie)) {
    try {
      if (params.get("error")) throw new Error(`telegram login: ${params.get("error")}`);
      const done = await finishStaffTelegramLogin(prisma, input, ctx);
      const response = NextResponse.redirect(
        `${origin}/${locale}${done.next || "/dashboard"}`,
        303,
      );
      applySessionCookies(response, done.issued);
      response.cookies.delete(STATE_COOKIE);
      return response;
    } catch (error) {
      const response = staffLoginErrorRedirect(origin, locale, error);
      response.cookies.delete(STATE_COOKIE);
      return response;
    }
  }

  try {
    if (params.get("error")) throw new Error(`telegram login: ${params.get("error")}`);
    const done = await finishTelegramLogin(prisma, input, ctx);
    const response = NextResponse.redirect(studentHomeUrl(origin, locale, done.next), 303);
    setStudentCookie(response, done.token);
    response.cookies.delete(STATE_COOKIE);
    return response;
  } catch (error) {
    const response = loginErrorRedirect(origin, locale, error);
    response.cookies.delete(STATE_COOKIE);
    return response;
  }
}
