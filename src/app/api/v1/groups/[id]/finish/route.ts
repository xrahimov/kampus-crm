import { json, route } from "@/server/http/handler";
import { finishGroup } from "@/server/services/groups/groups.service";

export const POST = route<undefined, { id: string }>(
  { permission: "groups.update" },
  async ({ current, params }) => json(await finishGroup(current.actor, params.id)),
);
