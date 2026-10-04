import { json, route } from "@/server/http/handler";
import { listIntegrations } from "@/server/services/integrations/integrations.service";

/** Every provider's masked settings (A-83). */
export const GET = route({ permission: "settings.integrations" }, async ({ current }) =>
  json(await listIntegrations(current.actor)),
);
