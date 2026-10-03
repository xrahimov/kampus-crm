import { json, route } from "@/server/http/handler";
import { activateMembers } from "@/server/services/groups/memberships.service";

/** "O'quvchilarni faollashtirish". */
export const POST = route<undefined, { id: string }>(
  { permission: "groups.update" },
  async ({ current, params }) =>
    json({ activated: await activateMembers(current.actor, params.id) }),
);
