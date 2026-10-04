import { testAttemptSchema } from "@/lib/validation/tests";
import { json, route } from "@/server/http/handler";
import { recordAttempt } from "@/server/services/tests/tests.service";

type Params = { id: string };

/** "Natija kiritish": a student's answers, scored server-side (A-82). */
export const POST = route<typeof testAttemptSchema._output, Params>(
  { permission: "tests.update", body: testAttemptSchema },
  async ({ current, body, params }) =>
    json(await recordAttempt(current.actor, params.id, body), { status: 201 }),
);
