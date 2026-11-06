import { portalTimeZoneSchema } from "@/lib/validation/students";
import { assertSameOrigin } from "@/server/auth/csrf";
import { AppError } from "@/server/errors/app-error";
import { route } from "@/server/http/handler";
import { fieldErrors } from "@/server/http/list-query";
import { setPortalTimeZone } from "@/server/services/portal/portal.service";

type Params = { token: string };

/** The student says which time zone they live in (A-177); the link is the credential. */
export const POST = route<undefined, Params>(
  { auth: false, skipCsrf: true },
  async ({ request, params }) => {
    assertSameOrigin(request);
    const parsed = portalTimeZoneSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw AppError.validation(fieldErrors(parsed.error.issues));
    if (!(await setPortalTimeZone(params.token, parsed.data.timeZone))) throw AppError.notFound();
    return new Response(null, { status: 204 });
  },
);
