import { formatDateUz, formatMoneyUz } from "@/lib/dates";
import { recordAudit } from "@/server/audit/audit";
import type { DbClient } from "@/server/db/prisma";
import type { TelegramReplyMarkup } from "@/server/integrations/telegram/notifier";
import { awardAutoCoins, studentBalance } from "@/server/services/coins/coins.service";
import {
  botPaymentLinks,
  enabledPaymentProviders,
} from "@/server/services/payments/online-payments.service";
import { dateToIso, isoToDate } from "@/server/services/settings/shared";
import { membershipBalances } from "@/server/services/students/balances";
import {
  botDate,
  botLocale,
  botText,
  handleStudentCommand,
  wallClock,
  type BotLocale,
} from "@/server/services/telegram/student-telegram.service";

/*
 * Two-way Telegram (A-119). A chat linked to a student can write to the
 * centre's bot: "balance" answers with the money and coins, "pay" sends the
 * Payme / Click links for what is due, "absent today" marks an excused absence
 * on today's lessons with the reason sent. The reply keyboard with the three
 * buttons appears when the chat links and stays under the chat.
 */

export type BotCommandKind = "balance" | "pay" | "absent";

export interface BotReply {
  text: string;
  /** The buttons to show under the message, or the order to take them away. */
  replyMarkup?: TelegramReplyMarkup;
}

const LOCALES: BotLocale[] = ["uz", "ru", "en"];
const CURRENT = ["NEW", "TRIAL", "ACTIVE"] as const;
/** Payme and Click refuse smaller orders (the portal's form has the same floor). */
const MIN_ONLINE_PAYMENT = 1000;

/* Words the bot understands besides its own buttons, in the three languages. */
const KEYWORDS: Record<BotCommandKind, string[]> = {
  balance: ["balance", "balans", "баланс", "qoldiq"],
  pay: ["pay", "payment", "to'lov", "tolov", "to'lash", "оплата", "оплатить", "платить", "платёж"],
  absent: [
    "absent",
    "absent today",
    "bugun darsga kelmaydi",
    "bugun kelmaydi",
    "bugun kelmayman",
    "darsga kelmaydi",
    "kelmaydi",
    "kelmayman",
    "сегодня не придёт",
    "сегодня не придет",
    "не придёт",
    "не придет",
    "не приду",
    "пропуск",
    "пропустит",
    "пропущу",
    "отсутствует",
  ],
};

const MENU_KEYS: Record<BotCommandKind, "menuBalance" | "menuPay" | "menuAbsent"> = {
  balance: "menuBalance",
  pay: "menuPay",
  absent: "menuAbsent",
};

let vocabulary: Array<{ kind: BotCommandKind; word: string }> | null = null;

/** Lower case, straight apostrophes, single spaces, no leading slash. */
function normalise(text: string): string {
  return text
    .replace(/[’‘ʻ`´]/g, "'")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\//, "");
}

/** Every button label and keyword, longest first so "absent today" wins over "absent". */
function words(): Array<{ kind: BotCommandKind; word: string }> {
  if (!vocabulary) {
    const all: Array<{ kind: BotCommandKind; word: string }> = [];
    for (const kind of Object.keys(KEYWORDS) as BotCommandKind[]) {
      for (const locale of LOCALES) {
        all.push({ kind, word: normalise(botText(locale, MENU_KEYS[kind])).toLowerCase() });
      }
      for (const word of KEYWORDS[kind]) all.push({ kind, word: normalise(word).toLowerCase() });
    }
    vocabulary = all.sort((a, b) => b.word.length - a.word.length);
  }
  return vocabulary;
}

/**
 * Reads a chat message as one of the bot's commands. Whatever follows the
 * command word, after a space or a colon, is kept as the reason ("absent
 * today: sick"). Case and the apostrophe variants of Uzbek do not matter.
 */
export function parseBotCommand(text: string): { kind: BotCommandKind; rest: string } | null {
  const raw = normalise(text);
  const lower = raw.toLowerCase();
  for (const { kind, word } of words()) {
    if (lower === word) return { kind, rest: "" };
    if (lower.startsWith(word) && /^[\s:,.!-]/.test(lower.slice(word.length))) {
      return {
        kind,
        rest: raw
          .slice(word.length)
          .replace(/^[\s:,.!-]+/, "")
          .trim(),
      };
    }
  }
  return null;
}

/** The three buttons under the chat, in its language. */
export function botMenu(locale: BotLocale): TelegramReplyMarkup {
  return {
    keyboard: [
      [{ text: botText(locale, "menuBalance") }, { text: botText(locale, "menuPay") }],
      [{ text: botText(locale, "menuAbsent") }],
    ],
    resize_keyboard: true,
    is_persistent: true,
  };
}

/** "October 2026" / "октябрь 2026 г." / "Okt 2026" for the payment month. */
function botMonth(locale: BotLocale, iso: string): string {
  const date = isoToDate(iso);
  if (locale === "uz") return formatDateUz(date, { month: "short", year: "numeric" }, "UTC");
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-GB", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(date);
}

/** The student's memberships the bot speaks about: current ones in groups still open. */
async function currentMemberships(db: DbClient, studentId: string) {
  return db.groupMembership.findMany({
    where: { studentId, status: { in: [...CURRENT] }, group: { status: { not: "ARCHIVED" } } },
    select: {
      id: true,
      studentId: true,
      groupId: true,
      videoToken: true,
      group: { select: { name: true, branchId: true } },
    },
    orderBy: { joinedAt: "asc" },
  });
}

async function balanceReply(db: DbClient, locale: BotLocale, studentId: string): Promise<string> {
  const memberships = await currentMemberships(db, studentId);
  if (memberships.length === 0) return botText(locale, "noGroups");
  const balances = await membershipBalances(
    db,
    memberships.map((m) => m.id),
  );
  const lines = memberships.map((m) => {
    const b = balances.get(m.id);
    const balance = b?.balance ?? 0;
    return balance < 0
      ? botText(locale, "balanceDebtGroup", { group: m.group.name, debt: formatMoneyUz(-balance) })
      : botText(locale, "balanceGroup", {
          group: m.group.name,
          balance: formatMoneyUz(balance),
          next: b?.nextPaymentDate ? botDate(locale, b.nextPaymentDate) : "none",
        });
  });
  lines.push(botText(locale, "balanceCoins", { total: await studentBalance(db, studentId) }));
  return lines.join("\n");
}

async function payReply(
  db: DbClient,
  locale: BotLocale,
  organizationId: string,
  studentId: string,
): Promise<string> {
  const memberships = await currentMemberships(db, studentId);
  if (memberships.length === 0) return botText(locale, "noGroups");
  if ((await enabledPaymentProviders(db, organizationId)).length === 0) {
    return botText(locale, "payOff");
  }
  const balances = await membershipBalances(
    db,
    memberships.map((m) => m.id),
  );
  const lines: string[] = [];
  for (const m of memberships) {
    const b = balances.get(m.id);
    if (!b || b.suggestedAmount < MIN_ONLINE_PAYMENT) continue;
    const amount = Math.round(b.suggestedAmount);
    const links = await botPaymentLinks(
      db,
      organizationId,
      { id: m.id, studentId, branchId: m.group.branchId, videoToken: m.videoToken },
      amount,
      b.suggestedMonth,
    );
    lines.push(
      botText(locale, "payTitle", {
        group: m.group.name,
        amount: formatMoneyUz(amount),
        month: botMonth(locale, b.suggestedMonth),
      }),
    );
    for (const link of links) {
      lines.push(
        botText(locale, "payProvider", {
          provider: link.provider === "PAYME" ? "Payme" : "Click",
          url: link.url,
        }),
      );
    }
  }
  return lines.length > 0 ? lines.join("\n") : botText(locale, "payNothing");
}

async function absentReply(
  db: DbClient,
  locale: BotLocale,
  organizationId: string,
  studentId: string,
  reason: string,
): Promise<string> {
  const memberships = await currentMemberships(db, studentId);
  if (memberships.length === 0) return botText(locale, "noGroups");
  const byGroup = new Map(memberships.map((m) => [m.groupId, m]));
  const today = isoToDate(wallClock(new Date()).date);
  const lessons = await db.lesson.findMany({
    where: { groupId: { in: [...byGroup.keys()] }, date: today },
    select: {
      id: true,
      groupId: true,
      startTime: true,
      attendances: {
        where: { membershipId: { in: memberships.map((m) => m.id) } },
        select: { membershipId: true, status: true },
      },
    },
    orderBy: { startTime: "asc" },
  });
  if (lessons.length === 0) {
    const next = await db.lesson.findFirst({
      where: { groupId: { in: [...byGroup.keys()] }, date: { gt: today } },
      select: { date: true, startTime: true, group: { select: { name: true } } },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    });
    return botText(locale, "absentNoLesson", {
      next: next
        ? `${next.group.name}, ${botDate(locale, dateToIso(next.date))} ${next.startTime}`
        : "none",
    });
  }
  const comment = botText(locale, "absentComment", { reason: reason || "none" });
  const lines: string[] = [];
  await db.$transaction(async (tx) => {
    for (const lesson of lessons) {
      const m = byGroup.get(lesson.groupId)!;
      const values = { group: m.group.name, time: lesson.startTime, reason: reason || "none" };
      const current = lesson.attendances.find((a) => a.membershipId === m.id)?.status;
      if (current === "PRESENT") {
        lines.push(botText(locale, "absentPresent", values));
        continue;
      }
      await tx.attendance.upsert({
        where: { lessonId_membershipId: { lessonId: lesson.id, membershipId: m.id } },
        create: { lessonId: lesson.id, membershipId: m.id, status: "EXCUSED", comment },
        update: { status: "EXCUSED", comment, markedById: null, markedAt: new Date() },
      });
      // The mark is not PRESENT any more, so the automatic attendance coins go (A-79).
      await awardAutoCoins(tx, {
        event: "ATTENDANCE",
        studentId,
        groupId: lesson.groupId,
        refKey: `attendance:${lesson.id}:${m.id}`,
        revoke: true,
      });
      await recordAudit(tx, null, {
        action: "attendance.mark",
        entity: "Lesson",
        entityId: lesson.id,
        after: { marks: [{ membershipId: m.id, status: "EXCUSED", comment }], source: "telegram" },
        branchId: m.group.branchId,
        organizationId,
      });
      lines.push(botText(locale, "absentMarked", values));
    }
  });
  return lines.join("\n");
}

/**
 * Handles one update from the centre's bot: first the link and unlink
 * commands, then, for a chat linked to one of the centre's students, the
 * balance, pay and absent commands in the chat's language. Anything else from
 * a linked chat gets the hint with the buttons; unlinked chats get nothing
 * (the webhook answers `/start` and `/id` with the chat id for staff).
 */
export async function handleBotUpdate(
  db: DbClient,
  /** The centre whose bot received the update; null for the shared bot, which serves every centre (A-135). */
  organizationId: string | null,
  message: {
    chatId: string;
    text: string;
    firstName?: string | null;
    languageCode?: string | null;
  },
): Promise<BotReply | null> {
  const linkReply = await handleStudentCommand(db, organizationId, message);
  const chat = await db.studentTelegramChat.findUnique({
    where: { chatId: message.chatId },
    select: {
      locale: true,
      student: {
        select: { id: true, isArchived: true, branch: { select: { organizationId: true } } },
      },
    },
  });
  const linked =
    chat &&
    !chat.student.isArchived &&
    (organizationId === null || chat.student.branch.organizationId === organizationId)
      ? chat
      : null;
  if (linkReply) {
    return {
      text: linkReply,
      replyMarkup: linked ? botMenu(botLocale(linked.locale)) : { remove_keyboard: true },
    };
  }
  if (!linked || /^\/(start|id)\b/.test(message.text)) return null;
  const locale = botLocale(linked.locale);
  const command = parseBotCommand(message.text);
  const studentId = linked.student.id;
  // Through the shared bot, the answer is about the student's own centre.
  const centreId = organizationId ?? linked.student.branch.organizationId;
  let text: string;
  if (!command) text = botText(locale, "menuHint");
  else if (command.kind === "balance") text = await balanceReply(db, locale, studentId);
  else if (command.kind === "pay") text = await payReply(db, locale, centreId, studentId);
  else text = await absentReply(db, locale, centreId, studentId, command.rest);
  return { text, replyMarkup: botMenu(locale) };
}
