import { json, route } from "@/server/http/handler";
import { getLeadOptions } from "@/server/services/leads/leads.service";

export const GET = route({ permission: "leads.view" }, async ({ current }) =>
  json(await getLeadOptions(current.actor)),
);
