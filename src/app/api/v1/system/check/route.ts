import { json, route } from "@/server/http/handler";
import { checkNow } from "@/server/services/system/monitoring.service";

/* Site owner only (A-134): one monitoring pass now, alerts included. */

export const POST = route({}, async ({ current }) => json(await checkNow(current.actor)));
