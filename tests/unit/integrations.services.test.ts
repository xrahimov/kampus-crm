/**
 * Phase 11 against the real database: SMS templates and sending, auto-SMS and
 * the job queue, bot recipients, integration settings, calls, logs and staff
 * attendance. Rows carry a run-specific tag and are removed at the end.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { smsParts } from "@/features/sms/sms-counter";
import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/rbac/default-roles";
import {
  botRecipientSchema,
  sendSmsSchema,
  workScheduleSchema,
} from "@/lib/validation/integrations";
import { prisma } from "@/server/db/prisma";
import { fakeSmsOutbox } from "@/server/integrations/sms/provider";
import { fakeTelegramOutbox } from "@/server/integrations/telegram/notifier";
import { ensureDailyJob, registerJobHandlers } from "@/server/jobs/handlers";
import { enqueue, registerJobHandler, runDueJobs } from "@/server/jobs/queue";
import type { Actor } from "@/server/rbac/authorize";
import {
  getStaffAttendanceReport,
  recordFaceIdCheck,
  setManualCheck,
  setWorkSchedule,
} from "@/server/services/attendance/staff-attendance.service";
import {
  listCalls,
  listStudentCalls,
  recordWebhookCall,
  startCall,
} from "@/server/services/calls/calls.service";
import { createGroup } from "@/server/services/groups/groups.service";
import { markAttendance } from "@/server/services/groups/lessons.service";
import { addMember } from "@/server/services/groups/memberships.service";
import {
  createBotRecipient,
  deleteBotRecipient,
  listBotRecipients,
  notifyStaff,
} from "@/server/services/integrations/bot-recipients.service";
import {
  assertWebhookSecret,
  getIntegration,
  loadIntegrationConfig,
  updateIntegration,
} from "@/server/services/integrations/integrations.service";
import { listActionLog, listLoginLogs } from "@/server/services/logs/logs.service";
import { createBranch } from "@/server/services/settings/branches.service";
import { createCourse } from "@/server/services/settings/courses.service";
import { dateToIso } from "@/server/services/settings/shared";
import { DEMO_ORG_ID, demoBranchIds } from "./support/tenant";
import {
  getAutoSmsSettings,
  queueAutoSms,
  renderTemplate,
  updateAutoSmsSettings,
} from "@/server/services/sms/auto-sms.service";
import {
  listSmsLog,
  listStudentSms,
  resolveRecipients,
  sendSms,
} from "@/server/services/sms/sms.service";
import {
  createSmsCategory,
  createSmsTemplate,
  deleteSmsCategory,
  deleteSmsTemplate,
  importProviderTemplates,
  listSmsTemplates,
} from "@/server/services/sms/templates.service";

const RUN = String(Date.now() % 100_000).padStart(5, "0");
const TAG = `i${RUN}`;
const phone = (n: number) => `+99895${RUN}${String(n).padStart(2, "0")}`;

const actor = (fullName: string, roles: string[], permissions: string[]): Actor => ({
  userId: "",
  fullName,
  roles,
  permissions,
  organizationId: DEMO_ORG_ID,
  branchIds: [],
  activeBranchId: null,
});
const ceo = actor("CEO", ["CEO"], ["*"]);
const teacher = actor("Teacher", ["TEACHER"], [...DEFAULT_ROLE_PERMISSIONS.TEACHER]);
const cashier = actor("Cashier", ["CASHIER"], [...DEFAULT_ROLE_PERMISSIONS.CASHIER]);

let branchA: string;
let groupA: string;
let studentOne: string;
let studentNoPhone: string;
let membershipOne: string;
let categoryId: string;
let templateId: string;
const messageIds: string[] = [];
const list = {
  page: 1,
  pageSize: 50,
  skip: 0,
  take: 50,
  sort: { field: "createdAt" as const, direction: "desc" as const },
};

beforeAll(async () => {
  registerJobHandlers();
  const roles = await prisma.role.findMany({ where: { code: { in: ["TEACHER", "CASHIER"] } } });
  const roleId = (code: string) => roles.find((r) => r.code === code)!.id;
  for (const [a, n, code] of [
    [ceo, 1, null],
    [teacher, 2, "TEACHER"],
    [cashier, 3, "CASHIER"],
  ] as const) {
    const user = await prisma.user.create({
      data: {
        phone: phone(n),
        fullName: `${TAG} ${a.fullName}`,
        passwordHash: "x",
        organizationId: DEMO_ORG_ID,
      },
    });
    a.userId = user.id;
    if (code) await prisma.userRole.create({ data: { userId: user.id, roleId: roleId(code) } });
  }
  branchA = (await createBranch(ceo, { name: `${TAG} A`, isActive: true })).id;
  ceo.branchIds = await demoBranchIds();
  ceo.activeBranchId = branchA;
  await prisma.userBranch.createMany({
    data: [teacher, cashier].map((a) => ({ userId: a.userId, branchId: branchA })),
  });
  teacher.branchIds = [branchA];
  cashier.branchIds = [branchA];
  const courseA = (
    await createCourse(ceo, {
      branchId: branchA,
      name: `${TAG} English`,
      description: undefined,
      price: 500_000,
      durationMonths: 2,
      gradingSystemId: null,
      color: null,
    })
  ).id;
  groupA = (
    await createGroup(ceo, {
      branchId: branchA,
      name: `${TAG} GE-A`,
      courseId: courseA,
      gradingSystemId: null,
      weekdayPattern: "EVEN",
      slots: [2, 4, 6].map((weekday) => ({
        weekday,
        startTime: "10:00",
        endTime: "11:30",
        roomId: null,
      })),
      teachers: [{ userId: teacher.userId, role: "MAIN", shareType: "PERCENT", shareValue: 40 }],
      startDate: "2026-09-01",
      endDate: null,
      status: "ACTIVE",
    })
  ).id;
  const one = await addMember(ceo, groupA, {
    newStudent: { fullName: `${TAG} Student One`, phone: phone(11) },
    joinedAt: "2026-09-01",
    status: "ACTIVE",
    customPrice: null,
    note: null,
  });
  studentOne = one.studentId;
  membershipOne = one.id;
  const two = await addMember(ceo, groupA, {
    newStudent: { fullName: `${TAG} Student NoPhone` },
    joinedAt: "2026-09-01",
    status: "ACTIVE",
    customPrice: null,
    note: null,
  });
  studentNoPhone = two.studentId;
});

afterAll(async () => {
  await prisma.smsMessage.deleteMany({
    where: {
      OR: [{ id: { in: messageIds } }, { studentId: { in: [studentOne, studentNoPhone] } }],
    },
  });
  await prisma.job.deleteMany({
    where: { payload: { path: ["chatId"], string_starts_with: RUN } },
  });
  await prisma.smsTemplate.deleteMany({ where: { category: { name: { startsWith: TAG } } } });
  await prisma.smsCategory.deleteMany({ where: { name: { startsWith: TAG } } });
  await prisma.callLog.deleteMany({ where: { externalId: { startsWith: TAG } } });
  await prisma.callLog.deleteMany({ where: { studentId: studentOne } });
  await prisma.loginLog.deleteMany({ where: { phone: { startsWith: `+99895${RUN}` } } });
  await prisma.group.deleteMany({ where: { branchId: branchA } });
  await prisma.student.deleteMany({ where: { branchId: branchA } });
  await prisma.course.deleteMany({ where: { branchId: branchA } });
  await prisma.auditLog.deleteMany({ where: { branchId: branchA } });
  await prisma.user.deleteMany({ where: { phone: { startsWith: `+99895${RUN}` } } });
  await prisma.branch.delete({ where: { id: branchA } });
});

describe("pure helpers", () => {
  it("counts characters and SMS parts", () => {
    expect(smsParts("")).toEqual({ chars: 0, parts: 0 });
    expect(smsParts("Hello")).toEqual({ chars: 5, parts: 1 });
    expect(smsParts("a".repeat(161)).parts).toBe(2);
    expect(smsParts("Салом".repeat(15)).parts).toBe(2); // UCS-2: 75 chars > 70
  });

  it("renders template variables and leaves unknown ones", () => {
    expect(
      renderTemplate("Hi {studentName}, {amount} {unknown}", { studentName: "Ali", amount: "5" }),
    ).toBe("Hi Ali, 5 {unknown}");
  });

  it("validates send targets, chat ids and schedules", () => {
    expect(
      sendSmsSchema.safeParse({ target: { kind: "group", groupId: "g1" }, text: "hi" }).success,
    ).toBe(true);
    expect(
      sendSmsSchema.safeParse({ target: { kind: "students", studentIds: [] }, text: "hi" }).success,
    ).toBe(false);
    expect(botRecipientSchema.safeParse({ userId: "u", chatId: "abc" }).success).toBe(false);
    expect(botRecipientSchema.safeParse({ userId: "u", chatId: "-100123456" }).success).toBe(true);
    const bad = workScheduleSchema.safeParse({
      userId: "u",
      days: [{ weekday: 1, start: "18:00", end: "09:00" }],
    });
    expect(bad.success).toBe(false);
  });
});

describe("SMS templates", () => {
  it("creates a category and a template; the teacher can read templates", async () => {
    const category = await createSmsCategory(ceo, { name: `${TAG} Payments` });
    categoryId = category.id;
    const template = await createSmsTemplate(ceo, {
      categoryId,
      text: `${TAG} Hello {studentName}`,
    });
    templateId = template.id;
    expect(template.categoryName).toBe(`${TAG} Payments`);
    const seen = await listSmsTemplates(teacher, { categoryId });
    expect(seen.map((t) => t.id)).toContain(templateId);
    await expect(createSmsCategory(ceo, { name: `${TAG} Payments` })).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });

  it("refuses to delete a category with templates, then deletes both", async () => {
    await expect(deleteSmsCategory(ceo, categoryId)).rejects.toMatchObject({ code: "CONFLICT" });
    await deleteSmsTemplate(ceo, templateId);
    await deleteSmsCategory(ceo, categoryId);
    expect((await listSmsTemplates(ceo)).some((t) => t.id === templateId)).toBe(false);
  });

  it("imports the provider's templates once", async () => {
    const category = await createSmsCategory(ceo, { name: `${TAG} Imported` });
    const first = await importProviderTemplates(ceo, category.id);
    expect(first.adapter).toBe("fake");
    expect(first.imported).toBeGreaterThan(0);
    const again = await importProviderTemplates(ceo, category.id);
    expect(again.imported).toBe(0);
    await prisma.smsTemplate.deleteMany({ where: { categoryId: category.id } });
    await deleteSmsCategory(ceo, category.id);
  });
});

describe("sending SMS", () => {
  it("resolves a group to its members with phones", async () => {
    const { recipients, skipped } = await resolveRecipients(ceo, {
      kind: "group",
      groupId: groupA,
    });
    expect(recipients.map((r) => r.phone)).toEqual([phone(11)]);
    expect(skipped).toBe(1);
  });

  it("sends through the fake provider and logs every row", async () => {
    const before = fakeSmsOutbox.length;
    const result = await sendSms(teacher, {
      target: { kind: "group", groupId: groupA },
      text: `${TAG} manual`,
    });
    expect(result).toMatchObject({ total: 1, sent: 1, failed: 0, skipped: 1, adapter: "fake" });
    expect(fakeSmsOutbox.length).toBe(before + 1);
    const log = await listSmsLog(ceo, list, {});
    const row = log.items.find((m) => m.text === `${TAG} manual`);
    expect(row).toMatchObject({
      status: "SENT",
      recipientType: "STUDENT",
      sentByName: `${TAG} Teacher`,
    });
    messageIds.push(row!.id);
    const mine = await listStudentSms(ceo, studentOne);
    expect(mine.some((m) => m.id === row!.id)).toBe(true);
  });

  it("rejects a target without phones and a sender without the permission", async () => {
    await expect(
      sendSms(ceo, { target: { kind: "students", studentIds: [studentNoPhone] }, text: "x" }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(
      sendSms(cashier, { target: { kind: "group", groupId: groupA }, text: "x" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("auto-SMS and the job queue", () => {
  it("exposes the thirteen switches and saves them", async () => {
    const settings = await getAutoSmsSettings(ceo);
    expect(settings).toHaveLength(13);
    const absent = settings.find((s) => s.event === "ABSENT")!;
    await updateAutoSmsSettings(ceo, {
      settings: [
        {
          event: "ABSENT",
          isActive: true,
          template: `${TAG} {studentName} missed {groupName} on {date}`,
        },
      ],
    });
    const after = await getAutoSmsSettings(ceo);
    expect(after.find((s) => s.event === "ABSENT")).toMatchObject({ isActive: true });
    // restore at the end of the describe
    void absent;
  });

  it("queues a message on an absent mark once, then the worker delivers it", async () => {
    const lesson = await prisma.lesson.findFirstOrThrow({
      where: { groupId: groupA },
      orderBy: { date: "asc" },
    });
    await markAttendance(ceo, lesson.id, [{ membershipId: membershipOne, status: "ABSENT" }]);
    await markAttendance(ceo, lesson.id, [{ membershipId: membershipOne, status: "ABSENT" }]);
    const queued = await prisma.smsMessage.findMany({
      where: { refKey: `absent:${lesson.id}:${membershipOne}` },
    });
    expect(queued).toHaveLength(1);
    expect(queued[0]!.status).toBe("QUEUED");
    expect(queued[0]!.text).toContain(
      `${TAG} ${TAG} Student One missed ${TAG} GE-A on ${dateToIso(lesson.date)}`,
    );
    messageIds.push(queued[0]!.id);
    const result = await runDueJobs(100);
    expect(result.claimed).toBeGreaterThan(0);
    const delivered = await prisma.smsMessage.findUniqueOrThrow({ where: { id: queued[0]!.id } });
    expect(delivered.status).toBe("SENT");
    expect(delivered.sentById).toBeNull();
    await updateAutoSmsSettings(ceo, {
      settings: [
        { event: "ABSENT", isActive: false, template: "{studentName} {groupName} {date}" },
      ],
    });
  });

  it("skips an inactive event and a student without a phone", async () => {
    const queued = await prisma.$transaction((tx) =>
      queueAutoSms(tx, { event: "GRADES", studentId: studentOne, refKey: `${TAG}:grades` }),
    );
    expect(queued).toBe(false);
    await updateAutoSmsSettings(ceo, {
      settings: [{ event: "GRADES", isActive: true, template: "x" }],
    });
    const noPhone = await prisma.$transaction((tx) =>
      queueAutoSms(tx, { event: "GRADES", studentId: studentNoPhone, refKey: `${TAG}:grades2` }),
    );
    expect(noPhone).toBe(false);
    await updateAutoSmsSettings(ceo, {
      settings: [{ event: "GRADES", isActive: false, template: "x" }],
    });
  });

  it("deduplicates by unique key, retries failures and gives up after five attempts", async () => {
    const key = `${TAG}:daily`;
    expect(
      await enqueue(prisma, { type: "auto-sms.daily", payload: {}, uniqueKey: key }),
    ).not.toBeNull();
    expect(
      await enqueue(prisma, { type: "auto-sms.daily", payload: {}, uniqueKey: key }),
    ).toBeNull();
    await prisma.job.delete({ where: { uniqueKey: key } });
    await ensureDailyJob(prisma, "2000-01-01");
    await ensureDailyJob(prisma, "2000-01-01");
    expect(await prisma.job.count({ where: { uniqueKey: "daily:2000-01-01" } })).toBe(1);
    await prisma.job.delete({ where: { uniqueKey: "daily:2000-01-01" } });

    registerJobHandler(`${TAG}.boom`, async () => {
      throw new Error("boom");
    });
    const id = (await enqueue(prisma, { type: `${TAG}.boom`, payload: {} }))!;
    await runDueJobs(100);
    let job = await prisma.job.findUniqueOrThrow({ where: { id } });
    expect(job).toMatchObject({ status: "PENDING", attempts: 1, lastError: "boom" });
    for (let i = 0; i < 5; i++) {
      await prisma.job.update({ where: { id }, data: { runAt: new Date(0) } });
      await runDueJobs(100);
    }
    job = await prisma.job.findUniqueOrThrow({ where: { id } });
    expect(job.status).toBe("FAILED");
    await prisma.job.delete({ where: { id } });
  });
});

describe("bot recipients and Telegram", () => {
  let recipientId: string;
  const CHAT_ID = `${RUN}0001`;

  it("creates a recipient and refuses a second row for the same user", async () => {
    const row = await createBotRecipient(ceo, {
      userId: cashier.userId,
      chatId: CHAT_ID,
      branchIds: [branchA],
    });
    recipientId = row.id;
    expect(row.branchNames).toEqual([`${TAG} A`]);
    await expect(
      createBotRecipient(ceo, { userId: cashier.userId, chatId: "123456", branchIds: [] }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    expect((await listBotRecipients(ceo)).some((r) => r.id === recipientId)).toBe(true);
  });

  it("notifies only recipients listening to the branch, through the fake notifier", async () => {
    const other = await createBranch(ceo, { name: `${TAG} Other`, isActive: true });
    try {
      await prisma.$transaction((tx) =>
        notifyStaff(tx, { organizationId: DEMO_ORG_ID, branchId: other.id, text: `${TAG} nope` }),
      );
      const sent = await prisma.$transaction((tx) =>
        notifyStaff(tx, { organizationId: DEMO_ORG_ID, branchId: branchA, text: `${TAG} hello` }),
      );
      expect(sent).toBeGreaterThanOrEqual(1);
      const before = fakeTelegramOutbox.length;
      await runDueJobs(100);
      const mine = fakeTelegramOutbox.slice(before).filter((m) => m.chatId === CHAT_ID);
      expect(mine.map((m) => m.text)).toEqual([`${TAG} hello`]);
    } finally {
      await prisma.branch.delete({ where: { id: other.id } });
    }
  });

  it("deletes the recipient", async () => {
    await deleteBotRecipient(ceo, recipientId);
    expect((await listBotRecipients(ceo)).some((r) => r.id === recipientId)).toBe(false);
  });
});

describe("integration settings", () => {
  it("masks secrets, keeps them when the mask comes back, and guards webhooks", async () => {
    const previous = await prisma.integrationSetting.findFirst({
      where: { provider: "TELEPHONY" },
    });
    try {
      const saved = await updateIntegration(ceo, "TELEPHONY", {
        isEnabled: true,
        webhookSecret: `${TAG}-secret`,
      });
      expect(saved.config.webhookSecret).toBe("••••••••");
      await updateIntegration(ceo, "TELEPHONY", { isEnabled: true, webhookSecret: "••••••••" });
      const raw = await loadIntegrationConfig(prisma, "TELEPHONY", DEMO_ORG_ID);
      expect(raw?.webhookSecret).toBe(`${TAG}-secret`);
      await expect(assertWebhookSecret(prisma, "TELEPHONY", "wrong")).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      // The secret names the centre it belongs to (A-108).
      await expect(assertWebhookSecret(prisma, "TELEPHONY", `${TAG}-secret`)).resolves.toBe(
        DEMO_ORG_ID,
      );
      await updateIntegration(ceo, "TELEPHONY", { isEnabled: false, webhookSecret: "••••••••" });
      await expect(assertWebhookSecret(prisma, "TELEPHONY", `${TAG}-secret`)).rejects.toMatchObject(
        { code: "FORBIDDEN" },
      );
      await expect(getIntegration(teacher, "TELEPHONY")).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    } finally {
      if (previous) {
        await prisma.integrationSetting.update({
          where: { id: previous.id },
          data: { isEnabled: previous.isEnabled, config: previous.config ?? {} },
        });
      }
    }
  });
});

describe("calls", () => {
  it("records a webhook call linked to the student, lists and filters it", async () => {
    const dto = await recordWebhookCall(prisma, DEMO_ORG_ID, {
      externalId: `${TAG}-call-1`,
      direction: "INBOUND",
      status: "MISSED",
      from: phone(11),
      to: phone(3),
      durationSeconds: 0,
      startedAt: "2026-09-20T05:00:00.000Z",
    });
    expect(dto.studentId).toBe(studentOne);
    expect(dto.staffName).toBe(`${TAG} Cashier`);
    // Same external id again updates instead of duplicating.
    await recordWebhookCall(prisma, DEMO_ORG_ID, {
      externalId: `${TAG}-call-1`,
      direction: "INBOUND",
      status: "ANSWERED",
      from: phone(11),
      to: phone(3),
      durationSeconds: 42,
      startedAt: "2026-09-20T05:00:00.000Z",
    });
    const inbound = await listCalls(
      ceo,
      { ...list, sort: { field: "startedAt", direction: "desc" } },
      { direction: "INBOUND" },
    );
    const row = inbound.items.find((c) => c.id === dto.id);
    expect(row).toMatchObject({ status: "ANSWERED", durationSeconds: 42 });
    const outbound = await listCalls(
      ceo,
      { ...list, sort: { field: "startedAt", direction: "desc" } },
      { direction: "OUTBOUND" },
    );
    expect(outbound.items.some((c) => c.id === dto.id)).toBe(false);
  });

  it("click-to-call writes an outbound row through the fake provider", async () => {
    const call = await startCall(teacher, studentOne, phone(11));
    expect(call).toMatchObject({ direction: "OUTBOUND", adapter: "fake", toPhone: phone(11) });
    const mine = await listStudentCalls(ceo, studentOne);
    expect(mine.some((c) => c.id === call.id)).toBe(true);
  });
});

describe("logs", () => {
  it("lists login attempts and the action feed with filters", async () => {
    await prisma.loginLog.createMany({
      data: [
        { userId: teacher.userId, phone: phone(2), success: true },
        { userId: teacher.userId, phone: phone(2), success: false },
        { phone: phone(99), success: false },
      ],
    });
    const failed = await listLoginLogs(ceo, { ...list, q: phone(2) }, { success: "false" });
    expect(failed.total).toBe(1);
    expect(failed.items[0]).toMatchObject({ phone: phone(2), success: false });
    // A failed attempt on a phone no account of this centre owns belongs to nobody here (A-108).
    const unknown = await listLoginLogs(ceo, { ...list, q: phone(99) }, {});
    expect(unknown.total).toBe(0);
    const ok = await listLoginLogs(ceo, { ...list, q: `${TAG} Teacher` }, {});
    expect(ok.items[0]).toMatchObject({ userName: `${TAG} Teacher` });

    const feed = await listActionLog(ceo, list, { entity: "SmsMessage" });
    const mine = feed.items.find(
      (r) => r.actorName === `${TAG} Teacher` && r.action === "sms.send",
    );
    expect(mine).toBeDefined();
    await expect(listActionLog(teacher, list, {})).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("staff attendance", () => {
  const monday = "2026-09-07"; // a Monday
  it("evaluates lateness against the schedule and FaceID check-ins", async () => {
    await setWorkSchedule(ceo, {
      userId: cashier.userId,
      days: [1, 2, 3, 4, 5].map((weekday) => ({ weekday, start: "09:00", end: "18:00" })),
    });
    // 09:20 local (UTC+5) on the Monday → 04:20Z
    expect(
      await recordFaceIdCheck(prisma, DEMO_ORG_ID, {
        deviceId: "t1",
        phone: phone(3),
        at: "2026-09-07T04:20:00.000Z",
        kind: "IN",
      }),
    ).toEqual({ matched: true });
    expect(
      await recordFaceIdCheck(prisma, DEMO_ORG_ID, {
        deviceId: "t1",
        phone: phone(3),
        at: "2026-09-07T12:30:00.000Z",
        kind: "OUT",
      }),
    ).toEqual({ matched: true });
    expect(
      await recordFaceIdCheck(prisma, DEMO_ORG_ID, {
        deviceId: "t1",
        phone: phone(98),
        at: "2026-09-07T04:20:00.000Z",
        kind: "IN",
      }),
    ).toEqual({ matched: false });

    const report = await getStaffAttendanceReport(ceo, {
      year: 2026,
      month: 9,
      branchId: branchA,
      date: monday,
    });
    const row = report.daily.find((r) => r.userId === cashier.userId)!;
    expect(row).toMatchObject({
      expectedIn: "09:00",
      checkIn: "09:20",
      checkOut: "17:30",
      lateMinutes: 20,
      earlyLeaveMinutes: 30,
      workedMinutes: 490,
    });
    expect(["LATE", "PRESENT"]).toContain(row.status); // depends on the seeded grace
    const sunday = report.weekly.rows
      .find((r) => r.userId === cashier.userId)!
      .days.find((d) => d.date === "2026-09-13")!;
    expect(sunday.status).toBe("NOT_WORKING_DAY");
    const teacherRow = report.daily.find((r) => r.userId === teacher.userId)!;
    expect(teacherRow.status).toBe("NOT_WORKING_DAY");
    expect(report.schedules.find((r) => r.userId === cashier.userId)!.days[1]).toMatchObject({
      start: "09:00",
      end: "18:00",
    });
    expect(report.schedules.find((r) => r.userId === cashier.userId)!.days[0]).toBeNull();
  });

  it("lets a manager fix a check and counts the month", async () => {
    await setManualCheck(ceo, {
      userId: cashier.userId,
      date: "2026-09-08",
      checkIn: "08:50",
      checkOut: "18:10",
    });
    await expect(
      setManualCheck(teacher, {
        userId: cashier.userId,
        date: "2026-09-08",
        checkIn: "08:50",
        checkOut: null,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const report = await getStaffAttendanceReport(ceo, {
      year: 2026,
      month: 9,
      branchId: branchA,
      date: "2026-09-08",
    });
    const day = report.daily.find((r) => r.userId === cashier.userId)!;
    expect(day).toMatchObject({
      checkIn: "08:50",
      checkOut: "18:10",
      status: "PRESENT",
      source: "MANUAL",
    });
    const month = report.monthly.find((r) => r.userId === cashier.userId)!;
    expect(month.presentDays).toBeGreaterThanOrEqual(1);
    expect(month.workingDays).toBeGreaterThan(month.presentDays);
  });
});
