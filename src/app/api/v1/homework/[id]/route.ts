import { assignmentSchema } from "@/lib/validation/groups";
import { json, route } from "@/server/http/handler";
import { deleteHomework, updateAssignment } from "@/server/services/homework/homework.service";

type Params = { id: string };

/** Changes a standalone assignment (A-161); a lesson's homework is edited through its lesson. */
export const PUT = route<typeof assignmentSchema._output, Params>(
  { permission: "groups.attendance.mark", body: assignmentSchema },
  async ({ current, params, body }) => json(await updateAssignment(current.actor, params.id, body)),
);

export const DELETE = route<undefined, Params>(
  { permission: "groups.attendance.mark" },
  async ({ current, params }) => {
    await deleteHomework(current.actor, params.id);
    return new Response(null, { status: 204 });
  },
);
