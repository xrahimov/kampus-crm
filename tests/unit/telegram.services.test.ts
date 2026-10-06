/**
 * Telegram for students and parents (A-103) against the real database: the
 * portal's connect link, linking a chat through the bot's /start code,
 * notifications for homework, a started call and lesson reminders, and the
 * job that delivers them. Rows carry a run-specific tag and are removed at the end.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/rbac/default-roles";
import { telegramIntegrationSchema } from "@/lib/validation/integrations";
import { prisma } from "@/server/db/prisma";
import type { Actor } from "@/server/rbac/authorize";
import { createGroup } from "@/server/services/groups/groups.service";
import { addMember } from "@/server/services/groups/memberships.service";
import { reviewSubmission, setHomework } from "@/server/services/homework/homework.service";
import { updateIntegration } from "@/server/services/integrations/integrations.service";
import { createBranch } from "@/server/services/settings/branches.service";
import { createCourse } from "@/server/services/settings/courses.service";
import {
  botDate,
  botLocale,
  botText,
  getPortalTelegram,
  handleStudentCommand,
  reminderSlotKey,
  runLessonReminders,
  unlinkPortalChat,
  wallClock,
} from "@/server/services/telegram/student-telegram.service";
import {
  endVideoRoom,
  listStudentLinks,
  startVideoRoom,
} from "@/server/services/video/video.service";

const RUN = String(Date.now() % 100_000).padStart(5, "0");
const TAG = `t${RUN}`;
const phone = (n: number) => `+99893${RUN}${String(n).padStart(2, "0")}`;
const CHAT = `9${RUN}01`;
const PARENT_CHAT = `9${RUN}02`;

const actor = (fullName: string, roles: string[], permissions: string[]): Actor => ({
  userId: "",
  fullName,
  roles,
  permissions,
  branchIds: [],
  activeBranchId: null,
});
const ceo = actor("CEO", ["CEO"], ["*"]);
const teacher = actor("Teacher", ["TEACHER"], [...DEFAULT_ROLE_PERMISSIONS.TEACHER]);

let branchId: string;
let groupId: string;
let membershipOne: string;
let studentOne: string;
let tokenOne: string;
let previousTelegram: { isEnabled: boolean; config: unknown } | null = null;

/**
 * What was queued for this run's chats, oldest first. The jobs are read, not
 * run: other test files share the queue, and `telegram.send` itself is covered
 * by the integrations tests.
 */
async function queued(): Promise<Array<{ chatId: string; text: string }>> {
  const rows = await prisma.job.findMany({
    where: { type: "telegram.send", uniqueKey: { startsWith: "tg:" } },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }],
  });
  return rows
    .map((r) => r.payload as { chatId: string; text: string })
    .filter((p) => p.chatId === CHAT || p.chatId === PARENT_CHAT);
}
const mine = async (from: number) => (await queued()).slice(from);
const count = async () => (await queued()).length;

beforeAll(async () => {
  const stored = await prisma.integrationSetting.findFirst({ where: { provider: "TELEGRAM" } });
  previousTelegram = stored ? { isEnabled: stored.isEnabled, config: stored.config } : null;
  const teacherRole = await prisma.role.findFirstOrThrow({ where: { code: "TEACHER" } });
  for (const [a, n, withRole] of [
    [ceo, 1, false],
    [teacher, 2, true],
  ] as const) {
    const user = await prisma.user.create({
      data: { phone: phone(n), fullName: `${TAG} ${a.fullName}`, passwordHash: "x" },
    });
    a.userId = user.id;
    if (withRole) {
      await prisma.userRole.create({ data: { userId: user.id, roleId: teacherRole.id } });
    }
  }
  await updateIntegration(ceo, "TELEGRAM", {
    isEnabled: true,
    botToken: "",
    webhookSecret: "s3cret",
    botUsername: "kampus_test_bot",
  });
  branchId = (await createBranch(ceo, { name: `${TAG} A`, isActive: true })).id;
  ceo.activeBranchId = branchId;
  await prisma.userBranch.create({ data: { userId: teacher.userId, branchId } });
  teacher.branchIds = [branchId];
  const courseId = (
    await createCourse(ceo, {
      branchId,
      name: `${TAG} German`,
      description: undefined,
      price: 0,
      durationMonths: 2,
      gradingSystemId: null,
      color: null,
    })
  ).id;
  groupId = (
    await createGroup(ceo, {
      branchId,
      name: `${TAG} A1`,
      courseId,
      gradingSystemId: null,
      weekdayPattern: "EVERY_DAY",
      slots: [1, 2, 3, 4, 5, 6].map((weekday) => ({
        weekday,
        startTime: "18:00",
        endTime: "19:30",
        roomId: null,
      })),
      teachers: [{ userId: teacher.userId, role: "MAIN", shareType: "PERCENT", shareValue: 40 }],
      startDate: "2026-09-01",
      endDate: null,
      status: "ACTIVE",
    })
  ).id;
  const one = await addMember(ceo, groupId, {
    newStudent: { fullName: `${TAG} Student One`, phone: phone(11) },
    joinedAt: "2026-09-01",
    status: "ACTIVE",
    customPrice: null,
    note: null,
  });
  membershipOne = one.id;
  studentOne = one.studentId;
  tokenOne = (await listStudentLinks(teacher, groupId)).find(
    (l) => l.membershipId === membershipOne,
  )!.token;
});

afterAll(async () => {
  const organizationId = (await prisma.organization.findFirst({ orderBy: { createdAt: "asc" } }))!
    .id;
  if (previousTelegram) {
    await prisma.integrationSetting.update({
      where: { organizationId_provider: { organizationId, provider: "TELEGRAM" } },
      data: { isEnabled: previousTelegram.isEnabled, config: previousTelegram.config as object },
    });
  } else {
    await prisma.integrationSetting.deleteMany({ where: { organizationId, provider: "TELEGRAM" } });
  }
  // The queued telegram.send jobs stay: another test file's worker pass may be
  // running them (the fake notifier accepts them), and deleting a claimed row
  // would break that pass. Their keys are unique to this run.
  // Guarded: a setup that failed early must not turn these into table-wide deletes.
  if (groupId) await prisma.group.deleteMany({ where: { id: groupId } });
  await prisma.student.deleteMany({ where: { fullName: { startsWith: TAG } } });
  await prisma.course.deleteMany({ where: { name: { startsWith: TAG } } });
  await prisma.user.deleteMany({ where: { fullName: { startsWith: TAG } } });
  if (branchId) await prisma.branch.deleteMany({ where: { id: branchId } });
});

describe("Telegram for students", () => {
  it("speaks three languages and formats dates for each", () => {
    expect(botLocale("ru-RU")).toBe("ru");
    expect(botLocale("de")).toBe("uz");
    expect(botLocale(undefined)).toBe("uz");
    expect(botDate("uz", "2026-10-06")).toBe("6-okt");
    expect(botDate("en", "2026-10-06")).toBe("6 Oct");
    expect(
      botText("en", "lessonSoon", { group: "A1", start: "18:00", end: "19:30", link: "none" }),
    ).toBe("A1: lesson at 18:00–19:30, in about 30 minutes.");
    expect(
      botText("uz", "lessonSoon", {
        group: "A1",
        start: "18:00",
        end: "19:30",
        link: "https://x/y",
      }),
    ).toContain("Kirish: https://x/y");
    expect(
      telegramIntegrationSchema.parse({
        isEnabled: true,
        botToken: "",
        webhookSecret: "",
        botUsername: "@Some_bot",
      }).botUsername,
    ).toBe("Some_bot");
    expect(
      telegramIntegrationSchema.safeParse({
        isEnabled: true,
        botToken: "",
        webhookSecret: "",
        botUsername: "no spaces",
      }).success,
    ).toBe(false);
  });

  it("gives the portal a connect link and links the chat through /start", async () => {
    const state = (await getPortalTelegram(tokenOne))!;
    expect(state.chats).toEqual([]);
    expect(state.link).toMatch(/^https:\/\/t\.me\/kampus_test_bot\?start=[A-Za-z0-9_-]{8,}$/);
    const code = state.link!.split("start=")[1]!;
    // The code is stable between visits.
    expect((await getPortalTelegram(tokenOne))!.link).toBe(state.link);

    expect(
      await handleStudentCommand(prisma, {
        chatId: CHAT,
        text: "/start nope-nope-nope",
        languageCode: "en",
      }),
    ).toBe(botText("en", "unknownCode"));
    expect(await handleStudentCommand(prisma, { chatId: CHAT, text: "/id" })).toBeNull();
    expect(await handleStudentCommand(prisma, { chatId: CHAT, text: "/start" })).toBeNull();

    const reply = await handleStudentCommand(prisma, {
      chatId: CHAT,
      text: `/start ${code}`,
      firstName: "Dovud",
      languageCode: "ru",
    });
    expect(reply).toBe(botText("ru", "linked", { student: `${TAG} Student One` }));
    // A parent links the same student from another phone.
    await handleStudentCommand(prisma, {
      chatId: PARENT_CHAT,
      text: `/start ${code}`,
      firstName: "Ota",
      languageCode: "uz",
    });
    const linked = (await getPortalTelegram(tokenOne))!;
    expect(linked.chats.map((c) => c.name)).toEqual(["Dovud", "Ota"]);
  });

  it("tells linked chats about homework in their own language, once", async () => {
    const lesson = await prisma.lesson.findFirstOrThrow({
      where: { groupId },
      orderBy: { date: "asc" },
    });
    const before = await count();
    const hw = await setHomework(teacher, lesson.id, {
      text: "Seite 5",
      linkUrl: null,
      attachmentUrl: null,
      dueDate: null,
    });
    let sent = await mine(before);
    expect(sent).toHaveLength(2);
    expect(sent.find((m) => m.chatId === CHAT)!.text).toContain("новое домашнее задание");
    expect(sent.find((m) => m.chatId === PARENT_CHAT)!.text).toContain("yangi uy vazifasi");
    expect(sent[0]!.text).toContain("Seite 5");

    // Same text again: nothing new; changed text: one more round.
    await setHomework(teacher, lesson.id, {
      text: "Seite 5",
      linkUrl: "https://x",
      attachmentUrl: null,
      dueDate: null,
    });
    expect(await mine(before)).toHaveLength(2);
    await setHomework(teacher, lesson.id, {
      text: "Seite 6",
      linkUrl: null,
      attachmentUrl: null,
      dueDate: null,
    });
    sent = await mine(before);
    expect(sent).toHaveLength(4);
    expect(sent[2]!.text + sent[3]!.text).toMatch(/изменено|o‘zgartirildi/);

    await reviewSubmission(teacher, hw.id, membershipOne, {
      status: "RETURNED",
      teacherComment: "Nochmal",
    });
    sent = await mine(before);
    expect(sent).toHaveLength(6);
    expect(sent[4]!.text).toContain("Nochmal");
    // Accepting after returning is a change; accepting again is not.
    await reviewSubmission(teacher, hw.id, membershipOne, { status: "ACCEPTED" });
    await reviewSubmission(teacher, hw.id, membershipOne, { status: "ACCEPTED" });
    expect(await mine(before)).toHaveLength(8);
  });

  it("sends the join link when the call starts", async () => {
    const before = await count();
    const room = await startVideoRoom(teacher, groupId, { lessonId: null });
    const sent = await mine(before);
    expect(sent).toHaveLength(2);
    expect(sent[0]!.text).toContain(`/class/${tokenOne}`);
    await endVideoRoom(teacher, room.id);
  });

  it("reminds about a lesson about 30 minutes before it starts", async () => {
    // A wall-clock moment 29 minutes before today's lesson at 18:00, Tashkent time:
    // the 17:30 slot covers lessons starting 18:00–18:04.
    const today = wallClock(new Date()).date;
    const lesson = await prisma.lesson.findFirst({
      where: { groupId, date: new Date(`${today}T00:00:00.000Z`) },
    });
    if (!lesson) return; // Sunday: the group has no lesson today, nothing to remind about.
    const at = new Date(`${today}T17:31:00+05:00`);
    expect(wallClock(at)).toEqual({ date: today, minutes: 17 * 60 + 31 });
    expect(reminderSlotKey(at)).toBe(`tg-reminders:${today}:1050`);

    const before = await count();
    await runLessonReminders(prisma, at);
    const sent = await mine(before);
    expect(sent).toHaveLength(2);
    expect(sent.find((m) => m.chatId === CHAT)!.text).toContain("18:00–19:30");
    expect(sent[0]!.text).toContain(`/class/${tokenOne}`);
    // A re-run of the same slot, the one before and the one after add nothing.
    await runLessonReminders(prisma, at);
    await runLessonReminders(prisma, new Date(`${today}T17:27:00+05:00`));
    await runLessonReminders(prisma, new Date(`${today}T17:36:00+05:00`));
    expect(await mine(before)).toHaveLength(2);
  });

  it("lets the student disconnect a chat, and /stop does the same from Telegram", async () => {
    await unlinkPortalChat(tokenOne, PARENT_CHAT);
    expect((await getPortalTelegram(tokenOne))!.chats.map((c) => c.chatId)).toEqual([CHAT]);
    expect(
      await handleStudentCommand(prisma, { chatId: CHAT, text: "/stop", languageCode: "ru" }),
    ).toBe(botText("ru", "unlinked"));
    expect(await handleStudentCommand(prisma, { chatId: CHAT, text: "/stop" })).toBeNull();
    expect((await getPortalTelegram(tokenOne))!.chats).toEqual([]);
    expect(await prisma.studentTelegramChat.count({ where: { studentId: studentOne } })).toBe(0);
  });
});
