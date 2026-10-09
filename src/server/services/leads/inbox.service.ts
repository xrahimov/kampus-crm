import type { LeadChannel, Prisma } from "@/generated/prisma/client";
import type { Actor } from "@/server/rbac/authorize";
import type { InboxCloseInput, InboxFilters, InboxReplyInput } from "@/lib/validation/leads";
import { recordAudit } from "@/server/audit/audit";
import { prisma, type DbClient } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";
import { authorize, branchScope } from "@/server/rbac/authorize";
import { notifyUsers } from "@/server/services/dashboard/notifications.service";
import {
  getInstagramProvider,
  getTelegramNotifier,
  instagramConfigFor,
  telegramConfigFor,
} from "@/server/services/integrations/integrations.service";
import { normalizePhone } from "@/server/services/leads/amocrm-inbound.service";
import { defaultColumnForBranch } from "@/server/services/leads/shared";
import { mustFind } from "@/server/services/settings/shared";
import {
  botLocale,
  botText,
  type BotLocale,
} from "@/server/services/telegram/student-telegram.service";

/*
 * The lead inbox (round 2 item E5, A-146). A prospective student who writes to
 * the centre's Telegram bot (a chat not linked to any student) becomes a lead
 * at their first message; the chat lands in Leads → Inbox, where managers read
 * and answer from Kampus, and every later message of theirs is appended. The
 * same tables carry Instagram direct messages delivered by Meta's webhook (E6,
 * A-148); the channel decides which provider carries the answer.
 */

export interface InboundChatMessage {
  chatId: string;
  text: string;
  firstName?: string | null;
  lastName?: string | null;
  username?: string | null;
  languageCode?: string | null;
  externalId?: string | null;
}

export interface ConversationDto {
  id: string;
  channel: LeadChannel;
  displayName: string;
  username: string | null;
  locale: string;
  unreadCount: number;
  isClosed: boolean;
  lastMessageAt: string;
  lastMessage: { direction: "IN" | "OUT"; text: string } | null;
  lead: {
    id: string;
    fullName: string;
    boardId: string;
    branchId: string;
    columnName: string;
    phones: string[];
    isArchived: boolean;
  } | null;
}

export interface ConversationMessageDto {
  id: string;
  direction: "IN" | "OUT";
  text: string;
  sentByName: string | null;
  createdAt: string;
}

export interface ConversationDetailDto {
  conversation: ConversationDto;
  messages: ConversationMessageDto[];
}

/** The `?start=` payload the public page puts on the bot link: `lead-<organisation id>`. */
export const LEAD_START_PREFIX = "lead-";
const START_WITH_CODE = /^\/start\s+lead-([A-Za-z0-9_-]{8,64})\s*$/;

const include = {
  lead: {
    select: {
      id: true,
      fullName: true,
      boardId: true,
      branchId: true,
      isArchived: true,
      column: { select: { name: true } },
      phones: { select: { phone: true }, orderBy: { sortOrder: "asc" } },
    },
  },
  messages: { orderBy: { createdAt: "desc" }, take: 1, select: { direction: true, text: true } },
} satisfies Prisma.LeadConversationInclude;
type Row = Prisma.LeadConversationGetPayload<{ include: typeof include }>;

function toDto(row: Row): ConversationDto {
  const last = row.messages[0] ?? null;
  return {
    id: row.id,
    channel: row.channel,
    displayName: row.displayName || row.username || row.externalChatId,
    username: row.username,
    locale: row.locale,
    unreadCount: row.unreadCount,
    isClosed: row.isClosed,
    lastMessageAt: row.lastMessageAt.toISOString(),
    lastMessage: last ? { direction: last.direction, text: last.text } : null,
    lead: row.lead
      ? {
          id: row.lead.id,
          fullName: row.lead.fullName,
          boardId: row.lead.boardId,
          branchId: row.lead.branchId,
          columnName: row.lead.column.name,
          phones: row.lead.phones.map((p) => p.phone),
          isArchived: row.lead.isArchived,
        }
      : null,
  };
}

/** Conversations the actor may read: their lead is in a branch in scope (or has none yet). */
function conversationScope(actor: Actor): Prisma.LeadConversationWhereInput {
  return {
    organizationId: actor.organizationId,
    OR: [{ lead: branchScope(actor) }, { leadId: null }],
  };
}

/** A phone number typed into the chat, if the text has one. */
export function phoneIn(text: string): string | null {
  const m = text.match(/\+?\d[\d\s().-]{7,}\d/);
  return m ? normalizePhone(m[0]) : null;
}

/** The link a prospective student presses to write to the centre: t.me/<bot>?start=lead-<id>. */
export async function leadChatLink(db: DbClient, organizationId: string): Promise<string | null> {
  const effective = await telegramConfigFor(db, organizationId);
  if (!effective?.config.botUsername) return null;
  return `https://t.me/${effective.config.botUsername}?start=${LEAD_START_PREFIX}${organizationId}`;
}

/** The branch a stranger's lead is filed in: the first active branch of the centre. */
async function firstBranch(db: DbClient, organizationId: string): Promise<string | null> {
  const branch = await db.branch.findFirst({
    where: { organizationId, isActive: true },
    orderBy: [{ createdAt: "asc" }],
    select: { id: true },
  });
  return branch?.id ?? null;
}

const CHANNEL_LABEL: Record<LeadChannel, string> = { TELEGRAM: "Telegram", INSTAGRAM: "Instagram" };

async function channelSource(tx: DbClient, organizationId: string, channel: LeadChannel) {
  const name = CHANNEL_LABEL[channel];
  return tx.leadSource.upsert({
    where: { organizationId_name: { organizationId, name } },
    create: { organizationId, name },
    update: {},
    select: { id: true },
  });
}

type ExistingConversation = Prisma.LeadConversationGetPayload<{
  include: { lead: { select: { id: true; phones: { select: { phone: true } } } } };
}>;

interface InboundFiling {
  organizationId: string;
  channel: LeadChannel;
  externalChatId: string;
  /** The message to append; the Telegram `/start lead-<id>` code only opens the chat. */
  text: string | null;
  displayName: string | null;
  username: string | null;
  locale: BotLocale;
  externalId: string | null;
  existing: ExistingConversation | null;
}

/**
 * Files one inbound message, whatever the channel: appends to the open chat
 * (reopening it, adding a new phone to the lead) or makes the lead and the
 * chat, and rings the bell once per unread stretch. Returns the chat and
 * whether it is new, which decides the one-time welcome.
 */
async function fileInbound(
  db: DbClient,
  f: InboundFiling,
): Promise<{ conversationId: string; isNew: boolean }> {
  const { existing, organizationId, channel, text } = f;
  const phone = text ? phoneIn(text) : null;
  const label = CHANNEL_LABEL[channel];
  return db.$transaction(async (tx) => {
    let conversationId: string;
    let leadId: string | null;
    let fresh = false;
    if (existing) {
      conversationId = existing.id;
      leadId = existing.lead?.id ?? null;
      const wasUnread = existing.unreadCount > 0;
      await tx.leadConversation.update({
        where: { id: existing.id },
        data: {
          displayName: f.displayName ?? existing.displayName,
          username: f.username ?? existing.username,
          lastMessageAt: new Date(),
          isClosed: false,
          unreadCount: text ? { increment: 1 } : existing.unreadCount,
        },
      });
      fresh = !wasUnread;
      if (phone && leadId && !existing.lead!.phones.some((p) => p.phone === phone)) {
        await tx.leadPhone.create({
          data: { leadId, phone, sortOrder: existing.lead!.phones.length },
        });
      }
    } else {
      const branchId = await firstBranch(tx, organizationId);
      leadId = null;
      if (branchId) {
        const column = await defaultColumnForBranch(tx, branchId);
        const source = await channelSource(tx, organizationId, channel);
        const last = await tx.lead.findFirst({
          where: { columnId: column.columnId },
          orderBy: { sortOrder: "desc" },
          select: { sortOrder: true },
        });
        const fullName = f.displayName ?? `${label} ${f.username ?? f.externalChatId}`;
        const lead = await tx.lead.create({
          data: {
            branchId,
            boardId: column.boardId,
            columnId: column.columnId,
            fullName,
            sourceId: source.id,
            comment: f.username ? `${label} @${f.username}` : null,
            sortOrder: (last?.sortOrder ?? -1) + 1,
            phones: phone ? { create: [{ phone, sortOrder: 0 }] } : undefined,
          },
          select: { id: true },
        });
        leadId = lead.id;
        await recordAudit(tx, null, {
          organizationId,
          branchId,
          action: "lead.create",
          entity: "Lead",
          entityId: lead.id,
          after: { fullName, source: label, chatId: f.externalChatId },
        });
      }
      const created = await tx.leadConversation.create({
        data: {
          organizationId,
          leadId,
          channel,
          externalChatId: f.externalChatId,
          displayName: f.displayName,
          username: f.username,
          locale: f.locale,
          unreadCount: text ? 1 : 0,
        },
        select: { id: true },
      });
      conversationId = created.id;
      fresh = true;
    }
    if (text) {
      await tx.leadMessage.create({
        data: { conversationId, direction: "IN", text, externalId: f.externalId },
      });
    }
    if (fresh && text) {
      await notifyUsers(tx, {
        kind: "LEAD_MESSAGE",
        params: {
          name: f.displayName ?? f.username ?? f.externalChatId,
          text: text.slice(0, 80),
        },
        href: `/leads/inbox?c=${conversationId}`,
        organizationId,
        permission: "leads.view",
      });
    }
    return { conversationId, isNew: !existing };
  });
}

async function welcomeText(db: DbClient, organizationId: string, locale: BotLocale) {
  const org = await db.organization.findUniqueOrThrow({
    where: { id: organizationId },
    select: { name: true },
  });
  return { text: botText(locale, "leadWelcome", { centre: org.name }) };
}

/**
 * A message from a chat that is not a student's. For a centre's own bot the
 * centre is known; through the shared bot (A-135) only `/start lead-<id>` or
 * an already open conversation says which centre is meant, so a stranger's
 * plain text to the shared bot is left alone. Returns the bot's reply, if any.
 */
export async function receiveTelegramLeadMessage(
  db: DbClient,
  botOrganizationId: string | null,
  message: InboundChatMessage,
): Promise<{ text: string } | null> {
  const text = message.text.trim();
  if (!text) return null;
  const code = START_WITH_CODE.exec(text);
  let organizationId = botOrganizationId;
  if (code) {
    const org = await db.organization.findFirst({
      where: { id: code[1]!, suspendedAt: null },
      select: { id: true },
    });
    if (!org || (botOrganizationId && org.id !== botOrganizationId)) return null;
    organizationId = org.id;
  }
  // Staff chats used for Bot xabarnoma are never leads.
  if (
    await db.botRecipient.findFirst({ where: { chatId: message.chatId }, select: { id: true } })
  ) {
    return null;
  }
  const existing = await db.leadConversation.findFirst({
    where: {
      channel: "TELEGRAM",
      externalChatId: message.chatId,
      ...(organizationId ? { organizationId } : {}),
    },
    orderBy: { lastMessageAt: "desc" },
    include: { lead: { select: { id: true, phones: { select: { phone: true } } } } },
  });
  if (!existing && (!organizationId || (/^\/(start|id|stop)\b/.test(text) && !code))) return null;
  organizationId = existing?.organizationId ?? organizationId!;
  const locale: BotLocale = existing ? botLocale(existing.locale) : botLocale(message.languageCode);
  const displayName =
    [message.firstName, message.lastName].filter(Boolean).join(" ").trim() || null;
  const { isNew } = await fileInbound(db, {
    organizationId,
    channel: "TELEGRAM",
    externalChatId: message.chatId,
    text: code ? null : text,
    displayName,
    username: message.username ?? null,
    locale,
    externalId: message.externalId ?? null,
    existing,
  });
  // The bot greets a new conversation once; later messages wait for a person.
  return isNew ? welcomeText(db, organizationId, locale) : null;
}

export interface InstagramInboundMessage {
  /** The Instagram-scoped id of the person who wrote. */
  senderId: string;
  text: string;
  externalId?: string | null;
  profile?: { name: string | null; username: string | null } | null;
}

/**
 * A direct message to the centre's Instagram account, delivered by Meta's
 * webhook (A-148). The centre is known from the address, so every stranger's
 * message is filed. Returns the welcome for a new conversation, which the
 * webhook sends when the centre wants one.
 */
export async function receiveInstagramLeadMessage(
  db: DbClient,
  organizationId: string,
  message: InstagramInboundMessage,
): Promise<{ text: string } | null> {
  const text = message.text.trim();
  if (!text) return null;
  const existing = await db.leadConversation.findFirst({
    where: { organizationId, channel: "INSTAGRAM", externalChatId: message.senderId },
    orderBy: { lastMessageAt: "desc" },
    include: { lead: { select: { id: true, phones: { select: { phone: true } } } } },
  });
  const locale: BotLocale = existing ? botLocale(existing.locale) : "uz";
  const { isNew } = await fileInbound(db, {
    organizationId,
    channel: "INSTAGRAM",
    externalChatId: message.senderId,
    text,
    displayName: message.profile?.name?.trim() || null,
    username: message.profile?.username?.trim() || null,
    locale,
    externalId: message.externalId ?? null,
    existing,
  });
  return isNew ? welcomeText(db, organizationId, locale) : null;
}

/** Leads → Inbox: open chats first, newest message first. */
export async function listConversations(
  actor: Actor,
  filters: InboxFilters,
  db: DbClient = prisma,
): Promise<ConversationDto[]> {
  authorize(actor, "leads.view");
  const q = filters.q?.trim();
  const rows = await db.leadConversation.findMany({
    where: {
      ...conversationScope(actor),
      ...(filters.status === "all" ? {} : { isClosed: filters.status === "closed" }),
      ...(q
        ? {
            OR: [
              { displayName: { contains: q, mode: "insensitive" } },
              { username: { contains: q, mode: "insensitive" } },
              { lead: { fullName: { contains: q, mode: "insensitive" } } },
              // A number typed with spaces or brackets still finds the stored "+998…".
              ...(/^[+\d\s().-]+$/.test(q)
                ? [{ lead: { phones: { some: { phone: { contains: q.replace(/\D/g, "") } } } } }]
                : []),
            ],
          }
        : {}),
    },
    include,
    orderBy: [{ lastMessageAt: "desc" }],
    take: 200,
  });
  return rows.map(toDto);
}

/** Chats with something unread in the branches in scope: the badge on the board. */
export async function countUnreadConversations(actor: Actor, db: DbClient = prisma) {
  return db.leadConversation.count({
    where: { ...conversationScope(actor), isClosed: false, unreadCount: { gt: 0 } },
  });
}

async function findConversation(db: DbClient, actor: Actor, id: string) {
  return mustFind(
    db.leadConversation.findFirst({ where: { id, ...conversationScope(actor) }, include }),
    "errors.conversationNotFound",
  );
}

/** One chat with every message; opening it marks it read. */
export async function getConversation(
  actor: Actor,
  id: string,
  db: DbClient = prisma,
): Promise<ConversationDetailDto> {
  authorize(actor, "leads.view");
  const row = await findConversation(db, actor, id);
  if (row.unreadCount > 0) {
    await db.leadConversation.update({ where: { id }, data: { unreadCount: 0 } });
  }
  const messages = await db.leadMessage.findMany({
    where: { conversationId: id },
    orderBy: { createdAt: "asc" },
    include: { sentBy: { select: { fullName: true } } },
  });
  return {
    conversation: toDto({ ...row, unreadCount: 0 }),
    messages: messages.map((m) => ({
      id: m.id,
      direction: m.direction,
      text: m.text,
      sentByName: m.sentBy?.fullName ?? null,
      createdAt: m.createdAt.toISOString(),
    })),
  };
}

/** A manager answers: the text goes out through the centre's bot and is kept in the chat. */
export async function replyToConversation(
  actor: Actor,
  id: string,
  input: InboxReplyInput,
  db: DbClient = prisma,
): Promise<ConversationMessageDto> {
  authorize(actor, "leads.update");
  const row = await findConversation(db, actor, id);
  let externalId: string | null = null;
  if (row.channel === "TELEGRAM") {
    const notifier = await getTelegramNotifier(db, row.organizationId);
    await notifier.sendMessage(row.externalChatId, input.text);
  } else if (row.channel === "INSTAGRAM") {
    const provider = getInstagramProvider(await instagramConfigFor(db, row.organizationId));
    externalId = (await provider.sendMessage(row.externalChatId, input.text)).externalId;
  } else {
    throw AppError.conflict("errors.channelNotConnected");
  }
  return db.$transaction(async (tx) => {
    const message = await tx.leadMessage.create({
      data: {
        conversationId: id,
        direction: "OUT",
        text: input.text,
        sentById: actor.userId,
        externalId,
      },
    });
    await tx.leadConversation.update({
      where: { id },
      data: { lastMessageAt: message.createdAt, unreadCount: 0, isClosed: false },
    });
    if (row.lead) {
      await tx.lead.update({ where: { id: row.lead.id }, data: { lastContactAt: new Date() } });
    }
    await recordAudit(tx, actor, {
      action: "lead.message",
      entity: "Lead",
      entityId: row.lead?.id ?? id,
      after: { conversationId: id, text: input.text.slice(0, 200) },
      branchId: row.lead?.branchId ?? null,
    });
    return {
      id: message.id,
      direction: "OUT",
      text: message.text,
      sentByName: actor.fullName,
      createdAt: message.createdAt.toISOString(),
    };
  });
}

/** Close a finished chat (it comes back by itself when the person writes again), or reopen it. */
export async function setConversationClosed(
  actor: Actor,
  id: string,
  input: InboxCloseInput,
  db: DbClient = prisma,
): Promise<ConversationDto> {
  authorize(actor, "leads.update");
  const row = await findConversation(db, actor, id);
  const updated = await db.leadConversation.update({
    where: { id },
    data: { isClosed: input.closed, unreadCount: input.closed ? 0 : row.unreadCount },
    include,
  });
  await recordAudit(db, actor, {
    action: input.closed ? "lead.conversationClose" : "lead.conversationReopen",
    entity: "Lead",
    entityId: row.lead?.id ?? id,
    after: { conversationId: id },
    branchId: row.lead?.branchId ?? null,
  });
  return toDto(updated);
}
