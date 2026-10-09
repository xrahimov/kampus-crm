import { bulkLeadsSchema } from "@/lib/validation/leads";
import { json, route } from "@/server/http/handler";
import { bulkLeads } from "@/server/services/leads/leads.service";

/** Bulk actions on the ticked leads (A-132): move to a column, archive, restore. */
export const POST = route<typeof bulkLeadsSchema._output>(
  { permission: "leads.update", body: bulkLeadsSchema },
  async ({ current, body }) => json(await bulkLeads(current.actor, body)),
);
