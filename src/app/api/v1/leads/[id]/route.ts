import { leadUpdateSchema } from "@/lib/validation/leads";
import { json, route } from "@/server/http/handler";
import { deleteLead, getLead, updateLead } from "@/server/services/leads/leads.service";

type Params = { id: string };

export const GET = route<undefined, Params>(
  { permission: "leads.view" },
  async ({ current, params }) => json(await getLead(current.actor, params.id)),
);

export const PATCH = route<typeof leadUpdateSchema._output, Params>(
  { permission: "leads.update", body: leadUpdateSchema },
  async ({ current, body, params }) => json(await updateLead(current.actor, params.id, body)),
);

export const DELETE = route<undefined, Params>(
  { permission: "leads.delete" },
  async ({ current, params }) => {
    await deleteLead(current.actor, params.id);
    return new Response(null, { status: 204 });
  },
);
