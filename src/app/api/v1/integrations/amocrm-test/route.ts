import { json, route } from "@/server/http/handler";
import { testAmoCrm } from "@/server/services/integrations/integrations.service";

/** "Test connection" on the AmoCRM page. */
export const POST = route({ permission: "settings.integrations" }, async ({ current }) =>
  json(await testAmoCrm(current.actor)),
);
