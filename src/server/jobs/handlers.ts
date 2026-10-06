import type { DbClient } from "@/server/db/prisma";
import {
  getAmoCrmClient,
  getTelegramNotifier,
  saveAmoCrmTokens,
} from "@/server/services/integrations/integrations.service";
import { runDailyNotifications } from "@/server/services/dashboard/notifications.service";
import { runDailyAutoSms } from "@/server/services/sms/auto-sms.service";
import {
  reminderSlotKey,
  runLessonReminders,
} from "@/server/services/telegram/student-telegram.service";
import { deliverMessage } from "@/server/services/sms/sms.service";
import { dateToIso } from "@/server/services/settings/shared";

import { enqueue, hasJobHandler, registerJobHandler } from "./queue";

/* The job types the worker knows (A-21). Importing this module registers them. */

export const JOB_TYPES = [
  "sms.send",
  "telegram.send",
  "auto-sms.daily",
  "telegram.reminders",
  "amocrm.pushLead",
] as const;

function payloadOf<T>(payload: unknown): T {
  return (payload ?? {}) as T;
}

export function registerJobHandlers(): void {
  if (hasJobHandler("sms.send")) return;

  registerJobHandler("sms.send", async (payload, db) => {
    const { messageId } = payloadOf<{ messageId: string }>(payload);
    const status = await deliverMessage(db, messageId);
    if (status === "FAILED") throw new Error(`sms ${messageId} failed`);
  });

  registerJobHandler("telegram.send", async (payload, db) => {
    const { chatId, text } = payloadOf<{ chatId: string; text: string }>(payload);
    const notifier = await getTelegramNotifier(db);
    await notifier.sendMessage(chatId, text);
  });

  registerJobHandler("auto-sms.daily", async (payload, db) => {
    const { date } = payloadOf<{ date?: string }>(payload);
    await runDailyAutoSms(db, date);
    await runDailyNotifications(db, date ?? new Date().toISOString().slice(0, 10));
  });

  registerJobHandler("telegram.reminders", async (_payload, db) => {
    await runLessonReminders(db);
  });

  registerJobHandler("amocrm.pushLead", async (payload, db) => {
    const lead = payloadOf<{ name: string; phone: string | null; source: string | null }>(payload);
    const client = await getAmoCrmClient(db);
    await client.pushLead(lead);
    if (client.tokens()) await saveAmoCrmTokens(db, client.tokens());
  });
}

/** Makes sure today's daily scan is queued once; the worker and the run endpoint call it. */
export async function ensureDailyJob(
  db: DbClient,
  todayIso = dateToIso(new Date()),
): Promise<void> {
  await enqueue(db, {
    type: "auto-sms.daily",
    payload: { date: todayIso },
    uniqueKey: `daily:${todayIso}`,
  });
  // Lesson reminders for students on Telegram: one scan per five-minute slot (A-103).
  await enqueue(db, { type: "telegram.reminders", payload: {}, uniqueKey: reminderSlotKey() });
}
