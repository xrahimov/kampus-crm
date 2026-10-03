import { toLeadSchema } from "@/lib/validation/leads";
import { json, route } from "@/server/http/handler";
import { returnToLeads } from "@/server/services/leads/leads.service";

/** "Lidlarga qaytarish" (EXP §5 row menu). */
export const POST = route<typeof toLeadSchema._output, { id: string }>(
  { permission: "groups.update", body: toLeadSchema },
  async ({ current, body, params }) =>
    json(await returnToLeads(current.actor, params.id, body), { status: 201 }),
);
