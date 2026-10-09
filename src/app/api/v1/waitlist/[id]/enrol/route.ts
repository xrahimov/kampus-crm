import { waitlistEnrolSchema } from "@/lib/validation/leads";
import { json, route } from "@/server/http/handler";
import { enrolWaitlistEntry } from "@/server/services/leads/waitlist.service";

type Params = { id: string };

/** The person joins the chosen group of their course; the entry closes as enrolled (A-138). */
export const POST = route<typeof waitlistEnrolSchema._output, Params>(
  { permission: "leads.update", body: waitlistEnrolSchema },
  async ({ current, params, body }) =>
    json(await enrolWaitlistEntry(current.actor, params.id, body)),
);
