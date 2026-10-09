import { waitlistUpdateSchema } from "@/lib/validation/leads";
import { json, route } from "@/server/http/handler";
import { getWaitlistEntry, updateWaitlistEntry } from "@/server/services/leads/waitlist.service";

type Params = { id: string };

export const GET = route<undefined, Params>(
  { permission: "leads.view" },
  async ({ current, params }) => json(await getWaitlistEntry(current.actor, params.id)),
);

/** Details, or the status: back to waiting, declined, removed (A-138). */
export const PATCH = route<typeof waitlistUpdateSchema._output, Params>(
  { permission: "leads.update", body: waitlistUpdateSchema },
  async ({ current, params, body }) =>
    json(await updateWaitlistEntry(current.actor, params.id, body)),
);
