import { json, route } from "@/server/http/handler";
import { listPortalTests } from "@/server/services/tests/portal-tests.service";

type Params = { token: string };

/** The tests the student's group was given, with what the student already took. */
export const GET = route<undefined, Params>({ auth: false }, async ({ params }) => {
  const items = await listPortalTests(params.token);
  return items ? json(items) : new Response(null, { status: 404 });
});
