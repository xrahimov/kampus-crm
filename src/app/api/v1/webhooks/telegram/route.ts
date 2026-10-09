import { z } from "zod";

import { prisma } from "@/server/db/prisma";
import { json, route } from "@/server/http/handler";
import {
  assertWebhookSecret,
  getTelegramNotifier,
} from "@/server/services/integrations/integrations.service";

import { handleBotUpdate } from "@/server/services/telegram/bot-commands.service";

import { presentedSecret } from "../_secret";

const update = z.object({
  message: z
    .object({
      chat: z.object({ id: z.union([z.number(), z.string()]) }),
      from: z
        .object({ first_name: z.string().optional(), language_code: z.string().optional() })
        .optional(),
      text: z.string().optional(),
    })
    .optional(),
});

/**
 * Telegram update webhook. Every centre has its own bot and its own secret, so
 * the secret says whose bot is calling (A-108). `/start <code>` and `/stop` come
 * from students and parents linking their chat from the portal (A-103), and a
 * linked chat may ask for its balance, a payment link or report an absence
 * (A-119); a bare `/start` or `/id` is answered with the chat id, the "Mahsus
 * ID" a manager types into Bot xabarnoma (A-85).
 */
export const POST = route<z.output<typeof update>>(
  { auth: false, body: update, skipCsrf: true },
  async ({ request, body }) => {
    const organizationId = await assertWebhookSecret(prisma, "TELEGRAM", presentedSecret(request));
    const message = body.message;
    if (!message?.text) return json({ ok: true });
    const chatId = String(message.chat.id);
    const reply = await handleBotUpdate(prisma, organizationId, {
      chatId,
      text: message.text,
      firstName: message.from?.first_name ?? null,
      languageCode: message.from?.language_code ?? null,
    });
    if (reply) {
      const notifier = await getTelegramNotifier(prisma, organizationId);
      await notifier.sendMessage(chatId, reply.text, { replyMarkup: reply.replyMarkup });
    } else if (/^\/(start|id)\b/.test(message.text)) {
      const notifier = await getTelegramNotifier(prisma, organizationId);
      await notifier.sendMessage(chatId, `Kampus ID: ${chatId}`);
    }
    return json({ ok: true });
  },
);
