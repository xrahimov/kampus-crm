import { json, route } from "@/server/http/handler";
import { listActionLogActors } from "@/server/services/logs/logs.service";

/**
 * The staff who appear in the action log: the choices of its "Staff" filter
 * and of the SMS log's "Sent by". The site's pages read them on the server;
 * the phone app asks for them here (A-246).
 */
export const GET = route({ permission: "logs.view" }, async ({ current }) =>
  json(await listActionLogActors(current.actor)),
);
