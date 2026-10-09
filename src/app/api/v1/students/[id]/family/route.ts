import { json, route } from "@/server/http/handler";
import { getStudentFamily, unlinkStudent } from "@/server/services/students/families.service";

/** The student's family (A-123), or null. */
export const GET = route<undefined, { id: string }>(
  { permission: "students.view" },
  async ({ current, params }) => json(await getStudentFamily(current.actor, params.id)),
);

/** Takes the student out of their family. */
export const DELETE = route<undefined, { id: string }>(
  { permission: "students.update" },
  async ({ current, params }) => {
    await unlinkStudent(current.actor, params.id);
    return json({ ok: true });
  },
);
