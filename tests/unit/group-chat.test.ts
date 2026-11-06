/**
 * Group chat with a Telegram mirror (A-170) against the real database: a
 * staff message reaches the students' linked chats and sets where their
 * Telegram replies go; a student writes from their link or from the bot, and
 * the group's teachers who are bot recipients hear about it; a student in two
 * groups is asked which one; read marks and the scope check.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/rbac/default-roles";
import { prisma } from "@/server/db/prisma";
import type { Actor } from "@/server/rbac/authorize";
import {
  chatFromTelegram,
  getGroupChat,
  getPortalChat,
  markGroupChatRead,
  markPortalChatRead,
  postGroupMessage,
  postPortalMessage,
} from "@/server/services/chat/group-chat.service";
import { createGroup } from "@/server/services/groups/groups.service";
import { createBranch } from "@/server/services/settings/branches.service";
import { createCourse } from "@/server/services/settings/courses.service";
import { createStudent } from "@/server/services/students/students.service";
import { botText } from "@/server/services/telegram/student-telegram.service";
import { listStudentLinks } from "@/server/services/video/video.service";

import { DEMO_ORG_ID, demoBranchIds } from "./support/tenant";

const RUN = String(Date.now() % 100_000).padStart(5, "0");
const TAG = `gc${RUN}`;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const shift = (n: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
};
const CHAT = `${RUN}71${Date.now() % 1000}`;
const TEACHER_CHAT = `${RUN}72${Date.now() % 1000}`;

const ceo: Actor = {
  userId: "",
  fullName: "CEO",
  roles: ["CEO"],
  permissions: ["*"],
  organizationId: DEMO_ORG_ID,
  branchIds: [],
  activeBranchId: null,
};
const teacher: Actor = {
  ...ceo,
  fullName: `${TAG} Teacher`,
  roles: ["TEACHER"],
  permissions: [...DEFAULT_ROLE_PERMISSIONS.TEACHER],
};
const outsider: Actor = { ...teacher, fullName: "Outsider" };

let branchId: string;
let groupId: string;
let groupName: string;
let secondGroupId: string;
let secondGroupName: string;
let studentId: string;
let token: string;

const tgJobs = (prefix: string) =>
  prisma.job.count({ where: { uniqueKey: { startsWith: prefix } } });

beforeAll(async () => {
  const [user, teacherUser, outsiderUser] = await Promise.all(
    ["CEO", "Teacher", "Outsider"].map((name, i) =>
      prisma.user.create({
        data: {
          phone: `+99895${RUN}7${i}`,
          fullName: `${TAG} ${name}`,
          passwordHash: "x",
          organizationId: DEMO_ORG_ID,
        },
      }),
    ),
  );
  ceo.userId = user!.id;
  teacher.userId = teacherUser!.id;
  outsider.userId = outsiderUser!.id;
  branchId = (await createBranch(ceo, { name: `${TAG} Branch`, isActive: true })).id;
  ceo.branchIds = await demoBranchIds();
  ceo.activeBranchId = branchId;
  teacher.branchIds = [branchId];
  teacher.activeBranchId = branchId;
  outsider.branchIds = [branchId];
  outsider.activeBranchId = branchId;
  const teacherRole = await prisma.role.findUniqueOrThrow({ where: { code: "TEACHER" } });
  await prisma.userRole.createMany({
    data: [teacher.userId, outsider.userId].map((userId) => ({ userId, roleId: teacherRole.id })),
  });
  await prisma.userBranch.createMany({
    data: [teacher.userId, outsider.userId].map((userId) => ({ userId, branchId })),
  });
  // The teacher hears about students' messages in Telegram.
  await prisma.botRecipient.create({
    data: { organizationId: DEMO_ORG_ID, userId: teacher.userId, chatId: TEACHER_CHAT },
  });
  const courseId = (
    await createCourse(ceo, {
      branchId,
      name: `${TAG} Course`,
      description: undefined,
      price: 100_000,
      durationMonths: 2,
      gradingSystemId: null,
      color: null,
    })
  ).id;
  const makeGroup = (name: string, hour: string) =>
    createGroup(ceo, {
      branchId,
      name,
      courseId,
      gradingSystemId: null,
      weekdayPattern: "CUSTOM",
      slots: [1, 3, 5].map((weekday) => ({
        weekday,
        startTime: `${hour}:00`,
        endTime: `${hour}:45`,
        roomId: null,
      })),
      teachers: [{ userId: teacher.userId, role: "MAIN", shareType: "PERCENT", shareValue: 0 }],
      startDate: shift(-7),
      endDate: null,
      status: "ACTIVE",
    });
  groupName = `${TAG} Group A`;
  secondGroupName = `${TAG} Group B`;
  groupId = (await makeGroup(groupName, "10")).id;
  secondGroupId = (await makeGroup(secondGroupName, "12")).id;
  studentId = (
    await createStudent(ceo, {
      branchId,
      fullName: `${TAG} Student`,
      phone: `+99895${RUN}75`,
      birthDate: null,
      gender: "FEMALE",
      photoUrl: null,
      password: null,
      sourceId: null,
      schoolId: null,
      note: null,
      membership: {
        groupId,
        joinedAt: shift(-7),
        customPrice: null,
        note: null,
        status: "ACTIVE",
      },
    })
  ).id;
  await prisma.studentTelegramChat.create({
    data: { studentId, chatId: CHAT, name: "Chat", locale: "en" },
  });
  token = (await listStudentLinks(ceo, groupId))[0]!.token;
});

afterAll(async () => {
  if (!branchId) return;
  // The job rows are the only things outside the branch; archiving the groups keeps the rest out of the way.
  await prisma.job.deleteMany({
    where: {
      OR: [
        { uniqueKey: { endsWith: `:${CHAT}` } },
        { uniqueKey: { endsWith: `:${TEACHER_CHAT}` } },
      ],
    },
  });
  await prisma.group.updateMany({ where: { branchId }, data: { status: "ARCHIVED" } });
  await prisma.studentTelegramChat.deleteMany({ where: { chatId: CHAT } });
  await prisma.botRecipient.deleteMany({ where: { chatId: TEACHER_CHAT } });
  await prisma.$disconnect();
});

describe("group chat", () => {
  it("a teacher's message reaches the students' Telegram chats and points their replies at the group", async () => {
    const before = await tgJobs("tg:chat:");
    const sent = await postGroupMessage(teacher, groupId, "Bring your books tomorrow");
    expect(sent).toMatchObject({
      text: "Bring your books tomorrow",
      mine: true,
      source: "WEB",
      author: { kind: "STAFF", name: teacher.fullName },
    });
    expect(await tgJobs("tg:chat:")).toBe(before + 1);
    const job = await prisma.job.findFirstOrThrow({
      where: { uniqueKey: `tg:chat:${sent.id}:${CHAT}` },
    });
    expect((job.payload as { text: string }).text).toBe(
      botText("en", "chatMessage", {
        group: groupName,
        from: teacher.fullName,
        text: "Bring your books tomorrow",
      }),
    );
    const chat = await prisma.studentTelegramChat.findUniqueOrThrow({ where: { chatId: CHAT } });
    expect(chat.chatGroupId).toBe(groupId);

    // The student's page shows it unread; opening the chat clears that.
    const portal = (await getPortalChat(token))!;
    expect(portal.messages.map((m) => m.text)).toEqual(["Bring your books tomorrow"]);
    expect(portal.messages[0]!.mine).toBe(false);
    expect(portal.unread).toBe(1);
    expect(portal.teachers).toEqual([teacher.fullName]);
    await markPortalChatRead(token);
    expect((await getPortalChat(token))!.unread).toBe(0);
  });

  it("a student's answer from their link tells the teacher in Telegram and counts as unread for the office", async () => {
    const before = await tgJobs("tg:chat-staff:");
    const reply = (await postPortalMessage(token, "Which pages?"))!;
    expect(reply).toMatchObject({
      mine: true,
      author: { kind: "STUDENT", name: `${TAG} Student` },
    });
    expect(await tgJobs("tg:chat-staff:")).toBe(before + 1);
    const job = await prisma.job.findFirstOrThrow({
      where: { uniqueKey: `tg:chat-staff:${reply.id}:${TEACHER_CHAT}` },
    });
    expect((job.payload as { text: string }).text).toContain("Which pages?");

    const staffView = await getGroupChat(ceo, groupId);
    expect(staffView.messages.map((m) => m.text)).toEqual([
      "Bring your books tomorrow",
      "Which pages?",
    ]);
    expect(staffView.messages[1]!.mine).toBe(false);
    // The CEO never opened the chat: both messages are new to them.
    expect(staffView.unread).toBe(2);
    await markGroupChatRead(ceo, groupId);
    expect((await getGroupChat(ceo, groupId)).unread).toBe(0);
    // The teacher wrote the first and has not seen the answer.
    expect((await getGroupChat(teacher, groupId)).unread).toBe(1);
    // `after` returns only what follows the given message.
    const tail = await getGroupChat(ceo, groupId, { after: staffView.messages[0]!.id });
    expect(tail.messages.map((m) => m.text)).toEqual(["Which pages?"]);
  });

  it("a plain Telegram message lands in the group the student last heard from", async () => {
    const reply = await chatFromTelegram(prisma, {
      chatId: CHAT,
      studentId,
      organizationId: null,
      locale: "en",
      text: "Pages 10 to 12?",
    });
    expect(reply).toEqual({ text: botText("en", "chatSent", { group: groupName }), pick: null });
    const last = (await getGroupChat(ceo, groupId)).messages.at(-1)!;
    expect(last).toMatchObject({
      text: "Pages 10 to 12?",
      source: "TELEGRAM",
      author: { kind: "STUDENT" },
    });
  });

  it("asks a student in two groups to pick one, remembers the pick and reports what was said", async () => {
    await prisma.groupMembership.create({
      data: {
        groupId: secondGroupId,
        studentId,
        status: "ACTIVE",
        joinedAt: new Date(shift(-7)),
        activatedAt: new Date(shift(-7)),
      },
    });
    // The chat still points at group A, so the message goes there without a question.
    const direct = await chatFromTelegram(prisma, {
      chatId: CHAT,
      studentId,
      organizationId: null,
      locale: "en",
      text: "Still group A",
    });
    expect(direct?.text).toBe(botText("en", "chatSent", { group: groupName }));
    // With no target yet, the bot offers the groups as buttons.
    await prisma.studentTelegramChat.update({
      where: { chatId: CHAT },
      data: { chatGroupId: null },
    });
    const ask = await chatFromTelegram(prisma, {
      chatId: CHAT,
      studentId,
      organizationId: null,
      locale: "en",
      text: "Where does this go?",
    });
    expect(ask).toEqual({
      text: botText("en", "chatPick"),
      pick: [`💬 ${groupName}`, `💬 ${secondGroupName}`],
    });
    const picked = await chatFromTelegram(prisma, {
      chatId: CHAT,
      studentId,
      organizationId: null,
      locale: "en",
      text: `💬 ${secondGroupName}`,
    });
    expect(picked).toEqual({
      text: botText("en", "chatPicked", { group: secondGroupName }),
      pick: null,
    });
    const sent = await chatFromTelegram(prisma, {
      chatId: CHAT,
      studentId,
      organizationId: null,
      locale: "en",
      text: "Hello group B",
    });
    expect(sent?.text).toBe(botText("en", "chatSent", { group: secondGroupName }));
    expect((await getGroupChat(ceo, secondGroupId)).messages.map((m) => m.text)).toEqual([
      "Hello group B",
    ]);
    expect(
      (await getGroupChat(ceo, groupId)).messages.some((m) => m.text === "Hello group B"),
    ).toBe(false);
  });

  it("keeps other teachers out and refuses writing into an archived group", async () => {
    await expect(getGroupChat(outsider, groupId)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(postGroupMessage(outsider, groupId, "Hi")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await prisma.group.update({ where: { id: secondGroupId }, data: { status: "ARCHIVED" } });
    await expect(postGroupMessage(teacher, secondGroupId, "Hi")).rejects.toMatchObject({
      code: "CONFLICT",
    });
    // An archived group's chat is no longer a Telegram target: the student falls back to group A.
    const reply = await chatFromTelegram(prisma, {
      chatId: CHAT,
      studentId,
      organizationId: null,
      locale: "en",
      text: "Back to A",
    });
    expect(reply?.text).toBe(botText("en", "chatSent", { group: groupName }));
  });
});
