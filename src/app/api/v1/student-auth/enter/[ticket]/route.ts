import { NextResponse, type NextRequest } from "next/server";

import { prisma } from "@/server/db/prisma";
import { clientIp } from "@/server/http/handler";
import {
  loginErrorRedirect,
  requestLocale,
  requestOrigin,
  setStudentCookie,
} from "@/server/services/student-auth/http";
import {
  redeemLoginTicket,
  studentHomeUrl,
} from "@/server/services/student-auth/student-auth.service";

/** The bot's one-time sign-in link (A-150): spends the ticket and opens the student home. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ ticket: string }> },
): Promise<Response> {
  const { ticket } = await params;
  const origin = await requestOrigin(request);
  const locale = requestLocale(request.nextUrl.searchParams.get("locale"));
  try {
    const token = await redeemLoginTicket(prisma, ticket, {
      ip: clientIp(request),
      userAgent: request.headers.get("user-agent"),
    });
    const response = NextResponse.redirect(studentHomeUrl(origin, locale), 303);
    setStudentCookie(response, token);
    return response;
  } catch (error) {
    return loginErrorRedirect(origin, locale, error);
  }
}
