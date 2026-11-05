import { NextResponse, type NextRequest } from "next/server";

import { STUDENT_SESSION_COOKIE } from "@/lib/auth/constants";
import { assertSameOrigin } from "@/server/auth/csrf";
import { prisma } from "@/server/db/prisma";
import { errorResponse } from "@/server/http/handler";
import { requestLocale, requestOrigin } from "@/server/services/student-auth/http";
import {
  resolveStudentSession,
  revokeAllStudentSessions,
  revokeStudentSession,
} from "@/server/services/student-auth/student-auth.service";

/**
 * Signs the student out (A-150), from a plain form on the student home:
 * `everywhere=1` ends every device's session of this Telegram account.
 */
export async function POST(request: NextRequest): Promise<Response> {
  try {
    assertSameOrigin(request);
    const form = await request.formData().catch(() => null);
    const token = request.cookies.get(STUDENT_SESSION_COOKIE)?.value;
    if (form?.get("everywhere") === "1") {
      const principal = await resolveStudentSession(prisma, token);
      if (principal) await revokeAllStudentSessions(prisma, principal.account.id);
    }
    await revokeStudentSession(prisma, token);
    const origin = await requestOrigin(request);
    const locale = requestLocale(String(form?.get("locale") ?? ""));
    const response = NextResponse.redirect(`${origin}/${locale}/student/login`, 303);
    response.cookies.delete(STUDENT_SESSION_COOKIE);
    return response;
  } catch (error) {
    return errorResponse(error, request.nextUrl.pathname);
  }
}
