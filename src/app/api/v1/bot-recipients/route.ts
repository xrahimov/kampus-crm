import { botRecipientSchema } from "@/lib/validation/integrations";
import { json, route } from "@/server/http/handler";
import {
  createBotRecipient,
  listBotRecipients,
} from "@/server/services/integrations/bot-recipients.service";

/** Settings → "Bot xabarnoma" (EXP §8). */
export const GET = route({ permission: "settings.integrations" }, async ({ current }) =>
  json(await listBotRecipients(current.actor)),
);

export const POST = route<typeof botRecipientSchema._output>(
  { permission: "settings.integrations", body: botRecipientSchema },
  async ({ current, body }) => json(await createBotRecipient(current.actor, body), { status: 201 }),
);
