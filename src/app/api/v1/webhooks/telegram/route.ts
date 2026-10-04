import { z } from "zod";

import { prisma } from "@/server/db/prisma";
import { json, route } from "@/server/http/handler";
import {
  assertWebhookSecret,
  getTelegramNotifier,
} from "@/server/services/integrations/integrations.service";

import { presentedSecret } from "../_secret";

const update = z.object({
  message: z
    .object({
      chat: z.object({ id: z.union([z.number(), z.string()]) }),
      text: z.string().optional(),
    })
    .optional(),
});

/**
 * Telegram update webhook: answers `/start` or `/id` with the chat id, which is
 * the "Mahsus ID" a manager types into Bot xabarnoma (A-85).
 */
export const POST = route<z.output<typeof update>>(
  { auth: false, body: update, skipCsrf: true },
  async ({ request, body }) => {
    await assertWebhookSecret(prisma, "TELEGRAM", presentedSecret(request));
    const message = body.message;
    if (message?.text && /^\/(start|id)\b/.test(message.text)) {
      const notifier = await getTelegramNotifier(prisma);
      await notifier.sendMessage(String(message.chat.id), `Kampus ID: ${message.chat.id}`);
    }
    return json({ ok: true });
  },
);
