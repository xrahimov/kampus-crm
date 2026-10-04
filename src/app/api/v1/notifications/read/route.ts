import { markReadSchema } from "@/lib/validation/dashboard";
import { json, route } from "@/server/http/handler";
import { markRead } from "@/server/services/dashboard/notifications.service";

/** Marks the given notifications (or all of the user's) as read. */
export const POST = route<typeof markReadSchema._output>(
  { body: markReadSchema },
  async ({ current, body }) => json(await markRead(current.actor, body)),
);
