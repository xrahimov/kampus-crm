import { studentUpdateSchema } from "@/lib/validation/students";
import { json, route } from "@/server/http/handler";
import {
  archiveStudent,
  getStudent,
  updateStudent,
} from "@/server/services/students/students.service";

type Params = { id: string };

export const GET = route<undefined, Params>(
  { permission: "students.view" },
  async ({ current, params }) => json(await getStudent(current.actor, params.id)),
);

export const PATCH = route<typeof studentUpdateSchema._output, Params>(
  { permission: "students.update", body: studentUpdateSchema },
  async ({ current, body, params }) => json(await updateStudent(current.actor, params.id, body)),
);

/** "O'chirish" archives the student (A-38). */
export const DELETE = route<undefined, Params>(
  { permission: "students.delete" },
  async ({ current, params }) => {
    await archiveStudent(current.actor, params.id);
    return new Response(null, { status: 204 });
  },
);
