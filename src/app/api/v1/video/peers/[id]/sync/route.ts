import { videoSyncSchema } from "@/lib/validation/video";
import { assertSameOrigin } from "@/server/auth/csrf";
import { json, route } from "@/server/http/handler";
import { syncVideoPeer } from "@/server/services/video/video.service";

type Params = { id: string };

/**
 * A browser's poll in a call. Students have no session, so the participant's
 * own secret (from the join response) authenticates it instead of a cookie; the
 * same-origin check stands in for the CSRF token.
 */
export const POST = route<typeof videoSyncSchema._output, Params>(
  { auth: false, body: videoSyncSchema, skipCsrf: true },
  async ({ request, params, body }) => {
    assertSameOrigin(request);
    return json(await syncVideoPeer(params.id, body));
  },
);
