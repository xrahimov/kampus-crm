import { json, route } from "@/server/http/handler";
import { listLessonRatings } from "@/server/services/portal/lesson-rating.service";

/** The students' ratings of one lesson, for staff who see the group (A-168). */
export const GET = route<undefined, { id: string }>(
  { permission: "groups.view" },
  async ({ current, params }) => json(await listLessonRatings(current.actor, params.id)),
);
