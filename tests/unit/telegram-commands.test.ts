/**
 * Two-way Telegram (A-119) against the real database, inside a centre of its
 * own: a chat linked to a student asks for its balance, gets payment links for
 * what is due and reports today's absence, each in its own language, and the
 * webhook's replies carry the three-button keyboard.
 */
import { randomInt } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { formatMoneyUz } from "@/lib/dates";
import { prisma } from "@/server/db/prisma";
import type { Actor } from "@/server/rbac/authorize";
import { createGroup } from "@/server/services/groups/groups.service";
import { addExtraLesson, markAttendance } from "@/server/services/groups/lessons.service";
import { isoWeekday } from "@/server/services/groups/schedule";
import { updateIntegration } from "@/server/services/integrations/integrations.service";
import { createCourse } from "@/server/services/settings/courses.service";
import { createOrganization } from "@/server/services/settings/organizations.service";
import { dateToIso, isoToDate } from "@/server/services/settings/shared";
import { membershipBalances } from "@/server/services/students/balances";
import { createStudent } from "@/server/services/students/students.service";
import {
  botMenu,
  handleBotUpdate,
  parseBotCommand,
} from "@/server/services/telegram/bot-commands.service";
import { botDate, botText, wallClock } from "@/server/services/telegram/student-telegram.service";

import { DEMO_ORG_ID, demoBranchIds } from "./support/tenant";

const RUN = String(randomInt(100_000)).padStart(5, "0");
const TAG = `tg${RUN}`;
const phone = (n: number) => `+99895${RUN}${String(n).padStart(2, "0")}`;
const chatOf = (n: number) => `${RUN}${n}${Date.now() % 1000}`;
const shift = (iso: string, days: number) => {
  const d = isoToDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return dateToIso(d);
};
const today = wallClock(new Date()).date;
const tomorrow = shift(today, 1);
const monthStart = `${today.slice(0, 7)}-01`;

const owner: Actor = {
  userId: "",
  fullName: "Owner",
  organizationId: DEMO_ORG_ID,
  roles: ["CEO"],
  permissions: ["*"],
  branchIds: [],
  activeBranchId: null,
  isSiteOwner: true,
};
let ceo: Actor;
let organizationId: string;
let branchId: string;
let groupId: string;
let groupName: string;
let aliceId: string;
let aliceMembershipId: string;
let bobId: string;
let bobMembershipId: string;
const aliceChat = chatOf(1);
const parentChat = chatOf(2);
const bobChat = chatOf(3);
const strangerChat = chatOf(4);
const aliceCode = `${TAG}code0001`;

const say = (chatId: string, text: string, languageCode?: string) =>
  handleBotUpdate(prisma, organizationId, { chatId, text, firstName: "Chat", languageCode });

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
  owner.userId = user.id;
  owner.branchIds = await demoBranchIds();
  const org = await createOrganization(owner, {
    name: `${TAG} Centre`,
    branches: [`${TAG} Main`],
    ceoFullName: `${TAG} Director`,
    ceoPhone: phone(2),
    ceoPassword: "FirstPass!2026",
  });
  organizationId = org.id;
  branchId = org.branches[0]!.id;
  const director = await prisma.user.findUniqueOrThrow({ where: { phone: phone(2) } });
  ceo = {
    userId: director.id,
    fullName: `${TAG} Director`,
    organizationId,
    roles: ["CEO"],
    permissions: ["*"],
    branchIds: [branchId],
    activeBranchId: branchId,
  };
  await updateIntegration(ceo, "TELEGRAM", {
    isEnabled: true,
    botToken: "",
    webhookSecret: `${TAG}-hook`,
    botUsername: `${TAG}_bot`,
    weeklyReport: true,
  });
  const courseId = (
    await createCourse(ceo, {
      branchId,
      name: `${TAG} Course`,
      description: undefined,
      price: 0,
      durationMonths: 3,
      gradingSystemId: null,
      color: null,
    })
  ).id;
  // One lesson a week on tomorrow's weekday, since the first of the month: none today.
  groupName = `${TAG} Group`;
  groupId = (
    await createGroup(ceo, {
      branchId,
      name: groupName,
      courseId,
      gradingSystemId: null,
      weekdayPattern: "CUSTOM",
      slots: [
        { weekday: isoWeekday(tomorrow), startTime: "10:00", endTime: "11:30", roomId: null },
      ],
      teachers: [],
      startDate: monthStart,
      endDate: null,
      status: "ACTIVE",
    })
  ).id;
  const student = (name: string, n: number, customPrice: number | null) =>
    createStudent(ceo, {
      branchId,
      fullName: `${TAG} ${name}`,
      phone: phone(n),
      birthDate: null,
      gender: "FEMALE",
      photoUrl: null,
      password: null,
      sourceId: null,
      schoolId: null,
      note: null,
      membership: { groupId, joinedAt: monthStart, customPrice, note: null, status: "ACTIVE" },
    });
  aliceId = (await student("Alice", 11, null)).id;
  bobId = (await student("Bob", 12, 500_000)).id;
  aliceMembershipId = (
    await prisma.groupMembership.findFirstOrThrow({ where: { studentId: aliceId, groupId } })
  ).id;
  bobMembershipId = (
    await prisma.groupMembership.findFirstOrThrow({ where: { studentId: bobId, groupId } })
  ).id;
  await prisma.student.update({ where: { id: aliceId }, data: { telegramCode: aliceCode } });
  await prisma.studentTelegramChat.createMany({
    data: [
      { studentId: aliceId, chatId: parentChat, name: "Ota", locale: "uz" },
      { studentId: bobId, chatId: bobChat, name: "Отец", locale: "ru" },
    ],
  });
});

afterAll(async () => {
  // A failed set-up leaves the ids unset; an unset filter would match every centre.
  if (!organizationId) return;
  await prisma.user.deleteMany({ where: { id: owner.userId } });
  // The centre goes with everything in it, children first where nothing cascades.
  await prisma.auditLog.deleteMany({
    where: { OR: [{ branchId }, { organizationId }, { actor: { organizationId } }] },
  });
  await prisma.onlinePayment.deleteMany({ where: { branchId } });
  await prisma.group.deleteMany({ where: { branchId } });
  await prisma.student.deleteMany({ where: { branchId } });
  await prisma.course.deleteMany({ where: { branchId } });
  await prisma.paymentMethod.deleteMany({ where: { organizationId } });
  await prisma.user.deleteMany({ where: { organizationId } });
  await prisma.branch.deleteMany({ where: { organizationId } });
  await prisma.organization.deleteMany({ where: { id: organizationId } });
  await prisma.$disconnect();
});

describe("reading a chat message", () => {
  it("knows the three commands in three languages, with the reason after them", () => {
    expect(parseBotCommand("/balance")).toEqual({ kind: "balance", rest: "" });
    expect(parseBotCommand("Balans")).toEqual({ kind: "balance", rest: "" });
    expect(parseBotCommand(" баланс ")).toEqual({ kind: "balance", rest: "" });
    expect(parseBotCommand("Pay")).toEqual({ kind: "pay", rest: "" });
    expect(parseBotCommand("To‘lov")).toEqual({ kind: "pay", rest: "" });
    expect(parseBotCommand("Оплата")).toEqual({ kind: "pay", rest: "" });
    expect(parseBotCommand("Absent today")).toEqual({ kind: "absent", rest: "" });
    expect(parseBotCommand("absent today: Dentist at 3")).toEqual({
      kind: "absent",
      rest: "Dentist at 3",
    });
    expect(parseBotCommand("Bugun darsga kelmaydi, kasal")).toEqual({
      kind: "absent",
      rest: "kasal",
    });
    expect(parseBotCommand("Сегодня не придёт болеет")).toEqual({
      kind: "absent",
      rest: "болеет",
    });
    expect(parseBotCommand("/absent sick")).toEqual({ kind: "absent", rest: "sick" });
    expect(parseBotCommand("hello")).toBeNull();
    expect(parseBotCommand("payment plan")).toEqual({ kind: "pay", rest: "plan" });
    expect(parseBotCommand("balanced diet")).toBeNull();
  });

  it("offers the buttons in the chat's language", () => {
    expect(botMenu("uz")).toEqual({
      keyboard: [[{ text: "Balans" }, { text: "To‘lov" }], [{ text: "Bugun darsga kelmaydi" }]],
      resize_keyboard: true,
      is_persistent: true,
    });
    expect(botMenu("en")).toMatchObject({
      keyboard: [[{ text: "Balance" }, { text: "Pay" }], [{ text: "Absent today" }]],
    });
  });
});

describe("the webhook's replies", () => {
  it("links a chat with the keyboard, hints on other text and ignores strangers", async () => {
    const linked = await say(aliceChat, `/start ${aliceCode}`, "en");
    expect(linked).toEqual({
      text: botText("en", "linked", { student: `${TAG} Alice` }),
      replyMarkup: botMenu("en"),
    });
    expect(await say(aliceChat, "/id")).toBeNull();
    expect(await say(aliceChat, "/start")).toBeNull();
    expect(await say(aliceChat, "Hello there")).toEqual({
      text: botText("en", "menuHint"),
      replyMarkup: botMenu("en"),
    });
    // A chat nobody linked gets nothing, so the staff `/id` flow stays as it was.
    expect(await say(strangerChat, "Balance", "en")).toBeNull();
    expect(await say(strangerChat, "/start nope-nope-nope", "en")).toEqual({
      text: botText("en", "unknownCode"),
      replyMarkup: { remove_keyboard: true },
    });
  });

  it("answers the balance per group with the coins, as a balance or a debt", async () => {
    const alice = (await say(aliceChat, "Balance"))!;
    const [aliceGroup, aliceCoins] = alice.text.split("\n");
    expect(aliceGroup).toMatch(new RegExp(`^${groupName}: balance ${formatMoneyUz(0)}`));
    expect(aliceCoins).toBe("Coins: 0");
    expect(alice.replyMarkup).toEqual(botMenu("en"));

    const balance = (await membershipBalances(prisma, [bobMembershipId])).get(bobMembershipId)!;
    expect(balance.balance).toBeLessThan(0);
    const bob = (await say(bobChat, "баланс"))!;
    expect(bob.text).toBe(`${groupName}: долг ${formatMoneyUz(-balance.balance)}\nМонеты: 0`);
    expect(bob.replyMarkup).toEqual(botMenu("ru"));
  });

  it("sends payment links for what is due once a provider is on", async () => {
    expect((await say(bobChat, "Оплата"))!.text).toBe(botText("ru", "payOff"));
    await updateIntegration(ceo, "PAYME", {
      isEnabled: true,
      merchantId: `${TAG}-merchant`,
      key: `${TAG}-key`,
      checkoutUrl: "https://checkout.test.paycom.uz",
    });
    const balance = (await membershipBalances(prisma, [bobMembershipId])).get(bobMembershipId)!;
    const amount = Math.round(balance.suggestedAmount);
    expect(amount).toBeGreaterThan(0);
    const reply = (await say(bobChat, "/pay"))!;
    const [title, link] = reply.text.split("\n");
    expect(title).toMatch(new RegExp(`^${groupName}: ${formatMoneyUz(amount)} за `));
    expect(link).toMatch(/^Payme: https:\/\/checkout\.test\.paycom\.uz\/[A-Za-z0-9+/=]+$/);
    const orders = await prisma.onlinePayment.findMany({
      where: { membershipId: bobMembershipId },
    });
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({ provider: "PAYME", status: "PENDING", studentId: bobId });
    expect(Number(orders[0]!.amount)).toBe(amount);
    expect(dateToIso(orders[0]!.effectiveMonth)).toBe(balance.suggestedMonth);
    // Nothing is due from Alice (the course is free).
    expect((await say(aliceChat, "pay"))!.text).toBe(botText("en", "payNothing"));
  });

  it("marks today's lessons excused with the reason, unless the teacher saw the student", async () => {
    // No lesson today: the next one is named.
    expect((await say(aliceChat, "Absent today"))!.text).toBe(
      botText("en", "absentNoLesson", {
        next: `${groupName}, ${botDate("en", tomorrow)} 10:00`,
      }),
    );
    const lesson = await addExtraLesson(ceo, groupId, {
      date: today,
      startTime: "20:00",
      endTime: "21:00",
    });
    const mark = (membershipId: string) =>
      prisma.attendance.findUnique({
        where: { lessonId_membershipId: { lessonId: lesson.id, membershipId } },
      });

    expect((await say(aliceChat, "Absent today: sick"))!.text).toBe(
      botText("en", "absentMarked", { group: groupName, time: "20:00", reason: "sick" }),
    );
    expect(await mark(aliceMembershipId)).toMatchObject({
      status: "EXCUSED",
      comment: "Via Telegram: sick",
      markedById: null,
    });
    const audit = await prisma.auditLog.findFirst({
      where: { action: "attendance.mark", entityId: lesson.id },
    });
    expect(audit).toMatchObject({ actorId: null, organizationId, branchId });

    // The parent's phone, in Uzbek and without a reason, rewrites the note.
    expect((await say(parentChat, "Bugun darsga kelmaydi"))!.text).toBe(
      botText("uz", "absentMarked", { group: groupName, time: "20:00", reason: "none" }),
    );
    expect((await mark(aliceMembershipId))!.comment).toBe("Telegram orqali");

    // Bob's father writes in Russian.
    expect((await say(bobChat, "Сегодня не придёт: болеет"))!.text).toBe(
      botText("ru", "absentMarked", { group: groupName, time: "20:00", reason: "болеет" }),
    );
    expect((await mark(bobMembershipId))!.comment).toBe("Через Telegram: болеет");

    // Once the teacher has marked the student present, the chat cannot undo it.
    await markAttendance(ceo, lesson.id, [{ membershipId: aliceMembershipId, status: "PRESENT" }]);
    expect((await say(aliceChat, "/absent"))!.text).toBe(
      botText("en", "absentPresent", { group: groupName, time: "20:00", reason: "none" }),
    );
    expect((await mark(aliceMembershipId))!.status).toBe("PRESENT");
  });
});
