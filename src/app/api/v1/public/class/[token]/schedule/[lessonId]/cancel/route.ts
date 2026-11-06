import { assertSameOrigin } from "@/server/auth/csrf";
import { json, route } from "@/server/http/handler";
import { cancelPortalLesson } from "@/server/services/portal/reschedule.service";

type Params = { token: string; lessonId: string };

/** The student cancels a lesson inside the window (A-166). */
export const POST = route<undefined, Params>(
  { auth: false, skipCsrf: true },
  async ({ request, params }) => {
    assertSameOrigin(request);
    const schedule = await cancelPortalLesson(params.token, params.lessonId);
    return schedule ? json(schedule) : new Response(null, { status: 404 });
  },
);
