import { changeTeacherSchema } from "@/lib/validation/groups";
import { json, route } from "@/server/http/handler";
import { changeGroupTeacher } from "@/server/services/groups/groups.service";

export const POST = route<typeof changeTeacherSchema._output, { id: string }>(
  { permission: "groups.update", body: changeTeacherSchema },
  async ({ current, body, params }) =>
    json(await changeGroupTeacher(current.actor, params.id, body.fromUserId, body.to)),
);
