import { assertSameOrigin } from "@/server/auth/csrf";
import { json, route } from "@/server/http/handler";
import { deletePortalComment } from "@/server/services/stream/stream.service";

type Params = { token: string; id: string };

/** A student takes back their own comment (A-164). */
export const DELETE = route<undefined, Params>(
  { auth: false, skipCsrf: true },
  async ({ request, params }) => {
    assertSameOrigin(request);
    const post = await deletePortalComment(params.token, params.id);
    return post ? json(post) : new Response(null, { status: 404 });
  },
);
