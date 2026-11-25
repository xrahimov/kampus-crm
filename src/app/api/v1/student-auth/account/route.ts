import { NextResponse } from "next/server";

import { STUDENT_SESSION_COOKIE } from "@/lib/auth/constants";
import { assertSameOrigin } from "@/server/auth/csrf";
import { prisma } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";
import { route } from "@/server/http/handler";
import { deleteStudentAccount } from "@/server/services/account-deletion.service";
import { studentSessionToken } from "@/server/services/student-auth/http";
import { resolveStudentSession } from "@/server/services/student-auth/student-auth.service";

/**
 * A student or parent deletes their own account (A-267), from the student home
 * on the site or from the phone app. The centre's records of the student stay.
 */
export const DELETE = route({ auth: false, skipCsrf: true }, async ({ request }) => {
  const { token, fromHeader } = studentSessionToken(request);
  // The same-site check guards the cookie; the phone app sends a header instead (A-203).
  if (!fromHeader) assertSameOrigin(request);
  const principal = await resolveStudentSession(prisma, token);
  if (!principal) throw AppError.unauthenticated();
  await deleteStudentAccount(principal);
  const response = NextResponse.json({ ok: true });
  if (!fromHeader) response.cookies.delete(STUDENT_SESSION_COOKIE);
  return response;
});
