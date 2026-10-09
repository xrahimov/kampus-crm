import { json, route } from "@/server/http/handler";
import { getSystemStatus } from "@/server/services/system/monitoring.service";

/* Site owner only (A-134); the service checks the flag, since no role grants it. */

export const GET = route({}, async ({ current }) => json(await getSystemStatus(current.actor)));
