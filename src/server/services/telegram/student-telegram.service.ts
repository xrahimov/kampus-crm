import { createTranslator } from "use-intl/core";

import en from "../../../../messages/en.json";
import ru from "../../../../messages/ru.json";
import uz from "../../../../messages/uz.json";

import { APP_TIME_ZONE, formatDateUz } from "@/lib/dates";
import { generateToken } from "@/server/auth/tokens";
import { prisma, type DbClient } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";
import { enqueue } from "@/server/jobs/queue";
import { telegramConfigFor } from "@/server/services/integrations/integrations.service";
import { appOriginForGroup } from "@/server/services/settings/domains.service";
import { isoToDate, organizationOfBranch } from "@/server/services/settings/shared";
import { classLink, membershipByToken } from "@/server/services/video/video.service";

/*
 * Telegram for students and parents (A-103). The staff bot (Settings →
 * Integrations → Telegram) also serves students: the portal offers a
 * t.me/<bot>?start=<code> link, the webhook turns the code into a linked chat,
 * and from then on the chat hears about the student's lessons, homework and
 * payments. Several chats may link to one student (the student and a parent).
 * Messages go through the same `telegram.send` job as staff notifications.
 */

const LOCALES = ["uz", "ru", "en"] as const;
export type BotLocale = (typeof LOCALES)[number];
const MESSAGES: Record<BotLocale, { telegramBot: Record<string, string> }> = { uz, ru, en };

/** Reminders go out this long before a lesson starts. */
export const LESSON_REMINDER_MINUTES = 30;
/** The reminder scan runs on this grid; a lesson is caught by exactly one run. */
const REMINDER_SLOT_MINUTES = 5;

export interface PortalTelegramDto {
  /** null when the bot has no username yet (nothing to link to). */
  link: string | null;
  chats: Array<{ chatId: string; name: string | null; linkedAt: string }>;
}

export type BotMessageKind =
  | "linked"
  | "unlinked"
  | "unknownCode"
  | "lessonSoon"
  | "lessonStarted"
  | "homeworkSet"
  | "homeworkChanged"
  | "homeworkAccepted"
  | "homeworkReturned"
  | "materialAdded"
  | "paymentReceived"
  | "debtor"
  | "instalment"
  | "signInCode"
  | "signInAlert"
  | "absenceWeeklyTitle"
  | "absenceWeeklyLine"
  | "absenceWeeklyMore"
  | "leadCallsTitle"
  | "leadCallsLine"
  | "leadCallsMore"
  | "lessonCancelled"
  | "lessonMoved"
  | "lessonRestored"
  | "weeklyTitle"
  | "weeklyGroup"
  | "weeklyNoLessons"
  | "weeklyCoins"
  | "weeklyBalance"
  | "weeklyDebt"
  | "menuBalance"
  | "menuPay"
  | "menuAbsent"
  | "menuHint"
  | "balanceGroup"
  | "balanceDebtGroup"
  | "balanceCoins"
  | "noGroups"
  | "payTitle"
  | "payProvider"
  | "payOff"
  | "payNothing"
  | "absentMarked"
  | "absentPresent"
  | "absentNoLesson"
  | "absentComment"
  | "announcement";

/** Narrows Telegram's language_code to a language the bot speaks. */
export function botLocale(languageCode: string | undefined | null): BotLocale {
  const code = (languageCode ?? "").slice(0, 2).toLowerCase();
  return (LOCALES as readonly string[]).includes(code) ? (code as BotLocale) : "uz";
}

/** The bot's text for one event in one language. */
export function botText(
  locale: BotLocale,
  kind: BotMessageKind,
  values: Record<string, string | number> = {},
): string {
  const t = createTranslator({ locale, messages: MESSAGES[locale], namespace: "telegramBot" });
  return t(kind, values);
}

/** "6-okt" / "6 окт." / "Oct 6" for the bot's texts. */
export function botDate(locale: BotLocale, iso: string): string {
  const date = isoToDate(iso);
  if (locale === "uz") return formatDateUz(date, { day: "numeric", month: "short" }, "UTC");
  return new Intl.DateTimeFormat(locale === "ru" ? "ru-RU" : "en-GB", {
    day: "numeric",
    month: "short",
    timeZone: "UTC",
  }).format(date);
}

async function botUsername(db: DbClient, organizationId: string): Promise<string | null> {
  // The centre's own bot, or the server's shared one (A-135).
  const effective = await telegramConfigFor(db, organizationId);
  return effective?.config.botUsername || null;
}

/* ----- the portal's side ---------------------------------------------------------------- */

/** What the student's page shows: the connect link and the chats already linked. */
export async function getPortalTelegram(
  token: string,
  db: DbClient = prisma,
): Promise<PortalTelegramDto | null> {
  const membership = await membershipByToken(db, token);
  if (!membership) return null;
  // The centre's own bot (A-108), found through the group's branch.
  const username = await botUsername(db, await organizationOfBranch(db, membership.group.branchId));
  let student = await db.student.findUniqueOrThrow({
    where: { id: membership.studentId },
    select: { telegramCode: true, telegramChats: { orderBy: { linkedAt: "asc" } } },
  });
  if (username && !student.telegramCode) {
    student = await db.student.update({
      where: { id: membership.studentId },
      data: { telegramCode: generateToken(12) },
      select: { telegramCode: true, telegramChats: { orderBy: { linkedAt: "asc" } } },
    });
  }
  return {
    link:
      username && student.telegramCode
        ? `https://t.me/${username}?start=${student.telegramCode}`
        : null,
    chats: student.telegramChats.map((c) => ({
      chatId: c.chatId,
      name: c.name,
      linkedAt: c.linkedAt.toISOString(),
    })),
  };
}

/** The student removes a linked chat from their page. */
export async function unlinkPortalChat(
  token: string,
  chatId: string,
  db: DbClient = prisma,
): Promise<void> {
  const membership = await membershipByToken(db, token);
  if (!membership) throw AppError.notFound();
  await db.studentTelegramChat.deleteMany({ where: { studentId: membership.studentId, chatId } });
}

/* ----- the bot's side ------------------------------------------------------------------- */

/**
 * Handles one Telegram update for a student or parent: `/start <code>` links
 * the chat, `/stop` unlinks it. Returns the reply to send, or null when the
 * update is none of the bot's business (the staff `/id` path handles the rest).
 * `organizationId` is the centre whose bot received the update (A-108): only
 * its students can be linked through it.
 */
export async function handleStudentCommand(
  db: DbClient,
  /** The centre whose bot received the update; null for the shared bot, which serves every centre (A-135). */
  organizationId: string | null,
  message: {
    chatId: string;
    text: string;
    firstName?: string | null;
    languageCode?: string | null;
  },
): Promise<string | null> {
  const locale = botLocale(message.languageCode);
  const start = message.text.match(/^\/start\s+([A-Za-z0-9_-]{8,64})\s*$/);
  if (start) {
    const student = await db.student.findFirst({
      where: {
        telegramCode: start[1]!,
        ...(organizationId ? { branch: { organizationId } } : {}),
      },
      select: { id: true, fullName: true, isArchived: true },
    });
    if (!student || student.isArchived) return botText(locale, "unknownCode");
    await db.studentTelegramChat.upsert({
      where: { chatId: message.chatId },
      create: {
        studentId: student.id,
        chatId: message.chatId,
        name: message.firstName ?? null,
        locale,
      },
      update: { studentId: student.id, name: message.firstName ?? null, locale },
    });
    return botText(locale, "linked", { student: student.fullName });
  }
  if (/^\/stop\b/.test(message.text)) {
    const gone = await db.studentTelegramChat.deleteMany({
      where: {
        chatId: message.chatId,
        ...(organizationId ? { student: { branch: { organizationId } } } : {}),
      },
    });
    return gone.count > 0 ? botText(locale, "unlinked") : null;
  }
  return null;
}

/* ----- sending ---------------------------------------------------------------------------- */

/**
 * Queues one message to every chat linked to the given students, in each
 * chat's language, through the bot of the student's own centre (A-108).
 * `refKey` makes a notification idempotent per chat. Call it inside the
 * transaction of the event it reports. A composed message (several lines of
 * bot texts) comes through `text` instead of `kind` + `values`.
 */
export async function notifyStudents(
  tx: DbClient,
  input: {
    studentIds: string[];
    kind: BotMessageKind;
    refKey: string;
    values?:
      Record<string, string | number> | ((locale: BotLocale) => Record<string, string | number>);
    text?: (locale: BotLocale) => string;
  },
): Promise<number> {
  if (input.studentIds.length === 0) return 0;
  const chats = await tx.studentTelegramChat.findMany({
    where: { studentId: { in: input.studentIds }, student: { isArchived: false } },
    include: { student: { select: { branch: { select: { organizationId: true } } } } },
  });
  let queued = 0;
  for (const chat of chats) {
    const locale = botLocale(chat.locale);
    const values = typeof input.values === "function" ? input.values(locale) : input.values;
    const id = await enqueue(tx, {
      type: "telegram.send",
      payload: {
        organizationId: chat.student.branch.organizationId,
        chatId: chat.chatId,
        text: input.text ? input.text(locale) : botText(locale, input.kind, values),
      },
      uniqueKey: `tg:${input.refKey}:${chat.chatId}`,
    });
    if (id) queued += 1;
  }
  return queued;
}

/** Students of a group who may still attend (same set the video links use). */
async function currentStudentIds(db: DbClient, groupId: string): Promise<string[]> {
  const rows = await db.groupMembership.findMany({
    where: { groupId, status: { in: ["NEW", "TRIAL", "ACTIVE"] } },
    select: { studentId: true },
  });
  return rows.map((r) => r.studentId);
}

/** "Your teacher started the lesson, join here": sent when a group's call opens. */
export async function notifyLessonStarted(
  tx: DbClient,
  input: { groupId: string; groupName: string; roomId: string },
): Promise<number> {
  const memberships = await tx.groupMembership.findMany({
    where: { groupId: input.groupId, status: { in: ["NEW", "TRIAL", "ACTIVE"] } },
    select: { studentId: true, videoToken: true },
  });
  const origin = await appOriginForGroup(input.groupId, tx);
  let queued = 0;
  for (const m of memberships) {
    if (!m.videoToken) continue;
    queued += await notifyStudents(tx, {
      studentIds: [m.studentId],
      kind: "lessonStarted",
      refKey: `lesson-started:${input.roomId}`,
      values: { group: input.groupName, link: classLink(origin, m.videoToken) },
    });
  }
  return queued;
}

/** A new file, link or recording for the group (A-105), with each student's own page link. */
export async function notifyMaterial(
  tx: DbClient,
  input: { materialId: string; groupId: string; groupName: string; kind: string; title: string },
): Promise<number> {
  const memberships = await tx.groupMembership.findMany({
    where: { groupId: input.groupId, status: { in: ["NEW", "TRIAL", "ACTIVE"] } },
    select: { studentId: true, videoToken: true },
  });
  const origin = await appOriginForGroup(input.groupId, tx);
  let queued = 0;
  for (const m of memberships) {
    if (!m.videoToken) continue;
    queued += await notifyStudents(tx, {
      studentIds: [m.studentId],
      kind: "materialAdded",
      refKey: `material:${input.materialId}`,
      values: {
        group: input.groupName,
        kind: input.kind,
        title: input.title,
        link: classLink(origin, m.videoToken),
      },
    });
  }
  return queued;
}

/** Homework set, changed or reviewed. */
export async function notifyHomework(
  tx: DbClient,
  input:
    | {
        kind: "homeworkSet" | "homeworkChanged";
        homeworkId: string;
        groupId: string;
        groupName: string;
        lessonDate: string;
        text: string;
        stamp: string;
      }
    | {
        kind: "homeworkAccepted" | "homeworkReturned";
        homeworkId: string;
        studentId: string;
        groupName: string;
        lessonDate: string;
        comment: string | null;
        stamp: string;
      },
): Promise<number> {
  const studentIds =
    "studentId" in input ? [input.studentId] : await currentStudentIds(tx, input.groupId);
  return notifyStudents(tx, {
    studentIds,
    kind: input.kind,
    refKey: `${input.kind}:${input.homeworkId}:${input.stamp}`,
    values: (locale) => ({
      group: input.groupName,
      date: botDate(locale, input.lessonDate),
      text: "text" in input ? input.text.slice(0, 500) : "",
      comment: "comment" in input && input.comment ? `\n${input.comment}` : "",
    }),
  });
}

/* ----- lesson reminders ------------------------------------------------------------------- */

/** "HH:mm" and "YYYY-MM-DD" as the wall clock in Tashkent reads them. */
export function wallClock(at: Date, timeZone = APP_TIME_ZONE): { date: string; minutes: number } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(at);
  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? "00";
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    minutes: (Number(get("hour")) % 24) * 60 + Number(get("minute")),
  };
}

const toMinutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/**
 * The reminder scan (job `telegram.reminders`, every few minutes): lessons that
 * start in about LESSON_REMINDER_MINUTES get one message per linked chat. Each
 * run covers one REMINDER_SLOT_MINUTES window, so a lesson is caught once; the
 * ref key guards the rest.
 */
export async function runLessonReminders(
  db: DbClient,
  now: Date = new Date(),
): Promise<{ queued: number }> {
  const clock = wallClock(now);
  const slotStart = Math.floor(clock.minutes / REMINDER_SLOT_MINUTES) * REMINDER_SLOT_MINUTES;
  const from = slotStart + LESSON_REMINDER_MINUTES;
  const to = from + REMINDER_SLOT_MINUTES;
  const lessons = await db.lesson.findMany({
    where: { date: isoToDate(clock.date), group: { status: "ACTIVE" } },
    select: {
      id: true,
      startTime: true,
      endTime: true,
      groupId: true,
      group: { select: { name: true } },
    },
  });
  let queued = 0;
  for (const lesson of lessons) {
    const start = toMinutes(lesson.startTime);
    if (start < from || start >= to) continue;
    const memberships = await db.groupMembership.findMany({
      where: { groupId: lesson.groupId, status: { in: ["NEW", "TRIAL", "ACTIVE"] } },
      select: { studentId: true, videoToken: true },
    });
    const origin = await appOriginForGroup(lesson.groupId, db);
    for (const m of memberships) {
      queued += await db.$transaction((tx) =>
        notifyStudents(tx, {
          studentIds: [m.studentId],
          kind: "lessonSoon",
          refKey: `lesson-soon:${lesson.id}`,
          values: {
            group: lesson.group.name,
            start: lesson.startTime,
            end: lesson.endTime,
            link: m.videoToken ? classLink(origin, m.videoToken) : "",
          },
        }),
      );
    }
  }
  return { queued };
}

/** The slot key the worker uses so one reminder scan runs per window. */
export function reminderSlotKey(now: Date = new Date()): string {
  const clock = wallClock(now);
  const slot = Math.floor(clock.minutes / REMINDER_SLOT_MINUTES) * REMINDER_SLOT_MINUTES;
  return `tg-reminders:${clock.date}:${String(slot).padStart(4, "0")}`;
}
