import { json, route } from "@/server/http/handler";
import { getVapidKeys } from "@/server/services/push/push.service";

/** The server's public VAPID key, which a browser needs to subscribe (A-176). */
export const GET = route({ auth: false }, async () => {
  const { publicKey } = await getVapidKeys();
  return json({ publicKey });
});
