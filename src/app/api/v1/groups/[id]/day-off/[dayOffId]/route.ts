import { route } from "@/server/http/handler";
import { removeGroupDayOff } from "@/server/services/groups/day-off.service";

type Params = { id: string; dayOffId: string };

/** Undoes a group's day off (A-117): the planned lesson comes back. */
export const DELETE = route<undefined, Params>(
  { permission: "groups.update" },
  async ({ current, params }) => {
    await removeGroupDayOff(current.actor, params.id, params.dayOffId);
    return new Response(null, { status: 204 });
  },
);
