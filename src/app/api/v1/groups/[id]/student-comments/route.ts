import { z } from "zod";

import { studentCommentSchema } from "@/lib/validation/students";
import { json, route } from "@/server/http/handler";
import { addStudentComment, listGroupComments } from "@/server/services/students/students.service";

type Params = { id: string };
const schema = studentCommentSchema
  .omit({ groupId: true })
  .extend({ studentId: z.string().min(1) });

/** "O'quvchiga izoh" tab (EXP §5). */
export const GET = route<undefined, Params>(
  { permission: "groups.view" },
  async ({ current, params }) => json(await listGroupComments(current.actor, params.id)),
);

export const POST = route<typeof schema._output, Params>(
  { permission: "groups.view", body: schema },
  async ({ current, body, params }) =>
    json(
      await addStudentComment(current.actor, body.studentId, {
        text: body.text,
        groupId: params.id,
      }),
      { status: 201 },
    ),
);
