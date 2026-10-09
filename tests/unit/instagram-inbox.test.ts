/**
 * Instagram direct messages in the lead inbox (A-148) against the real
 * database: a stranger's message makes a lead with the source Instagram and a
 * chat, later messages and the sender's handle land on it, a manager's answer
 * goes out through the fake Graph provider, and Meta's signature check holds.
 */
import { createHmac, randomInt } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/server/db/prisma";
import { fakeInstagramOutbox, verifyMetaSignature } from "@/server/integrations/instagram/provider";
import type { Actor } from "@/server/rbac/authorize";
import {
  getConversation,
  listConversations,
  receiveInstagramLeadMessage,
  replyToConversation,
} from "@/server/services/leads/inbox.service";

import { DEMO_ORG_ID, demoBranchIds } from "./support/tenant";

const RUN = String(randomInt(100_000)).padStart(5, "0");
const TAG = `ig${RUN}`;
const senderId = `17${RUN}${Date.now() % 100_000}`;

const ceo: Actor = {
  userId: "",
  fullName: `${TAG} CEO`,
  organizationId: DEMO_ORG_ID,
  roles: ["CEO"],
  permissions: ["*"],
  branchIds: [],
  activeBranchId: null,
};

beforeAll(async () => {
  const user = await prisma.user.create({
    data: {
      phone: `+99895${RUN}01`,
      fullName: ceo.fullName,
      passwordHash: "x",
      organizationId: DEMO_ORG_ID,
    },
  });
  ceo.userId = user.id;
  ceo.branchIds = await demoBranchIds();
});

afterAll(async () => {
  const conversations = await prisma.leadConversation.findMany({
    where: { externalChatId: senderId },
    select: { id: true, leadId: true },
  });
  const leadIds = conversations.map((c) => c.leadId).filter((id): id is string => id !== null);
  await prisma.auditLog.deleteMany({ where: { entityId: { in: leadIds } } });
  await prisma.leadConversation.deleteMany({
    where: { id: { in: conversations.map((c) => c.id) } },
  });
  await prisma.lead.deleteMany({ where: { id: { in: leadIds } } });
  await prisma.notification.deleteMany({
    where: { href: { in: conversations.map((c) => `/leads/inbox?c=${c.id}`) } },
  });
  await prisma.auditLog.deleteMany({ where: { actorId: ceo.userId } });
  await prisma.user.deleteMany({ where: { id: ceo.userId } });
  await prisma.$disconnect();
});

describe("the Instagram inbox", () => {
  it("checks Meta's signature over the raw body", () => {
    const body = JSON.stringify({ object: "instagram", entry: [] });
    const sign = createHmac("sha256", "app-secret").update(body).digest("hex");
    expect(verifyMetaSignature(body, `sha256=${sign}`, "app-secret")).toBe(true);
    expect(verifyMetaSignature(body, `sha256=${sign}`, "other-secret")).toBe(false);
    expect(verifyMetaSignature(body, null, "app-secret")).toBe(false);
    expect(verifyMetaSignature(body, "sha1=abc", "app-secret")).toBe(false);
  });

  it("files a stranger's message as a lead and a chat, then appends the next", async () => {
    const welcome = await receiveInstagramLeadMessage(prisma, DEMO_ORG_ID, {
      senderId,
      text: "Salom! IELTS kursi bormi?",
      externalId: `mid-${RUN}-1`,
      profile: { name: `${TAG} Prospect`, username: `${TAG}_insta` },
    });
    expect(welcome?.text).toBeTruthy();
    const list = await listConversations(ceo, { status: "open", q: TAG });
    const chat = list.find((c) => c.channel === "INSTAGRAM");
    expect(chat).toMatchObject({
      displayName: `${TAG} Prospect`,
      username: `${TAG}_insta`,
      unreadCount: 1,
    });
    expect(chat?.lead?.fullName).toBe(`${TAG} Prospect`);
    const lead = await prisma.lead.findUniqueOrThrow({
      where: { id: chat!.lead!.id },
      include: { source: true },
    });
    expect(lead.source?.name).toBe("Instagram");
    expect(lead.comment).toBe(`Instagram @${TAG}_insta`);

    // A second message is appended without another welcome; a phone lands on the lead.
    expect(
      await receiveInstagramLeadMessage(prisma, DEMO_ORG_ID, {
        senderId,
        text: `Raqamim +99890${RUN}77`,
        externalId: `mid-${RUN}-2`,
      }),
    ).toBeNull();
    const detail = await getConversation(ceo, chat!.id);
    expect(detail.messages.map((m) => m.direction)).toEqual(["IN", "IN"]);
    expect(detail.conversation.lead?.phones).toEqual([`+99890${RUN}77`]);
  });

  it("sends a manager's answer through the Instagram provider", async () => {
    const chat = (await listConversations(ceo, { status: "open", q: TAG })).find(
      (c) => c.channel === "INSTAGRAM",
    )!;
    const before = fakeInstagramOutbox.length;
    const sent = await replyToConversation(ceo, chat.id, { text: "Ha, dushanba kuni boshlanadi." });
    expect(sent.direction).toBe("OUT");
    expect(fakeInstagramOutbox.slice(before)).toEqual([
      { recipientId: senderId, text: "Ha, dushanba kuni boshlanadi." },
    ]);
    const detail = await getConversation(ceo, chat.id);
    expect(detail.messages.at(-1)).toMatchObject({ direction: "OUT", sentByName: ceo.fullName });
  });
});
