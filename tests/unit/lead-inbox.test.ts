/**
 * The Telegram lead inbox (A-146) against the real database: a stranger's first
 * message to the centre's bot makes a lead and a chat, later messages and a
 * phone number land on them, managers answer and close from Kampus, and the
 * shared bot only files a chat that carries the centre's code.
 */
import { randomInt } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/server/db/prisma";
import { fakeTelegramOutbox } from "@/server/integrations/telegram/notifier";
import type { Actor } from "@/server/rbac/authorize";
import {
  countUnreadConversations,
  getConversation,
  LEAD_START_PREFIX,
  listConversations,
  phoneIn,
  receiveTelegramLeadMessage,
  replyToConversation,
  setConversationClosed,
} from "@/server/services/leads/inbox.service";
import { DEMO_ORG_ID, demoBranchIds } from "./support/tenant";

const RUN = String(randomInt(100_000)).padStart(5, "0");
const TAG = `in${RUN}`;
const chatOf = (n: number) => `9${RUN}${n}${Date.now() % 10_000}`;
const strangerChat = chatOf(1);
const sharedChat = chatOf(2);
const staffChat = chatOf(3);

const ceo: Actor = {
  userId: "",
  fullName: `${TAG} CEO`,
  organizationId: DEMO_ORG_ID,
  roles: ["CEO"],
  permissions: ["*"],
  branchIds: [],
  activeBranchId: null,
};
let recipientUserId: string;

beforeAll(async () => {
  const user = await prisma.user.create({
    data: {
      phone: `+99893${RUN}01`,
      fullName: ceo.fullName,
      passwordHash: "x",
      organizationId: DEMO_ORG_ID,
    },
  });
  ceo.userId = user.id;
  ceo.branchIds = await demoBranchIds();
  const staff = await prisma.user.create({
    data: {
      phone: `+99893${RUN}02`,
      fullName: `${TAG} Staff`,
      passwordHash: "x",
      organizationId: DEMO_ORG_ID,
    },
  });
  recipientUserId = staff.id;
  await prisma.botRecipient.create({
    data: { organizationId: DEMO_ORG_ID, userId: staff.id, chatId: staffChat },
  });
});

afterAll(async () => {
  const conversations = await prisma.leadConversation.findMany({
    where: { externalChatId: { in: [strangerChat, sharedChat, staffChat] } },
    select: { id: true, leadId: true },
  });
  const leadIds = conversations.map((c) => c.leadId).filter((id): id is string => id !== null);
  await prisma.auditLog.deleteMany({ where: { entityId: { in: leadIds } } });
  await prisma.leadConversation.deleteMany({
    where: { id: { in: conversations.map((c) => c.id) } },
  });
  await prisma.lead.deleteMany({ where: { id: { in: leadIds } } });
  await prisma.notification.deleteMany({
    where: { kind: "LEAD_MESSAGE", params: { path: ["name"], equals: `${TAG} Prospect` } },
  });
  await prisma.botRecipient.deleteMany({ where: { userId: recipientUserId } });
  await prisma.auditLog.deleteMany({ where: { actorId: { in: [ceo.userId, recipientUserId] } } });
  await prisma.user.deleteMany({ where: { id: { in: [ceo.userId, recipientUserId] } } });
  await prisma.$disconnect();
});

describe("the lead inbox", () => {
  it("finds a phone number in a message", () => {
    expect(phoneIn("Salom, mening raqamim 90 123 45 67")).toBe("+998901234567");
    expect(phoneIn("call +998 (93) 123-45-67 please")).toBe("+998931234567");
    expect(phoneIn("no number here")).toBeNull();
  });

  it("turns a stranger's first message into a lead and a chat, then appends and answers", async () => {
    // A staff chat used for Bot xabarnoma is never a lead.
    expect(
      await receiveTelegramLeadMessage(prisma, DEMO_ORG_ID, { chatId: staffChat, text: "hi" }),
    ).toBeNull();
    // Bare commands keep their old meaning.
    expect(
      await receiveTelegramLeadMessage(prisma, DEMO_ORG_ID, {
        chatId: strangerChat,
        text: "/start",
      }),
    ).toBeNull();

    const greeting = await receiveTelegramLeadMessage(prisma, DEMO_ORG_ID, {
      chatId: strangerChat,
      text: "Salom! Ingliz tili kursi bormi?",
      firstName: TAG,
      lastName: "Prospect",
      username: `${TAG}_user`,
      languageCode: "uz",
      externalId: "1",
    });
    expect(greeting?.text).toContain("Assalomu alaykum");
    const unreadBefore = await countUnreadConversations(ceo);
    expect(unreadBefore).toBeGreaterThanOrEqual(1);
    const list = await listConversations(ceo, { status: "open" });
    const chat = list.find((c) => c.displayName === `${TAG} Prospect`);
    expect(chat).toMatchObject({
      channel: "TELEGRAM",
      username: `${TAG}_user`,
      locale: "uz",
      unreadCount: 1,
      isClosed: false,
      lastMessage: { direction: "IN", text: "Salom! Ingliz tili kursi bormi?" },
    });
    expect(chat?.lead).toMatchObject({ fullName: `${TAG} Prospect`, phones: [] });
    const lead = await prisma.lead.findUniqueOrThrow({
      where: { id: chat!.lead!.id },
      include: { source: true },
    });
    expect(lead.source?.name).toBe("Telegram");
    expect(lead.comment).toBe(`Telegram @${TAG}_user`);

    // The second message is appended, and the phone number in it lands on the lead.
    expect(
      await receiveTelegramLeadMessage(prisma, DEMO_ORG_ID, {
        chatId: strangerChat,
        text: `Mening raqamim 93 ${RUN.slice(0, 3)} ${RUN.slice(3)}00`,
        firstName: TAG,
        lastName: "Prospect",
      }),
    ).toBeNull();
    const detail = await getConversation(ceo, chat!.id);
    expect(detail.messages.map((m) => m.direction)).toEqual(["IN", "IN"]);
    expect(detail.conversation.unreadCount).toBe(0);
    expect(detail.conversation.lead?.phones).toEqual([`+99893${RUN}00`]);

    // A manager answers: the bot delivers it and the chat keeps it.
    const before = fakeTelegramOutbox.length;
    const sent = await replyToConversation(ceo, chat!.id, { text: "Ha, bor. Qachon qulay?" });
    expect(sent).toMatchObject({ direction: "OUT", sentByName: ceo.fullName });
    expect(fakeTelegramOutbox.slice(before).some((m) => m.chatId === strangerChat)).toBe(true);
    const after = await getConversation(ceo, chat!.id);
    expect(after.messages.at(-1)).toMatchObject({
      direction: "OUT",
      text: "Ha, bor. Qachon qulay?",
    });
    expect(
      (await prisma.lead.findUniqueOrThrow({ where: { id: lead.id } })).lastContactAt,
    ).not.toBeNull();

    // Closed chats leave the open list and come back when the person writes again.
    expect((await setConversationClosed(ceo, chat!.id, { closed: true })).isClosed).toBe(true);
    expect((await listConversations(ceo, { status: "open" })).some((c) => c.id === chat!.id)).toBe(
      false,
    );
    expect(
      (await listConversations(ceo, { status: "closed" })).some((c) => c.id === chat!.id),
    ).toBe(true);
    await receiveTelegramLeadMessage(prisma, DEMO_ORG_ID, { chatId: strangerChat, text: "Ertaga" });
    const reopened = await getConversation(ceo, chat!.id);
    expect(reopened.conversation.isClosed).toBe(false);
    expect(reopened.messages).toHaveLength(4);
  });

  it("through the shared bot files a chat only with the centre's code", async () => {
    expect(
      await receiveTelegramLeadMessage(prisma, null, { chatId: sharedChat, text: "Hello?" }),
    ).toBeNull();
    const greeting = await receiveTelegramLeadMessage(prisma, null, {
      chatId: sharedChat,
      text: `/start ${LEAD_START_PREFIX}${DEMO_ORG_ID}`,
      firstName: `${TAG} Shared`,
      languageCode: "en",
    });
    expect(greeting?.text).toContain("Hello!");
    const list = await listConversations(ceo, { status: "all", q: `${TAG} Shared` });
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ unreadCount: 0, lastMessage: null, locale: "en" });
    // Now the chat is known: plain text through the shared bot lands in it.
    await receiveTelegramLeadMessage(prisma, null, { chatId: sharedChat, text: "Is there IELTS?" });
    const detail = await getConversation(ceo, list[0]!.id);
    expect(detail.messages.map((m) => m.text)).toEqual(["Is there IELTS?"]);
    // A code for a centre that does not exist is ignored.
    expect(
      await receiveTelegramLeadMessage(prisma, null, {
        chatId: chatOf(9),
        text: `/start ${LEAD_START_PREFIX}nosuchcentre0001`,
      }),
    ).toBeNull();
  });
});
