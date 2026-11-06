import { lessonRatingSchema } from "@/lib/validation/groups";
import { assertSameOrigin } from "@/server/auth/csrf";
import { AppError } from "@/server/errors/app-error";
import { json, route } from "@/server/http/handler";
import { fieldErrors } from "@/server/http/list-query";
import { ratePortalLesson } from "@/server/services/portal/lesson-rating.service";

type Params = { token: string; lessonId: string };

/** The student rates a lesson that is over: `{ rating: 1-5, comment? }` (A-168). */
export const POST = route<undefined, Params>(
  { auth: false, skipCsrf: true },
  async ({ request, params }) => {
    assertSameOrigin(request);
    const parsed = lessonRatingSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw AppError.validation(fieldErrors(parsed.error.issues));
    const saved = await ratePortalLesson(params.token, params.lessonId, parsed.data);
    return saved ? json(saved) : new Response(null, { status: 404 });
  },
);
