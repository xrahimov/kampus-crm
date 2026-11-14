import { groupScheduleSchema } from "@/lib/validation/groups";
import { json, route } from "@/server/http/handler";
import { updateGroupSchedule } from "@/server/services/groups/groups.service";

type Params = { id: string };

/**
 * Days, times and rooms only (A-193). `groups.view` opens the door; the service
 * lets in `groups.update` and, where the centre allows it, the group's own teacher.
 */
export const PATCH = route<typeof groupScheduleSchema._output, Params>(
  { permission: "groups.view", body: groupScheduleSchema },
  async ({ current, body, params }) =>
    json(await updateGroupSchedule(current.actor, params.id, body)),
);
