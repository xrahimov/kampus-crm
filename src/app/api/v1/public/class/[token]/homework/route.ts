import { json, route } from "@/server/http/handler";
import { listPortalHomework } from "@/server/services/homework/homework.service";

type Params = { token: string };

/** The student's homework list, as their link shows it. */
export const GET = route<undefined, Params>({ auth: false }, async ({ params }) => {
  const items = await listPortalHomework(params.token);
  return items ? json(items) : new Response(null, { status: 404 });
});
