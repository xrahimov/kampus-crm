import { json, route } from "@/server/http/handler";
import { signOutStudentAccess } from "@/server/services/student-auth/access.service";

/** Signs the linked Telegram account out on every device (A-150). */
export const POST = route<undefined, { id: string; linkId: string }>(
  { permission: "students.update" },
  async ({ current, params }) => {
    await signOutStudentAccess(current.actor, params.id, params.linkId);
    return json({ ok: true });
  },
);
