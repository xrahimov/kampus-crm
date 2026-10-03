import { json, route } from "@/server/http/handler";
import { getStudent, restoreStudent } from "@/server/services/students/students.service";

export const POST = route<undefined, { id: string }>(
  { permission: "students.update" },
  async ({ current, params }) => {
    await restoreStudent(current.actor, params.id);
    return json(await getStudent(current.actor, params.id));
  },
);
