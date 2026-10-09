import { trialOutcomeSchema } from "@/lib/validation/leads";
import { json, route } from "@/server/http/handler";
import { setTrialOutcome } from "@/server/services/leads/trials.service";

type Params = { bookingId: string };

/**
 * The outcome of a trial visit (A-131): came, didn't come, back to booked, or
 * cancelled. The service decides who may set which (teachers of the group mark
 * the visit; the office may also cancel).
 */
export const PATCH = route<typeof trialOutcomeSchema._output, Params>(
  { body: trialOutcomeSchema },
  async ({ current, params, body }) =>
    json(await setTrialOutcome(current.actor, params.bookingId, body)),
);
