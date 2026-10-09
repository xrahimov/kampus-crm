import { announcementReadSchema } from "@/lib/validation/announcements";
import { assertSameOrigin } from "@/server/auth/csrf";
import { AppError } from "@/server/errors/app-error";
import { json, route } from "@/server/http/handler";
import { fieldErrors } from "@/server/http/list-query";
import {
  listPortalAnnouncements,
  markPortalAnnouncementsRead,
} from "@/server/services/announcements/announcements.service";

type Params = { token: string };

/** The notices a student's link shows (A-129). */
export const GET = route<undefined, Params>({ auth: false }, async ({ params }) => {
  const items = await listPortalAnnouncements(params.token);
  return items ? json(items) : new Response(null, { status: 404 });
});

/** The student opened these: `{ ids }`. The link in the path is the credential. */
export const POST = route<undefined, Params>(
  { auth: false, skipCsrf: true },
  async ({ request, params }) => {
    assertSameOrigin(request);
    const parsed = announcementReadSchema.safeParse(await request.json().catch(() => null));
    if (!parsed.success) throw AppError.validation(fieldErrors(parsed.error.issues));
    const result = await markPortalAnnouncementsRead(params.token, parsed.data.ids);
    return result ? json(result) : new Response(null, { status: 404 });
  },
);
