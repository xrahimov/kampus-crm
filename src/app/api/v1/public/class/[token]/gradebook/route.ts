import { json, route } from "@/server/http/handler";
import { getPortalGradebook } from "@/server/services/gradebook/gradebook.service";

type Params = { token: string };

/** The student's own gradebook (A-162). */
export const GET = route<undefined, Params>({ auth: false }, async ({ params }) => {
  const gradebook = await getPortalGradebook(params.token);
  return gradebook ? json(gradebook) : new Response(null, { status: 404 });
});
