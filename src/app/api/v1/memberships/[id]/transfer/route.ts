import { transferSchema } from "@/lib/validation/students";
import { json, route } from "@/server/http/handler";
import { transferMember } from "@/server/services/groups/memberships.service";

/** "Boshqa guruhga ko'chirish". */
export const POST = route<typeof transferSchema._output, { id: string }>(
  { permission: "groups.update", body: transferSchema },
  async ({ current, body, params }) =>
    json(await transferMember(current.actor, params.id, body), { status: 201 }),
);
