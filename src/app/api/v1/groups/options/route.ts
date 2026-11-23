import { json, route } from "@/server/http/handler";
import { teachersChangeSchedule } from "@/server/services/groups/groups.service";
import { getGroupFormOptions } from "@/server/services/groups/options.service";

/**
 * What the group form and the groups filters choose from (A-233): courses,
 * rooms, grading systems and teachers of the person's branches, and whether the
 * centre lets teachers change the times of their own groups (A-193). The site
 * reads these on its pages; the app asks for them here.
 */
export const GET = route({ permission: "groups.view" }, async ({ current }) => {
  const [options, teachersChangeTimes] = await Promise.all([
    getGroupFormOptions(current.actor),
    teachersChangeSchedule(current.actor),
  ]);
  return json({ ...options, teachersChangeTimes });
});
