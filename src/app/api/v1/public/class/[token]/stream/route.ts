import { json, route } from "@/server/http/handler";
import { listPortalStream } from "@/server/services/stream/stream.service";

type Params = { token: string };

/** The group's stream on the student's page (A-164). */
export const GET = route<undefined, Params>({ auth: false }, async ({ params }) => {
  const posts = await listPortalStream(params.token);
  return posts ? json(posts) : new Response(null, { status: 404 });
});
