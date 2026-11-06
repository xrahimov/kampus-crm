import { lessonMoveSchema } from "@/lib/validation/groups";
import { assertSameOrigin } from "@/server/auth/csrf";
import { AppError } from "@/server/errors/app-error";
import { json, route } from "@/server/http/handler";
import { fieldErrors } from "@/server/http/list-query";
import { movePortalLesson } from "@/server/services/portal/reschedule.service";

type Params = { token: string; lessonId: string };

/** The student moves a lesson: `{ date, startTime, endTime }`. The link in the path is the credential. */
export const POST = route<undefined, Params>(
  { auth: false, skipCsrf: true },
  async ({ request, params }) => {
    assertSameOrigin(request);
    const parsed = lessonMoveSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw AppError.validation(fieldErrors(parsed.error.issues));
    const schedule = await movePortalLesson(params.token, params.lessonId, parsed.data);
    return schedule ? json(schedule) : new Response(null, { status: 404 });
  },
);
