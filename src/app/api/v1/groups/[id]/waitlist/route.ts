import { waitlistOfferSchema } from "@/lib/validation/leads";
import { json, route } from "@/server/http/handler";
import { getGroupWaitlist, offerSeats } from "@/server/services/leads/waitlist.service";

type Params = { id: string };

/** What "Offer seats" would do for this group: free seats and who is next in line (A-138). */
export const GET = route<undefined, Params>(
  { permission: "leads.view" },
  async ({ current, params }) => json(await getGroupWaitlist(current.actor, params.id)),
);

/** Texts the first waiting people and marks them offered. */
export const POST = route<typeof waitlistOfferSchema._output, Params>(
  { permission: "leads.update", body: waitlistOfferSchema },
  async ({ current, params, body }) => json(await offerSeats(current.actor, params.id, body)),
);
