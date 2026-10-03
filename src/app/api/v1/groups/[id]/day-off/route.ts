import { groupDayOffSchema } from "@/lib/validation/groups";
import { json, route } from "@/server/http/handler";
import { addGroupDayOff, listGroupDaysOff } from "@/server/services/groups/groups.service";

type Params = { id: string };

export const GET = route<undefined, Params>(
  { permission: "groups.view" },
  async ({ current, params }) => json(await listGroupDaysOff(current.actor, params.id)),
);

export const POST = route<typeof groupDayOffSchema._output, Params>(
  { permission: "groups.update", body: groupDayOffSchema },
  async ({ current, body, params }) =>
    json(await addGroupDayOff(current.actor, params.id, body), { status: 201 }),
);
