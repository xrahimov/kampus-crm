import { json, route } from "@/server/http/handler";
import { sendTestAlert } from "@/server/services/system/monitoring.service";

/* Site owner only (A-134): a test message to the alert chat. */

export const POST = route({}, async ({ current }) => {
  await sendTestAlert(current.actor);
  return json({ ok: true });
});
