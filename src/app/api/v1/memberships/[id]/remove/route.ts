import { json, route } from "@/server/http/handler";
import { removeMember } from "@/server/services/groups/memberships.service";

/** "Guruhdan chiqarish". */
export const POST = route<undefined, { id: string }>(
  { permission: "groups.update" },
  async ({ current, params }) => json(await removeMember(current.actor, params.id)),
);
