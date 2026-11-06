import { lessonMoveSchema } from "@/lib/validation/groups";
import { assertSameOrigin } from "@/server/auth/csrf";
import { AppError } from "@/server/errors/app-error";
import { json, route } from "@/server/http/handler";
import { fieldErrors } from "@/server/http/list-query";
import { bookPortalLesson } from "@/server/services/portal/reschedule.service";

type Params = { token: string };

/** The student books an extra lesson: `{ date, startTime, endTime }` (A-169). */
export const POST = route<undefined, Params>(
  { auth: false, skipCsrf: true },
  async ({ request, params }) => {
    assertSameOrigin(request);
    const parsed = lessonMoveSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw AppError.validation(fieldErrors(parsed.error.issues));
    const schedule = await bookPortalLesson(params.token, parsed.data);
    return schedule ? json(schedule) : new Response(null, { status: 404 });
  },
);
