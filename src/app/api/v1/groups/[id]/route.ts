import { groupUpdateSchema } from "@/lib/validation/groups";
import { json, route } from "@/server/http/handler";
import { archiveGroup, getGroup, updateGroup } from "@/server/services/groups/groups.service";

type Params = { id: string };

export const GET = route<undefined, Params>(
  { permission: "groups.view" },
  async ({ current, params }) => json(await getGroup(current.actor, params.id)),
);

export const PATCH = route<typeof groupUpdateSchema._output, Params>(
  { permission: "groups.update", body: groupUpdateSchema },
  async ({ current, body, params }) => json(await updateGroup(current.actor, params.id, body)),
);

export const DELETE = route<undefined, Params>(
  { permission: "groups.delete" },
  async ({ current, params }) => {
    await archiveGroup(current.actor, params.id);
    return new Response(null, { status: 204 });
  },
);
