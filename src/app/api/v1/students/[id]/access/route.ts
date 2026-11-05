import { json, route } from "@/server/http/handler";
import { listStudentAccess } from "@/server/services/student-auth/access.service";

/** Telegram accounts that may sign in as this student or as their parent (A-150). */
export const GET = route<undefined, { id: string }>(
  { permission: "students.view" },
  async ({ current, params }) => json(await listStudentAccess(current.actor, params.id)),
);
