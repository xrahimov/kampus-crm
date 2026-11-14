import type { DbClient } from "@/server/db/prisma";
import { botDate, notifyStudents } from "@/server/services/telegram/student-telegram.service";

import { shortWeekday, type SlotLike } from "./schedule";

/**
 * Tells a group's current students, and the parents on their chats, that the
 * lesson days or times changed (A-193): one Telegram message per linked chat
 * and a browser notification, in the chat's language. Idempotent on `refKey`.
 */
export async function notifyScheduleChange(
  tx: DbClient,
  input: { groupId: string; groupName: string; slots: SlotLike[]; from: string; refKey: string },
): Promise<number> {
  const members = await tx.groupMembership.findMany({
    where: { groupId: input.groupId, status: { in: ["NEW", "TRIAL", "ACTIVE"] } },
    select: { studentId: true },
  });
  const days = [...input.slots].sort((a, b) => a.weekday - b.weekday);
  return notifyStudents(tx, {
    studentIds: [...new Set(members.map((m) => m.studentId))],
    kind: "scheduleChanged",
    refKey: input.refKey,
    values: (locale) => ({
      group: input.groupName,
      date: botDate(locale, input.from),
      // Every day is named, also when all of them meet at the same time.
      times: days
        .map((s) => `${shortWeekday(locale, s.weekday)} ${s.startTime}–${s.endTime}`)
        .join(", "),
    }),
  });
}
