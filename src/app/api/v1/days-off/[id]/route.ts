import { dayOffUpdateSchema } from "@/lib/validation/settings";
import { json, route } from "@/server/http/handler";
import { deleteDayOff, updateDayOff } from "@/server/services/settings/days-off.service";

type Params = { id: string };

export const PATCH = route<typeof dayOffUpdateSchema._output, Params>(
  { permission: "settings.catalog", body: dayOffUpdateSchema },
  async ({ current, body, params }) => json(await updateDayOff(current.actor, params.id, body)),
);

export const DELETE = route<undefined, Params>(
  { permission: "settings.catalog" },
  async ({ current, params }) => {
    await deleteDayOff(current.actor, params.id);
    return new Response(null, { status: 204 });
  },
);
