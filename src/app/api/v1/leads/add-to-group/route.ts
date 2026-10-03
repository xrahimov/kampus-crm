import { leadsToGroupSchema } from "@/lib/validation/leads";
import { json, route } from "@/server/http/handler";
import { addLeadsToGroup } from "@/server/services/leads/leads.service";

/** "LIDLARNI GURUHGA QO'SHISH" (EXP §2). */
export const POST = route<typeof leadsToGroupSchema._output>(
  { permission: "leads.update", body: leadsToGroupSchema },
  async ({ current, body }) => json(await addLeadsToGroup(current.actor, body), { status: 201 }),
);
