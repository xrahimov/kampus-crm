import type { SignInDoor } from "@/generated/prisma/client";
import type { DbClient } from "@/server/db/prisma";
import { getTelegramNotifier } from "@/server/services/integrations/integrations.service";
import { appOriginFor } from "@/server/services/settings/domains.service";
import { botLocale, botText } from "@/server/services/telegram/student-telegram.service";

/*
 * Closing the waiting list's requests (A-196). Kept apart from the list itself
 * so the student and staff services can call it after a save without a circle
 * of imports.
 */

/** Whether a phone belongs to someone this centre has: staff, a student or a parent. */
export async function phoneKnownIn(
  db: DbClient,
  phone: string,
  organizationId: string,
): Promise<boolean> {
  const [staff, student, parent] = await Promise.all([
    db.user.count({ where: { phone, organizationId, isArchived: false } }),
    db.student.count({
      where: { phone, isArchived: false, isBlacklisted: false, branch: { organizationId } },
    }),
    db.parent.count({
      where: { phone, student: { isArchived: false, branch: { organizationId } } },
    }),
  ]);
  return staff + student + parent > 0;
}

/** Tells the waiting person, in their chat with the bot, what the centre decided. */
export async function tellJoinPerson(
  db: DbClient,
  row: {
    chatId: string | null;
    botOrganizationId: string | null;
    organizationId: string | null;
    door: SignInDoor;
    locale: string;
  },
  kind: "joinApproved" | "joinDeclined",
): Promise<void> {
  if (!row.chatId || !row.botOrganizationId || !row.organizationId) return;
  try {
    const locale = botLocale(row.locale);
    const [origin, centre] = await Promise.all([
      appOriginFor(row.organizationId, db),
      db.organization.findUnique({ where: { id: row.organizationId }, select: { name: true } }),
    ]);
    const url = `${origin}/${locale}${row.door === "STUDENT" ? "/student/login" : "/login"}`;
    const notifier = await getTelegramNotifier(db, row.botOrganizationId);
    await notifier.sendMessage(
      row.chatId,
      botText(locale, kind, { centre: centre?.name ?? "Kampus", url }),
    );
  } catch (error) {
    // The decision stands whether or not Telegram delivered the news.
    console.error("join request notice not sent", error);
  }
}

/**
 * Closes the waiting requests of a phone that has come to exist in its centre,
 * and tells the person. Called wherever a phone is added or changed; safe to
 * call for any phone. `quiet` skips the message (the person is signing in now).
 */
export async function settleJoinRequests(
  db: DbClient,
  phone: string | null | undefined,
  options: { decidedById?: string | null; quiet?: boolean } = {},
): Promise<number> {
  if (!phone) return 0;
  const waiting = await db.joinRequest.findMany({
    where: { phone, organizationId: { not: null }, status: { in: ["PENDING", "DECLINED"] } },
  });
  let settled = 0;
  for (const row of waiting) {
    if (!(await phoneKnownIn(db, phone, row.organizationId!))) continue;
    const done = await db.joinRequest.updateMany({
      where: { id: row.id, status: row.status },
      data: {
        status: "APPROVED",
        decidedAt: new Date(),
        decidedById: options.decidedById ?? null,
      },
    });
    if (done.count !== 1) continue;
    settled += 1;
    if (!options.quiet) await tellJoinPerson(db, row, "joinApproved");
  }
  return settled;
}

/** The same, for callers that must not fail because of it (after a student or staff save). */
export async function settleJoinRequestsQuietly(
  db: DbClient,
  phone: string | null | undefined,
  decidedById?: string | null,
): Promise<void> {
  try {
    await settleJoinRequests(db, phone, { decidedById });
  } catch (error) {
    console.error("join requests not settled", error);
  }
}
