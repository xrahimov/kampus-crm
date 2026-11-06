import { json, route } from "@/server/http/handler";
import { getPortalProgress } from "@/server/services/progress/course-progress.service";

type Params = { token: string };

/** The student's own progress through the course (A-159). */
export const GET = route<undefined, Params>({ auth: false }, async ({ params }) => {
  const progress = await getPortalProgress(params.token);
  return progress ? json(progress) : new Response(null, { status: 404 });
});
