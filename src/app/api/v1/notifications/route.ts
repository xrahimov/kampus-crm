import { notificationsQuerySchema } from "@/lib/validation/dashboard";
import { json, route } from "@/server/http/handler";
import { listNotifications } from "@/server/services/dashboard/notifications.service";

import { parseQuery } from "../finance/_query";

/** The bell panel and "Barcha xabarnomalar" (EXP §11): `?unread=1&page=`. */
export const GET = route({}, async ({ current, request }) =>
  json(
    await listNotifications(
      current.actor,
      parseQuery(request, ["unread", "page"], notificationsQuerySchema),
    ),
  ),
);
