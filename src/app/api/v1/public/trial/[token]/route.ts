import { assertSameOrigin } from "@/server/auth/csrf";
import { json, route } from "@/server/http/handler";
import { getTrialPage, joinVideoRoomAsTrial } from "@/server/services/video/video.service";

type Params = { token: string };

/** A trial visitor's link (A-172): whose visit it is and whether the call is on (polled by the page). */
export const GET = route<undefined, Params>({ auth: false }, async ({ params }) => {
  const page = await getTrialPage(params.token);
  return page ? json(page) : new Response(null, { status: 404 });
});

/** The visitor enters the group's running call. No session: the token is the credential. */
export const POST = route<undefined, Params>(
  { auth: false, skipCsrf: true },
  async ({ request, params }) => {
    assertSameOrigin(request);
    return json(await joinVideoRoomAsTrial(params.token));
  },
);
