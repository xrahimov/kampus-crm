import type { DbClient } from "@/server/db/prisma";
import { isAppError } from "@/server/errors/app-error";
import { appOriginFor, serverOrigin } from "@/server/services/settings/domains.service";
import {
  accountForIdentity,
  issueLoginTicket,
} from "@/server/services/student-auth/student-auth.service";
import { botLocale, botText } from "@/server/services/telegram/student-telegram.service";
import type { BotReply } from "@/server/services/telegram/bot-commands.service";

/*
 * Sign-in from inside Telegram (A-150). `/start login` (the login page's "Open
 * the bot" link) or `/login` asks the person to share their number with the
 * contact button; Telegram then sends the contact, and when it is the sender's
 * own (contact.user_id equals the sender), the number is Telegram's verified
 * one. A match with a student or parent answers with a one-time sign-in link.
 */

export interface BotLoginMessage {
  chatId: string;
  text?: string | null;
  /** Telegram's user id of the sender (message.from.id). */
  fromId?: string | null;
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
  languageCode?: string | null;
  contact?: { phoneNumber: string; userId?: string | null } | null;
}

/** Whether this message asks to sign in. */
export function isLoginRequest(text: string | null | undefined): boolean {
  return Boolean(text && /^\/(start\s+login|login)\s*$/i.test(text.trim()));
}

export async function handleBotLogin(
  db: DbClient,
  /** The centre whose bot received it; null for the shared bot, which serves every centre. */
  organizationId: string | null,
  message: BotLoginMessage,
): Promise<BotReply | null> {
  const locale = botLocale(message.languageCode);
  if (isLoginRequest(message.text)) {
    return {
      text: botText(locale, "loginShare"),
      replyMarkup: {
        keyboard: [[{ text: botText(locale, "loginShareButton"), request_contact: true }]],
        resize_keyboard: true,
        one_time_keyboard: true,
      },
    };
  }
  if (!message.contact) return null;
  if (!message.fromId || message.contact.userId !== message.fromId) {
    return { text: botText(locale, "loginNotYours"), replyMarkup: { remove_keyboard: true } };
  }
  const name = [message.firstName, message.lastName].filter(Boolean).join(" ").trim() || "Telegram";
  let accountId: string;
  try {
    const account = await db.$transaction((tx) =>
      accountForIdentity(
        tx,
        {
          telegramUserId: message.fromId!,
          name,
          username: message.username ?? null,
          photoUrl: null,
          phone: message.contact!.phoneNumber.replace(/\D/g, ""),
        },
        organizationId,
      ),
    );
    accountId = account.id;
  } catch (error) {
    if (isAppError(error) && error.status === 403) {
      const key =
        error.message === "errors.studentLinkedElsewhere" ? "loginLinkedElsewhere" : "loginUnknown";
      return { text: botText(locale, key), replyMarkup: { remove_keyboard: true } };
    }
    throw error;
  }
  await linkChatForNotices(db, accountId, message.chatId, message.firstName ?? null, locale);
  const ticket = await issueLoginTicket(db, accountId);
  const origin = organizationId ? await appOriginFor(organizationId, db) : serverOrigin();
  const url = `${origin.replace(/\/$/, "")}/api/v1/student-auth/enter/${ticket}?locale=${locale}`;
  return { text: botText(locale, "loginLink", { url }), replyMarkup: { remove_keyboard: true } };
}

/**
 * The person signed in through the bot, so this chat hears about their lessons
 * too (A-103), unless it already listens for someone.
 */
async function linkChatForNotices(
  db: DbClient,
  accountId: string,
  chatId: string,
  name: string | null,
  locale: string,
): Promise<void> {
  const taken = await db.studentTelegramChat.findUnique({ where: { chatId } });
  if (taken) return;
  const link = await db.studentAccountLink.findFirst({
    where: { accountId, OR: [{ studentId: { not: null } }, { parentId: { not: null } }] },
    orderBy: { createdAt: "asc" },
    select: { studentId: true, parent: { select: { studentId: true } } },
  });
  const studentId = link?.studentId ?? link?.parent?.studentId ?? null;
  if (!studentId) return;
  await db.studentTelegramChat.create({ data: { studentId, chatId, name, locale } });
}
