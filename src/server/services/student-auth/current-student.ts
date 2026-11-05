import { cookies } from "next/headers";
import { cache } from "react";

import { STUDENT_SESSION_COOKIE } from "@/lib/auth/constants";
import { prisma } from "@/server/db/prisma";
import {
  resolveStudentSession,
  type StudentPrincipal,
} from "@/server/services/student-auth/student-auth.service";

/** For server components: the signed-in student or parent (A-150), cached per request. */
export const getCurrentStudent = cache(async (): Promise<StudentPrincipal | null> => {
  const store = await cookies();
  return resolveStudentSession(prisma, store.get(STUDENT_SESSION_COOKIE)?.value);
});
