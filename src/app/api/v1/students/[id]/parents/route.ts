import { parentSchema } from "@/lib/validation/students";
import { json, route } from "@/server/http/handler";
import { addParent } from "@/server/services/students/students.service";

export const POST = route<typeof parentSchema._output, { id: string }>(
  { permission: "students.update", body: parentSchema },
  async ({ current, body, params }) =>
    json(await addParent(current.actor, params.id, body), { status: 201 }),
);
