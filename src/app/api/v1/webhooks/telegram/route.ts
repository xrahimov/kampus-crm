import { z } from "zod";

import { prisma } from "@/server/db/prisma";
import { json, route } from "@/server/http/handler";
import {
  assertWebhookSecret,
  getTelegramNotifier,
} from "@/server/services/integrations/integrations.service";

import { handleStudentCommand } from "@/server/services/telegram/student-telegram.service";

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
 * Telegram update webhook. `/start <code>` and `/stop` come from students and
 * parents linking their chat from the portal (A-103); a bare `/start` or `/id`
 * is answered with the chat id, the "Mahsus ID" a manager types into Bot
 * xabarnoma (A-85).
 */
export const POST = route<z.output<typeof update>>(
  { auth: false, body: update, skipCsrf: true },
  async ({ request, body }) => {
    await assertWebhookSecret(prisma, "TELEGRAM", presentedSecret(request));
    const message = body.message;
    if (!message?.text) return json({ ok: true });
    const chatId = String(message.chat.id);
    const reply = await handleStudentCommand(prisma, {
      chatId,
      text: message.text,
      firstName: message.from?.first_name ?? null,
      languageCode: message.from?.language_code ?? null,
    });
    if (reply) {
      await (await getTelegramNotifier(prisma)).sendMessage(chatId, reply);
    } else if (/^\/(start|id)\b/.test(message.text)) {
      await (await getTelegramNotifier(prisma)).sendMessage(chatId, `Kampus ID: ${chatId}`);
    }
    return json({ ok: true });
  },
);
