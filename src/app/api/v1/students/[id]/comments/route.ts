import { studentCommentSchema } from "@/lib/validation/students";
import { json, route } from "@/server/http/handler";
import {
  addStudentComment,
  listStudentComments,
} from "@/server/services/students/students.service";

type Params = { id: string };

export const GET = route<undefined, Params>(
  { permission: "students.view" },
  async ({ current, params }) => json(await listStudentComments(current.actor, params.id)),
);

export const POST = route<typeof studentCommentSchema._output, Params>(
  { permission: "students.view", body: studentCommentSchema },
  async ({ current, body, params }) =>
    json(await addStudentComment(current.actor, params.id, body), { status: 201 }),
);
