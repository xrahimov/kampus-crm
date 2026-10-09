import { leadContactSchema } from "@/lib/validation/leads";
import { json, route } from "@/server/http/handler";
import { listLeadContacts, logLeadContact } from "@/server/services/leads/follow-up.service";

type Params = { id: string };

/** Every call, message, visit or note on the lead, newest first (A-126). */
export const GET = route<undefined, Params>(
  { permission: "leads.view" },
  async ({ current, params }) => json(await listLeadContacts(current.actor, params.id)),
);

/** "Log a contact": the outcome moves the status and sets the next date. */
export const POST = route<typeof leadContactSchema._output, Params>(
  { permission: "leads.update", body: leadContactSchema },
  async ({ current, params, body }) =>
    json(await logLeadContact(current.actor, params.id, body), { status: 201 }),
);
