import { assertSameOrigin } from "@/server/auth/csrf";
import { json, route } from "@/server/http/handler";
import { getClassPage, joinVideoRoomAsStudent } from "@/server/services/video/video.service";

type Params = { token: string };

/** A student's personal link: whose it is and whether the call is on (polled by the page). */
export const GET = route<undefined, Params>({ auth: false }, async ({ params }) => {
  const page = await getClassPage(params.token);
  return page ? json(page) : new Response(null, { status: 404 });
});

/** The student enters the group's running call. No session: the token is the credential. */
export const POST = route<undefined, Params>(
  { auth: false, skipCsrf: true },
  async ({ request, params }) => {
    assertSameOrigin(request);
    return json(await joinVideoRoomAsStudent(params.token));
  },
);
