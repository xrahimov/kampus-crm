import { json, route } from "@/server/http/handler";
import { unlinkStudentAccess } from "@/server/services/student-auth/access.service";

/** Takes a Telegram account's access to this student away (A-150). */
export const DELETE = route<undefined, { id: string; linkId: string }>(
  { permission: "students.update" },
  async ({ current, params }) => {
    await unlinkStudentAccess(current.actor, params.id, params.linkId);
    return json({ ok: true });
  },
);
