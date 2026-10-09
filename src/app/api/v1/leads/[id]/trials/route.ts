import { trialBookingSchema } from "@/lib/validation/leads";
import { json, route } from "@/server/http/handler";
import { bookTrial, listLeadTrials } from "@/server/services/leads/trials.service";

type Params = { id: string };

/** The lead's trial lessons, newest first (A-131). */
export const GET = route<undefined, Params>(
  { permission: "leads.view" },
  async ({ current, params }) => json(await listLeadTrials(current.actor, params.id)),
);

/** "Book a trial": the group, the day and a note for the teacher. */
export const POST = route<typeof trialBookingSchema._output, Params>(
  { permission: "leads.update", body: trialBookingSchema },
  async ({ current, params, body }) =>
    json(await bookTrial(current.actor, params.id, body), { status: 201 }),
);
