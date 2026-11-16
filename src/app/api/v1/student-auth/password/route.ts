import { STUDENT_SESSION_COOKIE } from "@/lib/auth/constants";
import { studentPasswordSchema } from "@/lib/validation/sign-in";
import { assertSameOrigin } from "@/server/auth/csrf";
import { prisma } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";
import { json, route } from "@/server/http/handler";
import { setStudentPassword } from "@/server/services/sign-in/password.service";
import { resolveStudentSession } from "@/server/services/student-auth/student-auth.service";

/** A student or parent chooses or changes their password (A-196). */
export const POST = route(
  { auth: false, body: studentPasswordSchema, skipCsrf: true },
  async ({ body, request }) => {
    assertSameOrigin(request);
    const principal = await resolveStudentSession(
      prisma,
      request.cookies.get(STUDENT_SESSION_COOKIE)?.value,
    );
    if (!principal) throw AppError.unauthenticated();
    await setStudentPassword(principal, body);
    return json({ ok: true });
  },
);
