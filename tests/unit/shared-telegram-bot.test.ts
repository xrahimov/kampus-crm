/**
 * Shared Telegram bot (A-135) against the real database: only the site owner
 * can offer a bot to every centre; a centre without a bot of its own then uses
 * it (notifier, portal link, weekly report preference, settings note), a centre
 * with its own bot keeps that; and updates through the shared bot are routed by
 * the chat, so a student of any centre links, asks and unlinks through it.
 */
import { randomInt } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/server/db/prisma";
import type { Actor } from "@/server/rbac/authorize";
import {
  getIntegration,
  isSharedTelegramBot,
  telegramConfigFor,
  updateIntegration,
} from "@/server/services/integrations/integrations.service";
import { createOrganization } from "@/server/services/settings/organizations.service";
import { handleBotUpdate } from "@/server/services/telegram/bot-commands.service";
import { botText } from "@/server/services/telegram/student-telegram.service";

import { DEMO_ORG_ID, demoBranchIds } from "./support/tenant";

const RUN = String(randomInt(100_000)).padStart(5, "0");
const TAG = `sb${RUN}`;
const phone = (n: number) => `+99896${RUN}${String(n).padStart(2, "0")}`;
const CHAT = `${RUN}7${Date.now() % 1000}`;
const CODE = `${TAG}code0001`;

const siteOwner: Actor = {
  userId: "",
  fullName: "Owner",
  organizationId: DEMO_ORG_ID,
  roles: ["CEO"],
  permissions: ["*"],
  branchIds: [],
  activeBranchId: null,
  isSiteOwner: true,
};

const telegram = (over: Partial<Parameters<typeof updateIntegration<"TELEGRAM">>[2]> = {}) => ({
  isEnabled: true,
  botToken: "",
  webhookSecret: `${TAG}-${over.botUsername ?? "hook"}`,
  botUsername: `${TAG}_bot`,
  weeklyReport: true,
  sharedWithAllCentres: false,
  ...over,
});

/** The server owner's centre (A), a centre without a bot (B), a centre with its own bot (C). */
let ownerOfA: Actor;
let ceoB: Actor;
let ceoC: Actor;
let orgA = "";
let orgB = "";
let orgC = "";
let studentId = "";

async function centre(n: number, suffix: string) {
  const org = await createOrganization(siteOwner, {
    name: `${TAG} ${suffix}`,
    branches: [`${TAG} ${suffix} Main`],
    ceoFullName: `${TAG} ${suffix} CEO`,
    ceoPhone: phone(n),
    ceoPassword: "FirstPass!2026",
  });
  const ceo = await prisma.user.findUniqueOrThrow({ where: { phone: phone(n) } });
  const actor: Actor = {
    userId: ceo.id,
    fullName: ceo.fullName,
    organizationId: org.id,
    roles: ["CEO"],
    permissions: ["*"],
    branchIds: [org.branches[0]!.id],
    activeBranchId: org.branches[0]!.id,
  };
  return { org, actor };
}

beforeAll(async () => {
  const user = await prisma.user.create({
    data: {
      phone: phone(1),
      fullName: `${TAG} Owner`,
      passwordHash: "x",
      organizationId: DEMO_ORG_ID,
      isSiteOwner: true,
    },
  });
  siteOwner.userId = user.id;
  siteOwner.branchIds = await demoBranchIds();
  const a = await centre(2, "A");
  const b = await centre(3, "B");
  const c = await centre(4, "C");
  orgA = a.org.id;
  orgB = b.org.id;
  orgC = c.org.id;
  // In this test the server's owner runs centre A.
  ownerOfA = { ...a.actor, isSiteOwner: true };
  ceoB = b.actor;
  ceoC = c.actor;
  studentId = (
    await prisma.student.create({
      data: {
        branchId: b.org.branches[0]!.id,
        fullName: `${TAG} Student`,
        phone: phone(9),
        gender: "FEMALE",
        telegramCode: CODE,
      },
    })
  ).id;
});

afterAll(async () => {
  await prisma.studentTelegramChat.deleteMany({ where: { chatId: CHAT } });
  await prisma.integrationSetting.deleteMany({ where: { organizationId: orgA } });
});

describe("the flag", () => {
  it("is dropped when anyone but the site owner saves it", async () => {
    const saved = await updateIntegration(
      ceoC,
      "TELEGRAM",
      telegram({ botUsername: `${TAG}_own_bot`, sharedWithAllCentres: true }),
    );
    expect(saved.config.sharedWithAllCentres).toBe(false);
    expect(await isSharedTelegramBot(prisma, orgC)).toBe(false);
  });

  it("is kept for the site owner, who then serves every centre without a bot", async () => {
    const saved = await updateIntegration(
      ownerOfA,
      "TELEGRAM",
      telegram({ botUsername: `${TAG}_shared_bot`, sharedWithAllCentres: true }),
    );
    expect(saved.config.sharedWithAllCentres).toBe(true);
    expect(await isSharedTelegramBot(prisma, orgA)).toBe(true);

    // B has no bot: the shared one serves it, and its Telegram card says so.
    const forB = await telegramConfigFor(prisma, orgB);
    expect(forB?.organizationId).toBe(orgA);
    expect(forB?.config.botUsername).toBe(`${TAG}_shared_bot`);
    expect((await getIntegration(ceoB, "TELEGRAM")).state.sharedBot).toEqual({
      username: `${TAG}_shared_bot`,
    });

    // C has its own bot and keeps it.
    const forC = await telegramConfigFor(prisma, orgC);
    expect(forC?.organizationId).toBe(orgC);
    expect(forC?.config.botUsername).toBe(`${TAG}_own_bot`);
    expect((await getIntegration(ceoC, "TELEGRAM")).state.sharedBot).toBeNull();

    // The owner's own card carries no note about itself.
    expect((await getIntegration(ownerOfA, "TELEGRAM")).state.sharedBot).toBeNull();
  });

  it("lets a centre keep its own weekly-report preference while using the shared bot", async () => {
    await updateIntegration(
      ceoB,
      "TELEGRAM",
      telegram({ isEnabled: false, botUsername: "", webhookSecret: "", weeklyReport: false }),
    );
    const forB = await telegramConfigFor(prisma, orgB);
    expect(forB?.organizationId).toBe(orgA);
    expect(forB?.config.weeklyReport).toBe(false);
  });
});

describe("routing through the shared bot", () => {
  it("links, answers and unlinks a student of another centre; the per-centre path still refuses", async () => {
    // Through centre A's own identity the code of B's student is unknown.
    const refused = await handleBotUpdate(prisma, orgA, { chatId: CHAT, text: `/start ${CODE}` });
    expect(refused?.text).toBe(botText("uz", "unknownCode"));

    // Through the shared bot it links.
    const linked = await handleBotUpdate(prisma, null, {
      chatId: CHAT,
      text: `/start ${CODE}`,
      firstName: "Parent",
      languageCode: "ru",
    });
    expect(linked?.text).toBe(botText("ru", "linked", { student: `${TAG} Student` }));
    const chat = await prisma.studentTelegramChat.findUnique({ where: { chatId: CHAT } });
    expect(chat?.studentId).toBe(studentId);

    // A command is answered about the student's own centre (no groups: an empty balance).
    const balance = await handleBotUpdate(prisma, null, { chatId: CHAT, text: "/balance" });
    expect(balance).not.toBeNull();
    expect(balance?.replyMarkup).toMatchObject({ keyboard: expect.any(Array) });

    // Through C's bot the chat is nobody's business.
    expect(await handleBotUpdate(prisma, orgC, { chatId: CHAT, text: "/balance" })).toBeNull();

    const unlinked = await handleBotUpdate(prisma, null, {
      chatId: CHAT,
      text: "/stop",
      languageCode: "ru",
    });
    expect(unlinked?.text).toBe(botText("ru", "unlinked"));
    expect(await prisma.studentTelegramChat.findUnique({ where: { chatId: CHAT } })).toBeNull();
  });
});
