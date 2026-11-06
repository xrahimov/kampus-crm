import { assignmentSchema } from "@/lib/validation/groups";
import { json, route } from "@/server/http/handler";
import { createAssignment, listGroupHomework } from "@/server/services/homework/homework.service";

type Params = { id: string };

/** Group → homework tab: every homework with each member's answer, plus assignable lessons. */
export const GET = route<undefined, Params>(
  { permission: "groups.view" },
  async ({ current, params }) => json(await listGroupHomework(current.actor, params.id)),
);

/** A standalone assignment for the whole group (A-161). */
export const POST = route<typeof assignmentSchema._output, Params>(
  { permission: "groups.attendance.mark", body: assignmentSchema },
  async ({ current, params, body }) =>
    json(await createAssignment(current.actor, params.id, body), { status: 201 }),
);
