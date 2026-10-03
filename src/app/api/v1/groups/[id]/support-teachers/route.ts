import { supportTeachersSchema } from "@/lib/validation/groups";
import { json, route } from "@/server/http/handler";
import { setSupportTeachers } from "@/server/services/groups/groups.service";

/** Replaces the group's support teachers (EXP §5 "Support o'qituvchi qo'shish"). */
export const POST = route<typeof supportTeachersSchema._output, { id: string }>(
  { permission: "groups.update", body: supportTeachersSchema },
  async ({ current, body, params }) =>
    json(await setSupportTeachers(current.actor, params.id, body.userIds)),
);
