import { json, route } from "@/server/http/handler";
import { setLeadArchived } from "@/server/services/leads/leads.service";

export const POST = route<undefined, { id: string }>(
  { permission: "leads.update" },
  async ({ current, params }) => json(await setLeadArchived(current.actor, params.id, false)),
);
