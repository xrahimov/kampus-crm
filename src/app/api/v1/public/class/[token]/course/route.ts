import { json, route } from "@/server/http/handler";
import { listPortalCourse } from "@/server/services/settings/topic-content.service";

type Params = { token: string };

/** The course's topics and the content the student may open (A-157). */
export const GET = route<undefined, Params>({ auth: false }, async ({ params }) => {
  const course = await listPortalCourse(params.token);
  return course ? json(course) : new Response(null, { status: 404 });
});
