/**
 * Weekly parent report by Telegram (A-118) against the real database, inside a
 * centre of its own so the demo centre's bot settings stay untouched: every
 * chat linked to a student gets the past week's attendance, grades, homework,
 * coins and money in its language, once per Sunday, and only while the
 * centre's switch is on.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { formatMoneyUz } from "@/lib/dates";
import { prisma } from "@/server/db/prisma";
import type { Actor } from "@/server/rbac/authorize";
import { createGroup } from "@/server/services/groups/groups.service";
import { markAttendance, setGrades } from "@/server/services/groups/lessons.service";
import { setHomework } from "@/server/services/homework/homework.service";
import { updateIntegration } from "@/server/services/integrations/integrations.service";
import { createCourse } from "@/server/services/settings/courses.service";
import { createOrganization } from "@/server/services/settings/organizations.service";
import { dateToIso, isoToDate } from "@/server/services/settings/shared";
import { createStudent } from "@/server/services/students/students.service";
import { botDate } from "@/server/services/telegram/student-telegram.service";
import {
  buildWeeklyReport,
  runWeeklyReports,
  weeklyReportDue,
  weeklyReportText,
} from "@/server/services/telegram/weekly-report.service";

import { DEMO_ORG_ID, demoBranchIds } from "./support/tenant";

const RUN = String(Date.now() % 100_000).padStart(5, "0");
const TAG = `wk${RUN}`;
const phone = (n: number) => `+99897${RUN}${String(n).padStart(2, "0")}`;
const chatOf = (n: number) => `${RUN}${n}${Date.now() % 1000}`;
const shift = (iso: string, days: number) => {
  const d = isoToDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return dateToIso(d);
};
const today = new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString().slice(0, 10);
/** The last Sunday before today, so the whole reported week lies in the past. */
const sunday = (() => {
  let d = shift(today, -1);
  while (isoToDate(d).getUTCDay() !== 0) d = shift(d, -1);
  return d;
})();
const monday = shift(sunday, -6);

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
let aliceId: string;
let bobId: string;
let aliceMembershipId: string;
const aliceChat = chatOf(1);
const bobChat = chatOf(2);

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
    sharedWithAllCentres: false,
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
  // Monday, Wednesday and Friday lessons, running since the week before the reported one.
  groupId = (
    await createGroup(ceo, {
      branchId,
      name: `${TAG} Group`,
      courseId,
      gradingSystemId: null,
      weekdayPattern: "CUSTOM",
      slots: [1, 3, 5].map((weekday) => ({
        weekday,
        startTime: "10:00",
        endTime: "11:30",
        roomId: null,
      })),
      teachers: [],
      startDate: shift(monday, -7),
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
      membership: {
        groupId,
        joinedAt: shift(monday, -7),
        customPrice,
        note: null,
        status: "ACTIVE",
      },
    });
  aliceId = (await student("Alice", 11, null)).id;
  bobId = (await student("Bob", 12, 500_000)).id;
  aliceMembershipId = (
    await prisma.groupMembership.findFirstOrThrow({ where: { studentId: aliceId, groupId } })
  ).id;
  await prisma.studentTelegramChat.createMany({
    data: [
      { studentId: aliceId, chatId: aliceChat, name: "Mother", locale: "en" },
      { studentId: bobId, chatId: bobChat, name: "Отец", locale: "ru" },
    ],
  });

  // The week: present, absent, excused; two grades; homework twice, done once; coins.
  const lessons = await prisma.lesson.findMany({
    where: { groupId, date: { gte: isoToDate(monday), lte: isoToDate(sunday) } },
    orderBy: { date: "asc" },
  });
  expect(lessons).toHaveLength(3);
  const [mon, wed, fri] = lessons as [
    (typeof lessons)[0],
    (typeof lessons)[0],
    (typeof lessons)[0],
  ];
  await markAttendance(ceo, mon.id, [{ membershipId: aliceMembershipId, status: "PRESENT" }]);
  await markAttendance(ceo, wed.id, [{ membershipId: aliceMembershipId, status: "ABSENT" }]);
  await markAttendance(ceo, fri.id, [{ membershipId: aliceMembershipId, status: "EXCUSED" }]);
  await setGrades(ceo, mon.id, [{ membershipId: aliceMembershipId, score: 4 }]);
  await setGrades(ceo, wed.id, [{ membershipId: aliceMembershipId, score: 4.5 }]);
  const homework = await setHomework(ceo, mon.id, {
    text: "Read chapter 3",
    linkUrl: null,
    attachmentUrl: null,
    dueDate: null,
  });
  await setHomework(ceo, wed.id, {
    text: "Exercise 7",
    linkUrl: null,
    attachmentUrl: null,
    dueDate: null,
  });
  await prisma.homeworkSubmission.create({
    data: {
      homeworkId: homework.id,
      membershipId: aliceMembershipId,
      status: "ACCEPTED",
      note: "Done",
    },
  });
  await prisma.coinTransaction.createMany({
    data: [
      {
        studentId: aliceId,
        groupId,
        kind: "MANUAL",
        amount: 3,
        createdAt: new Date(`${shift(monday, -3)}T12:00:00+05:00`),
      },
      {
        studentId: aliceId,
        groupId,
        kind: "MANUAL",
        amount: 7,
        createdAt: new Date(`${shift(monday, 2)}T12:00:00+05:00`),
      },
    ],
  });
});

afterAll(async () => {
  // A failed set-up leaves the ids unset; an unset filter would match every centre.
  if (!organizationId) return;
  await prisma.job.deleteMany({ where: { uniqueKey: { endsWith: `:${aliceChat}` } } });
  await prisma.job.deleteMany({ where: { uniqueKey: { endsWith: `:${bobChat}` } } });
  await prisma.user.deleteMany({ where: { id: owner.userId } });
  // The centre goes with everything in it, children first where nothing cascades.
  await prisma.auditLog.deleteMany({
    where: { OR: [{ branchId }, { actor: { organizationId } }] },
  });
  await prisma.group.deleteMany({ where: { branchId } });
  await prisma.student.deleteMany({ where: { branchId } });
  await prisma.course.deleteMany({ where: { branchId } });
  await prisma.paymentMethod.deleteMany({ where: { organizationId } });
  await prisma.user.deleteMany({ where: { organizationId } });
  await prisma.branch.deleteMany({ where: { organizationId } });
  await prisma.organization.deleteMany({ where: { id: organizationId } });
  await prisma.$disconnect();
});

const jobFor = (chatId: string) =>
  prisma.job.findUnique({ where: { uniqueKey: `tg:weekly:${sunday}:${chatId}` } });
const textOf = (job: { payload: unknown } | null) =>
  (job?.payload as { text?: string })?.text ?? "";

describe("the Sunday slot", () => {
  it("is due on a Sunday from 18:00 Tashkent time, once", () => {
    // 2026-10-11 is a Sunday; 13:00 UTC is 18:00 in Tashkent.
    expect(weeklyReportDue(new Date("2026-10-11T12:59:00Z"))).toBeNull();
    expect(weeklyReportDue(new Date("2026-10-11T13:00:00Z"))).toEqual({
      date: "2026-10-11",
      key: "tg-weekly:2026-10-11",
    });
    expect(weeklyReportDue(new Date("2026-10-11T18:30:00Z"))).toEqual({
      date: "2026-10-11",
      key: "tg-weekly:2026-10-11",
    });
    expect(weeklyReportDue(new Date("2026-10-12T13:00:00Z"))).toBeNull();
  });
});

describe("the weekly report", () => {
  it("counts the week per group and formats it in the chat's language", async () => {
    const report = await buildWeeklyReport(
      prisma,
      { id: aliceId, fullName: `${TAG} Alice` },
      monday,
      sunday,
    );
    expect(report).toMatchObject({
      student: `${TAG} Alice`,
      from: monday,
      to: sunday,
      coinsEarned: 7,
      coinsTotal: 10,
      balance: 0,
    });
    expect(report!.groups).toEqual([
      {
        group: `${TAG} Group`,
        lessons: 3,
        attended: 1,
        missed: 1,
        excused: 1,
        grades: ["4", "4.5"],
        homeworkSet: 2,
        homeworkDone: 1,
      },
    ]);
    const en = weeklyReportText("en", report!).split("\n");
    expect(en[0]).toMatch(new RegExp(`^Weekly report .+ – .+: ${TAG} Alice$`));
    expect(en[1]).toBe(
      `${TAG} Group: attended 1 of 3 lessons, missed 1, excused 1; grades: 4, 4.5; homework: 1/2`,
    );
    expect(en[2]).toBe("Coins: 7 this week, 10 in all");
    expect(en[3]).toBe(
      `Balance: ${formatMoneyUz(0)}, next payment by ${botDate("en", report!.nextPaymentDate!)}`,
    );
    expect(en).toHaveLength(4);
    const uz = weeklyReportText("uz", report!).split("\n");
    expect(uz[1]).toBe(
      `${TAG} Group: 3 darsdan 1 tasida qatnashdi, 1 tasini qoldirdi, 1 tasi sababli; baholar: 4, 4.5; uy vazifasi: 1/2`,
    );

    // A quiet week: nothing marked, no coins, a debt from the custom price.
    const quiet = (await buildWeeklyReport(
      prisma,
      { id: bobId, fullName: `${TAG} Bob` },
      monday,
      sunday,
    ))!;
    expect(quiet.groups[0]).toMatchObject({ lessons: 3, attended: 0, missed: 0, grades: [] });
    expect(quiet.coinsTotal).toBe(0);
    expect(quiet.balance).toBeLessThan(0);
    const ru = weeklyReportText("ru", quiet).split("\n");
    expect(ru[0]).toMatch(/^Отчёт за неделю /);
    expect(ru[1]).toBe(`${TAG} Group: посещено 0 из 3 уроков; домашние задания: 0/2`);
    expect(ru[2]).toBe(
      `Долг: ${formatMoneyUz(-quiet.balance)}. Пожалуйста, оплатите в учебном центре или со своей страницы.`,
    );
    expect(ru).toHaveLength(3);

    // No current group, no report.
    expect(
      await buildWeeklyReport(prisma, { id: owner.userId, fullName: "Nobody" }, monday, sunday),
    ).toBeNull();
  });

  it("queues one message per chat for the Sunday, and never twice", async () => {
    const first = await runWeeklyReports(prisma, sunday);
    expect(first.queued).toBeGreaterThanOrEqual(2);
    const alice = await jobFor(aliceChat);
    expect(alice).not.toBeNull();
    expect(alice!.type).toBe("telegram.send");
    expect(alice!.payload).toMatchObject({ organizationId, chatId: aliceChat });
    expect(textOf(alice)).toContain(`${TAG} Group: attended 1 of 3 lessons`);
    expect(textOf(await jobFor(bobChat))).toContain("посещено 0 из 3 уроков");

    const again = await runWeeklyReports(prisma, sunday);
    expect(
      await prisma.job.count({ where: { uniqueKey: `tg:weekly:${sunday}:${aliceChat}` } }),
    ).toBe(1);
    expect(again.students).toBeGreaterThanOrEqual(2);
  });

  it("sends nothing while the centre's switch is off", async () => {
    await updateIntegration(ceo, "TELEGRAM", {
      isEnabled: true,
      botToken: "",
      webhookSecret: `${TAG}-hook`,
      botUsername: `${TAG}_bot`,
      weeklyReport: false,
      sharedWithAllCentres: false,
    });
    const earlier = shift(sunday, -7);
    await runWeeklyReports(prisma, earlier);
    expect(
      await prisma.job.count({ where: { uniqueKey: `tg:weekly:${earlier}:${aliceChat}` } }),
    ).toBe(0);
  });
});
