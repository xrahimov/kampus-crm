import { alertRecipientSchema } from "@/lib/validation/settings";
import { json, route } from "@/server/http/handler";
import { setAlertRecipient } from "@/server/services/system/monitoring.service";

/* Site owner only (A-134): the Telegram chat that receives server alerts. */

export const PUT = route({ body: alertRecipientSchema }, async ({ current, body }) =>
  json(await setAlertRecipient(current.actor, body)),
);
