import { json, route } from "@/server/http/handler";
import { getGroupProgress } from "@/server/services/progress/course-progress.service";

type Params = { id: string };

/** Each current student's progress through the course, one cell per topic (A-159). */
export const GET = route<undefined, Params>(
  { permission: "groups.view" },
  async ({ current, params }) => json(await getGroupProgress(current.actor, params.id)),
);
