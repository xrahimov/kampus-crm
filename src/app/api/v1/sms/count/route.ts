import { z } from "zod";

import { smsTargetSchema } from "@/lib/validation/integrations";
import { json, route } from "@/server/http/handler";
import { countRecipients } from "@/server/services/sms/sms.service";

const body = z.object({ target: smsTargetSchema });

/** How many phones a target reaches, shown in the send dialog before sending. */
export const POST = route<z.output<typeof body>>(
  { permission: "sms.send", body },
  async ({ current, body }) => json(await countRecipients(current.actor, body.target)),
);
