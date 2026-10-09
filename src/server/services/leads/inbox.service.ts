import type { LeadChannel, Prisma } from "@/generated/prisma/client";
import type { Actor } from "@/server/rbac/authorize";
import type { InboxCloseInput, InboxFilters, InboxReplyInput } from "@/lib/validation/leads";
import { recordAudit } from "@/server/audit/audit";
import { prisma, type DbClient } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";
import { authorize, branchScope } from "@/server/rbac/authorize";
import { notifyUsers } from "@/server/services/dashboard/notifications.service";
import {
  getTelegramNotifier,
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
 * same tables carry Instagram once that channel is connected (E6).
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

async function telegramSource(tx: DbClient, organizationId: string) {
  return tx.leadSource.upsert({
    where: { organizationId_name: { organizationId, name: "Telegram" } },
    create: { organizationId, name: "Telegram" },
    update: {},
    select: { id: true },
  });
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
  const phone = phoneIn(text);

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
          displayName: displayName ?? existing.displayName,
          username: message.username ?? existing.username,
          lastMessageAt: new Date(),
          isClosed: false,
          unreadCount: code ? existing.unreadCount : { increment: 1 },
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
        const source = await telegramSource(tx, organizationId);
        const last = await tx.lead.findFirst({
          where: { columnId: column.columnId },
          orderBy: { sortOrder: "desc" },
          select: { sortOrder: true },
        });
        const fullName = displayName ?? `Telegram ${message.username ?? message.chatId}`;
        const lead = await tx.lead.create({
          data: {
            branchId,
            boardId: column.boardId,
            columnId: column.columnId,
            fullName,
            sourceId: source.id,
            comment: message.username ? `Telegram @${message.username}` : null,
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
          after: { fullName, source: "Telegram", chatId: message.chatId },
        });
      }
      const created = await tx.leadConversation.create({
        data: {
          organizationId,
          leadId,
          channel: "TELEGRAM",
          externalChatId: message.chatId,
          displayName,
          username: message.username ?? null,
          locale,
          unreadCount: code ? 0 : 1,
        },
        select: { id: true },
      });
      conversationId = created.id;
      fresh = true;
    }
    if (!code) {
      await tx.leadMessage.create({
        data: {
          conversationId,
          direction: "IN",
          text,
          externalId: message.externalId ?? null,
        },
      });
    }
    if (fresh && !code) {
      await notifyUsers(tx, {
        kind: "LEAD_MESSAGE",
        params: {
          name: displayName ?? message.username ?? message.chatId,
          text: text.slice(0, 80),
        },
        href: `/leads/inbox?c=${conversationId}`,
        organizationId,
        permission: "leads.view",
      });
    }
    // The bot greets a new conversation once; later messages wait for a person.
    if (!existing) {
      const org = await tx.organization.findUniqueOrThrow({
        where: { id: organizationId },
        select: { name: true },
      });
      return { text: botText(locale, "leadWelcome", { centre: org.name }) };
    }
    return null;
  });
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
  if (row.channel !== "TELEGRAM") throw AppError.conflict("errors.channelNotConnected");
  const notifier = await getTelegramNotifier(db, row.organizationId);
  await notifier.sendMessage(row.externalChatId, input.text);
  return db.$transaction(async (tx) => {
    const message = await tx.leadMessage.create({
      data: { conversationId: id, direction: "OUT", text: input.text, sentById: actor.userId },
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
