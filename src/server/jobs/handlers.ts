import type { DbClient } from "@/server/db/prisma";
import {
  getAmoCrmClient,
  getTelegramNotifier,
  saveAmoCrmTokens,
} from "@/server/services/integrations/integrations.service";
import {
  importAmoCrmLead,
  type AmoCrmImportPayload,
} from "@/server/services/leads/amocrm-inbound.service";
import { runDailyNotifications } from "@/server/services/dashboard/notifications.service";
import { runDailyDebtCollection } from "@/server/services/debts/debts.service";
import { purgeOldRecordings } from "@/server/services/materials/materials.service";
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
  "amocrm.importLead",
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

  // Each centre has its own bot (A-108): the payload names whose it is.
  registerJobHandler("telegram.send", async (payload, db) => {
    const { organizationId, chatId, text } = payloadOf<{
      organizationId?: string;
      chatId: string;
      text: string;
    }>(payload);
    if (!organizationId) throw new Error("telegram.send without organizationId");
    const notifier = await getTelegramNotifier(db, organizationId);
    await notifier.sendMessage(chatId, text);
  });

  registerJobHandler("auto-sms.daily", async (payload, db) => {
    const { date } = payloadOf<{ date?: string }>(payload);
    await runDailyAutoSms(db, date);
    const day = date ?? new Date().toISOString().slice(0, 10);
    await runDailyNotifications(db, day);
    // Debt collection (A-112): reconcile the cases, then Telegram → SMS → manager task.
    await runDailyDebtCollection(db, day);
    // Old lesson recordings go once a day too (Settings → Integrations → Video lessons).
    const purged = await purgeOldRecordings(db);
    if (purged > 0) console.log(`[worker] deleted ${purged} old lesson recording(s)`);
  });

  registerJobHandler("telegram.reminders", async (_payload, db) => {
    await runLessonReminders(db);
  });

  registerJobHandler("amocrm.pushLead", async (payload, db) => {
    const { organizationId, leadId, ...lead } = payloadOf<{
      organizationId?: string;
      leadId?: string;
      name: string;
      phone: string | null;
      source: string | null;
    }>(payload);
    if (!organizationId) throw new Error("amocrm.pushLead without organizationId");
    const client = await getAmoCrmClient(db, organizationId);
    const { externalId } = await client.pushLead(lead);
    if (client.tokens()) await saveAmoCrmTokens(db, organizationId, client.tokens());
    // Remember the deal, so amoCRM's webhook for it is not imported as a new lead (A-115).
    if (leadId && externalId) {
      await db.lead.updateMany({
        where: { id: leadId, amoCrmLeadId: null },
        data: { amoCrmLeadId: externalId },
      });
    }
  });

  registerJobHandler("amocrm.importLead", async (payload, db) => {
    await importAmoCrmLead(db, payloadOf<AmoCrmImportPayload>(payload));
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
