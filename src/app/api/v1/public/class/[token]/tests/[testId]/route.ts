import { portalTestAttemptSchema } from "@/lib/validation/tests";
import { assertSameOrigin } from "@/server/auth/csrf";
import { json, route } from "@/server/http/handler";
import { startPortalTest, submitPortalAttempt } from "@/server/services/tests/portal-tests.service";

type Params = { token: string; testId: string };

/** The student opens a test: its questions and the countdown. No session: the link is the credential. */
export const GET = route<undefined, Params>({ auth: false }, async ({ params }) =>
  json(await startPortalTest(params.token, params.testId)),
);

/** The student hands in their answers and gets the score back. */
export const POST = route<typeof portalTestAttemptSchema._output, Params>(
  { auth: false, skipCsrf: true, body: portalTestAttemptSchema },
  async ({ request, params, body }) => {
    assertSameOrigin(request);
    return json(await submitPortalAttempt(params.token, params.testId, body), { status: 201 });
  },
);
