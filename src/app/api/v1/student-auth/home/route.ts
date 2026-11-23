import { prisma } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";
import { json, route } from "@/server/http/handler";
import { studentSessionToken } from "@/server/services/student-auth/http";
import { resolveStudentSession } from "@/server/services/student-auth/student-auth.service";
import { getStudentHome } from "@/server/services/student-auth/student-home.service";

/**
 * The signed-in student's or parent's home as data (A-203): what the `/student`
 * page shows, for the phone app. Answers 401 without a student session.
 */
export const GET = route({ auth: false }, async ({ request }) => {
  const principal = await resolveStudentSession(prisma, studentSessionToken(request).token);
  if (!principal) throw AppError.unauthenticated();
  return json({
    ...(await getStudentHome(principal)),
    // A password may be chosen without the old one only after a Telegram sign-in (A-196).
    signedInWith: principal.signedInWith,
  });
});
