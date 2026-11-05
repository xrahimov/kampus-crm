import { exerciseAttemptSchema } from "@/lib/validation/exercises";
import { assertSameOrigin } from "@/server/auth/csrf";
import { json, route } from "@/server/http/handler";
import {
  getPortalExercise,
  submitPortalExercise,
} from "@/server/services/exercises/exercises.service";

type Params = { token: string; exerciseId: string };

/** The exercise without its answer key. No session: the link is the credential. */
export const GET = route<undefined, Params>({ auth: false }, async ({ params }) =>
  json(await getPortalExercise(params.token, params.exerciseId)),
);

/** One go: scored on the server, kept, the key returned. */
export const POST = route<typeof exerciseAttemptSchema._output, Params>(
  { auth: false, skipCsrf: true, body: exerciseAttemptSchema },
  async ({ request, params, body }) => {
    assertSameOrigin(request);
    return json(await submitPortalExercise(params.token, params.exerciseId, body), {
      status: 201,
    });
  },
);
