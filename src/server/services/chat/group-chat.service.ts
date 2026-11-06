import { recordAudit } from "@/server/audit/audit";
import { prisma, type DbClient } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";
import { enqueue } from "@/server/jobs/queue";
import type { Actor } from "@/server/rbac/authorize";
import { findGroupInScope } from "@/server/services/groups/shared";
import { organizationOfBranch } from "@/server/services/settings/shared";
import {
  botText,
  notifyStudents,
  type BotLocale,
} from "@/server/services/telegram/student-telegram.service";
import { membershipByToken } from "@/server/services/video/video.service";

/*
 * Group chat (A-170): one thread per group between its teachers (and the
 * office) and its students. Staff write from the group page, students from
 * their personal page. Telegram mirrors it both ways: a staff message reaches
 * every linked chat of the group's students, and a plain message a student
 * sends to the bot lands in the chat of the group they last heard from, or the
 * one they picked with a button.
 */

/** The chat shows this many latest messages. */
export const CHAT_PAGE = 100;
/** Members who still take part: the same set the video links use. */
const CURRENT = ["NEW", "TRIAL", "ACTIVE"] as const;

export interface ChatMessageDto {
  id: string;
  text: string;
  at: string;
  source: "WEB" | "TELEGRAM";
  author: { kind: "STAFF" | "STUDENT"; name: string };
  /** Written by the reader themself. */
  mine: boolean;
}

export interface GroupChatDto {
  messages: ChatMessageDto[];
  /** Messages by others since the reader last opened the chat. */
  unread: number;
}

export interface PortalChatDto extends GroupChatDto {
  teachers: string[];
}

type Row = {
  id: string;
  text: string;
  source: "WEB" | "TELEGRAM";
  createdAt: Date;
  userId: string | null;
  membershipId: string | null;
  user: { fullName: string } | null;
  membership: { student: { fullName: string } } | null;
};

const ROW_INCLUDE = {
  user: { select: { fullName: true } },
  membership: { select: { student: { select: { fullName: true } } } },
} as const;

function toDto(row: Row, me: { userId?: string; membershipId?: string }): ChatMessageDto {
  const staff = row.userId !== null || row.membershipId === null;
  return {
    id: row.id,
    text: row.text,
    at: row.createdAt.toISOString(),
    source: row.source,
    author: staff
      ? { kind: "STAFF", name: row.user?.fullName ?? "" }
      : { kind: "STUDENT", name: row.membership?.student.fullName ?? "" },
    mine:
      (me.userId !== undefined && row.userId === me.userId) ||
      (me.membershipId !== undefined && row.membershipId === me.membershipId),
  };
}

/** The latest messages of a group, oldest first; with `after`, only those newer than that message. */
async function loadMessages(db: DbClient, groupId: string, after: string | null): Promise<Row[]> {
  let since: Date | null = null;
  if (after) {
    const anchor = await db.groupChatMessage.findUnique({
      where: { id: after },
      select: { createdAt: true, groupId: true },
    });
    since = anchor && anchor.groupId === groupId ? anchor.createdAt : null;
  }
  const rows = await db.groupChatMessage.findMany({
    where: { groupId, ...(since ? { createdAt: { gt: since } } : {}) },
    include: ROW_INCLUDE,
    orderBy: { createdAt: "desc" },
    take: CHAT_PAGE,
  });
  return rows.reverse();
}

/* ----- staff ------------------------------------------------------------------------------ */

/** The chat of a group the actor may see. */
export async function getGroupChat(
  actor: Actor,
  groupId: string,
  options: { after?: string | null } = {},
  db: DbClient = prisma,
): Promise<GroupChatDto> {
  await findGroupInScope(db, actor, groupId, {});
  const [rows, read] = await Promise.all([
    loadMessages(db, groupId, options.after ?? null),
    db.groupChatRead.findUnique({ where: { groupId_userId: { groupId, userId: actor.userId } } }),
  ]);
  const unread = await db.groupChatMessage.count({
    where: {
      groupId,
      ...(read ? { createdAt: { gt: read.readAt } } : {}),
      // Students' messages have no userId; SQL's NOT would drop those nulls.
      OR: [{ userId: null }, { userId: { not: actor.userId } }],
    },
  });
  return { messages: rows.map((r) => toDto(r, { userId: actor.userId })), unread };
}

/** The actor opened the chat: everything so far counts as read. */
export async function markGroupChatRead(
  actor: Actor,
  groupId: string,
  db: DbClient = prisma,
): Promise<void> {
  await findGroupInScope(db, actor, groupId, {});
  await db.groupChatRead.upsert({
    where: { groupId_userId: { groupId, userId: actor.userId } },
    create: { groupId, userId: actor.userId },
    update: { readAt: new Date() },
  });
}

/** A staff message to the group; every student's linked Telegram chat hears it. */
export async function postGroupMessage(
  actor: Actor,
  groupId: string,
  text: string,
  db: DbClient = prisma,
): Promise<ChatMessageDto> {
  const group = await findGroupInScope(db, actor, groupId, {});
  if (group.status === "ARCHIVED") throw AppError.conflict("errors.groupArchived");
  const row = await db.$transaction(async (tx) => {
    const created = await tx.groupChatMessage.create({
      data: { groupId, userId: actor.userId, text },
      include: ROW_INCLUDE,
    });
    await recordAudit(tx, actor, {
      action: "group.chat",
      entity: "GroupChatMessage",
      entityId: created.id,
      after: { groupId, text },
      branchId: group.branchId,
    });
    const members = await tx.groupMembership.findMany({
      where: { groupId, status: { in: [...CURRENT] } },
      select: { studentId: true },
    });
    const studentIds = [...new Set(members.map((m) => m.studentId))];
    if (studentIds.length > 0) {
      await notifyStudents(tx, {
        studentIds,
        kind: "chatMessage",
        refKey: `chat:${created.id}`,
        values: { group: group.name, from: actor.fullName, text },
      });
      // A plain reply in Telegram now goes back to this group's chat.
      await tx.studentTelegramChat.updateMany({
        where: { studentId: { in: studentIds } },
        data: { chatGroupId: groupId },
      });
    }
    await tx.groupChatRead.upsert({
      where: { groupId_userId: { groupId, userId: actor.userId } },
      create: { groupId, userId: actor.userId },
      update: { readAt: new Date() },
    });
    return created;
  });
  return toDto(row, { userId: actor.userId });
}

/* ----- students --------------------------------------------------------------------------- */

async function teacherNames(db: DbClient, groupId: string): Promise<string[]> {
  const rows = await db.groupTeacher.findMany({
    where: { groupId },
    select: { user: { select: { fullName: true } } },
    orderBy: { role: "asc" },
  });
  return rows.map((r) => r.user.fullName);
}

/** The chat as the student's link shows it; null for a dead link. */
export async function getPortalChat(
  token: string,
  options: { after?: string | null } = {},
  db: DbClient = prisma,
): Promise<PortalChatDto | null> {
  const membership = await membershipByToken(db, token);
  if (!membership) return null;
  const [rows, teachers, readAt] = await Promise.all([
    loadMessages(db, membership.groupId, options.after ?? null),
    teacherNames(db, membership.groupId),
    db.groupMembership
      .findUnique({ where: { id: membership.id }, select: { chatReadAt: true } })
      .then((m) => m?.chatReadAt ?? null),
  ]);
  const unread = await db.groupChatMessage.count({
    where: {
      groupId: membership.groupId,
      ...(readAt ? { createdAt: { gt: readAt } } : {}),
      OR: [{ membershipId: null }, { membershipId: { not: membership.id } }],
    },
  });
  return {
    messages: rows.map((r) => toDto(r, { membershipId: membership.id })),
    unread,
    teachers,
  };
}

/** The student opened the chat. */
export async function markPortalChatRead(
  token: string,
  db: DbClient = prisma,
): Promise<{ ok: true } | null> {
  const membership = await membershipByToken(db, token);
  if (!membership) return null;
  await db.groupMembership.update({
    where: { id: membership.id },
    data: { chatReadAt: new Date() },
  });
  return { ok: true };
}

/**
 * Tells the group's teachers in Telegram (those who are bot recipients) that a
 * student wrote. Staff texts are in Uzbek, like the other staff notifications.
 */
async function notifyTeachers(
  tx: DbClient,
  input: { groupId: string; groupName: string; branchId: string; student: string; text: string },
  messageId: string,
): Promise<number> {
  const teachers = await tx.groupTeacher.findMany({
    where: { groupId: input.groupId, user: { botRecipient: { isNot: null } } },
    select: { user: { select: { botRecipient: { select: { chatId: true } } } } },
  });
  if (teachers.length === 0) return 0;
  const organizationId = await organizationOfBranch(tx, input.branchId);
  const text = botText("uz", "chatFromStudent", {
    group: input.groupName,
    student: input.student,
    text: input.text,
  });
  let queued = 0;
  for (const t of teachers) {
    const chatId = t.user.botRecipient?.chatId;
    if (!chatId) continue;
    const id = await enqueue(tx, {
      type: "telegram.send",
      payload: { organizationId, chatId, text },
      uniqueKey: `tg:chat-staff:${messageId}:${chatId}`,
    });
    if (id) queued += 1;
  }
  return queued;
}

async function createStudentMessage(
  db: DbClient,
  membership: {
    id: string;
    groupId: string;
    group: { name: string; branchId: string };
    student: { fullName: string };
  },
  text: string,
  source: "WEB" | "TELEGRAM",
): Promise<Row> {
  return db.$transaction(async (tx) => {
    const created = await tx.groupChatMessage.create({
      data: { groupId: membership.groupId, membershipId: membership.id, text, source },
      include: ROW_INCLUDE,
    });
    await tx.groupMembership.update({
      where: { id: membership.id },
      data: { chatReadAt: new Date() },
    });
    await recordAudit(tx, null, {
      action: "group.chat.student",
      entity: "GroupChatMessage",
      entityId: created.id,
      after: { groupId: membership.groupId, membershipId: membership.id, source },
      branchId: membership.group.branchId,
      organizationId: await organizationOfBranch(tx, membership.group.branchId),
    });
    await notifyTeachers(
      tx,
      {
        groupId: membership.groupId,
        groupName: membership.group.name,
        branchId: membership.group.branchId,
        student: membership.student.fullName,
        text,
      },
      created.id,
    );
    return created;
  });
}

/** A student's message from their page. */
export async function postPortalMessage(
  token: string,
  text: string,
  db: DbClient = prisma,
): Promise<ChatMessageDto | null> {
  const membership = await membershipByToken(db, token);
  if (!membership) return null;
  const row = await createStudentMessage(db, membership, text, "WEB");
  return toDto(row, { membershipId: membership.id });
}

/* ----- the Telegram side ------------------------------------------------------------------ */

export interface ChatBotReply {
  text: string;
  /** Group names to offer as buttons when the student has to pick a chat. */
  pick: string[] | null;
}

/** "💬 Name" from the pick keyboard, or a bare group name, matched without case. */
function pickedGroup<T extends { group: { name: string } }>(text: string, options: T[]): T | null {
  const wanted = text
    .replace(/^💬\s*/u, "")
    .trim()
    .toLowerCase();
  if (!wanted) return null;
  return options.find((m) => m.group.name.trim().toLowerCase() === wanted) ?? null;
}

/**
 * A plain message from a linked Telegram chat, after the bot's own commands:
 * posts it into the student's group chat, or asks which group when the student
 * is in several and none has spoken yet. Null when the student has no group
 * with a chat, so the caller falls back to the menu hint.
 */
export async function chatFromTelegram(
  db: DbClient,
  input: {
    chatId: string;
    studentId: string;
    /** The centre whose bot received the message; null for the shared bot. */
    organizationId: string | null;
    locale: BotLocale;
    text: string;
  },
): Promise<ChatBotReply | null> {
  const memberships = await db.groupMembership.findMany({
    where: {
      studentId: input.studentId,
      status: { in: [...CURRENT] },
      group: {
        status: { not: "ARCHIVED" },
        ...(input.organizationId ? { branch: { organizationId: input.organizationId } } : {}),
      },
    },
    select: {
      id: true,
      groupId: true,
      group: { select: { name: true, branchId: true } },
      student: { select: { fullName: true } },
    },
    // Oldest group first; the name breaks ties, so the buttons keep one order.
    orderBy: [{ joinedAt: "asc" }, { group: { name: "asc" } }],
  });
  if (memberships.length === 0) return null;
  const chat = await db.studentTelegramChat.findUnique({
    where: { chatId: input.chatId },
    select: { chatGroupId: true },
  });
  const picked = memberships.length > 1 ? pickedGroup(input.text, memberships) : null;
  if (picked) {
    await db.studentTelegramChat.update({
      where: { chatId: input.chatId },
      data: { chatGroupId: picked.groupId },
    });
    return { text: botText(input.locale, "chatPicked", { group: picked.group.name }), pick: null };
  }
  const target =
    memberships.length === 1
      ? memberships[0]!
      : (memberships.find((m) => m.groupId === chat?.chatGroupId) ?? null);
  if (!target) {
    return {
      text: botText(input.locale, "chatPick"),
      pick: memberships.map((m) => `💬 ${m.group.name}`),
    };
  }
  if (chat?.chatGroupId !== target.groupId) {
    await db.studentTelegramChat.update({
      where: { chatId: input.chatId },
      data: { chatGroupId: target.groupId },
    });
  }
  await createStudentMessage(db, target, input.text, "TELEGRAM");
  return { text: botText(input.locale, "chatSent", { group: target.group.name }), pick: null };
}
