import { studentPasswordSchema } from "@/lib/validation/sign-in";
import { assertSameOrigin } from "@/server/auth/csrf";
import { prisma } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";
import { json, route } from "@/server/http/handler";
import { setStudentPassword } from "@/server/services/sign-in/password.service";
import { studentSessionToken } from "@/server/services/student-auth/http";
import { resolveStudentSession } from "@/server/services/student-auth/student-auth.service";

/** A student or parent chooses or changes their password (A-196). */
export const POST = route(
  { auth: false, body: studentPasswordSchema, skipCsrf: true },
  async ({ body, request }) => {
    const { token, fromHeader } = studentSessionToken(request);
    // The same-site check guards the cookie; the phone app sends a header instead (A-203).
    if (!fromHeader) assertSameOrigin(request);
    const principal = await resolveStudentSession(prisma, token);
    if (!principal) throw AppError.unauthenticated();
    await setStudentPassword(principal, body);
    return json({ ok: true });
  },
);
