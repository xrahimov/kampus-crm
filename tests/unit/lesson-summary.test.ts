/**
 * Lesson summary to parents (A-171) against the real database, in a centre of
 * its own: closing a call queues the summary half an hour later; the summary
 * names the topic, the student's attendance and the homework with its due date,
 * goes only to linked chats, once per room, and not when the centre switched it off.
 */
import { randomInt } from "node:crypto";

import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/server/db/prisma";
import type { Actor } from "@/server/rbac/authorize";
import { createGroup } from "@/server/services/groups/groups.service";
import { markAttendance, updateLesson } from "@/server/services/groups/lessons.service";
import { setHomework } from "@/server/services/homework/homework.service";
import { updateIntegration } from "@/server/services/integrations/integrations.service";
import { createCourse } from "@/server/services/settings/courses.service";
import { createOrganization } from "@/server/services/settings/organizations.service";
import { dateToIso } from "@/server/services/settings/shared";
import { createStudent } from "@/server/services/students/students.service";
import {
  sendLessonSummaries,
  SUMMARY_DELAY_MS,
} from "@/server/services/telegram/lesson-summary.service";
import { botDate, botText } from "@/server/services/telegram/student-telegram.service";
import { endVideoRoom } from "@/server/services/video/video.service";

import { DEMO_ORG_ID, demoBranchIds } from "./support/tenant";

const RUN = String(randomInt(100_000)).padStart(5, "0");
const TAG = `ls${RUN}`;
const phone = (n: number) => `+99895${RUN}${String(n).padStart(2, "0")}`;
const CHAT = `${RUN}8${Date.now() % 1000}`;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const shift = (n: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
};

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
let lessonId: string;
let lessonDate: string;
let roomId: string;
let aliceMembershipId: string;

const telegram = (lessonSummary: boolean) =>
  updateIntegration(ceo, "TELEGRAM", {
    isEnabled: true,
    botToken: "",
    webhookSecret: `${TAG}-hook`,
    botUsername: `${TAG}_bot`,
    weeklyReport: true,
    lessonSummary,
    sharedWithAllCentres: false,
    loginClientId: "",
    loginClientSecret: "",
  });

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
  await telegram(true);
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
  groupName = `${TAG} Group`;
  groupId = (
    await createGroup(ceo, {
      branchId,
      name: groupName,
      courseId,
      gradingSystemId: null,
      weekdayPattern: "CUSTOM",
      slots: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
        weekday,
        startTime: "10:00",
        endTime: "11:30",
        roomId: null,
      })),
      teachers: [],
      startDate: shift(-3),
      endDate: null,
      status: "ACTIVE",
    })
  ).id;
  const student = (name: string, n: number) =>
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
      membership: { groupId, joinedAt: shift(-3), customPrice: null, note: null, status: "ACTIVE" },
    });
  const alice = await student("Alice", 11);
  await student("Bob", 12);
  aliceMembershipId = (
    await prisma.groupMembership.findFirstOrThrow({ where: { studentId: alice.id, groupId } })
  ).id;
  await prisma.studentTelegramChat.create({
    data: { studentId: alice.id, chatId: CHAT, name: "Ota", locale: "en" },
  });
  const lesson = await prisma.lesson.findFirstOrThrow({
    where: { groupId },
    orderBy: { date: "asc" },
  });
  lessonId = lesson.id;
  lessonDate = dateToIso(lesson.date);
  await updateLesson(ceo, lessonId, { topic: "Past simple" });
  await setHomework(ceo, lessonId, {
    text: "Exercises 1 to 5 on page 40",
    linkUrl: null,
    attachmentUrl: null,
    dueDate: shift(3),
  });
  await markAttendance(ceo, lessonId, [{ membershipId: aliceMembershipId, status: "PRESENT" }]);
  roomId = (
    await prisma.videoRoom.create({
      data: { groupId, lessonId, startedById: ceo.userId, status: "LIVE" },
    })
  ).id;
});

afterAll(async () => {
  if (!organizationId) return;
  await prisma.job.deleteMany({
    where: {
      OR: [{ uniqueKey: { endsWith: `:${CHAT}` } }, { uniqueKey: `lesson-summary:${roomId}` }],
    },
  });
  await prisma.user.deleteMany({ where: { id: owner.userId } });
  await prisma.auditLog.deleteMany({
    where: { OR: [{ branchId }, { organizationId }, { actor: { organizationId } }] },
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

describe("lesson summary to parents", () => {
  it("ending the call queues the summary half an hour later, once", async () => {
    const before = Date.now();
    await endVideoRoom(ceo, roomId);
    const job = await prisma.job.findUniqueOrThrow({
      where: { uniqueKey: `lesson-summary:${roomId}` },
    });
    expect(job.type).toBe("lesson.summary");
    expect(job.payload).toEqual({ roomId });
    const delay = job.runAt.getTime() - before;
    expect(delay).toBeGreaterThan(SUMMARY_DELAY_MS - 60_000);
    expect(delay).toBeLessThanOrEqual(SUMMARY_DELAY_MS + 60_000);
    // Ending again changes nothing.
    await endVideoRoom(ceo, roomId);
    expect(await prisma.job.count({ where: { uniqueKey: `lesson-summary:${roomId}` } })).toBe(1);
  });

  it("tells the linked chat the topic, the attendance and the homework, and only once", async () => {
    expect(await sendLessonSummaries(prisma, roomId)).toBe(1);
    const sent = await prisma.job.findMany({
      where: { type: "telegram.send", uniqueKey: { startsWith: `tg:lesson-summary:${roomId}:` } },
    });
    expect(sent).toHaveLength(1);
    expect(sent[0]!.uniqueKey?.endsWith(`:${CHAT}`)).toBe(true);
    const text = (sent[0]!.payload as { text: string }).text;
    expect(text).toBe(
      botText("en", "lessonSummary", {
        group: groupName,
        date: botDate("en", lessonDate),
        time: "10:00–11:30",
        topic: "Past simple",
        attendance: "PRESENT",
        homework: "Exercises 1 to 5 on page 40",
        due: botDate("en", shift(3)),
      }),
    );
    expect(text).toContain("present ✅");
    expect(text).toContain("Exercises 1 to 5 on page 40");
    // Run again (a retried job): nothing new.
    expect(await sendLessonSummaries(prisma, roomId)).toBe(0);
  });

  it("stays quiet when the centre switched the summary off or the room has no lesson", async () => {
    const bare = await prisma.videoRoom.create({
      data: { groupId, startedById: ceo.userId, status: "ENDED", endedAt: new Date() },
    });
    expect(await sendLessonSummaries(prisma, bare.id)).toBe(0);
    await telegram(false);
    const again = await prisma.videoRoom.create({
      data: { groupId, lessonId, startedById: ceo.userId, status: "ENDED", endedAt: new Date() },
    });
    expect(await sendLessonSummaries(prisma, again.id)).toBe(0);
    await telegram(true);
    expect(await sendLessonSummaries(prisma, again.id)).toBe(1);
    await prisma.job.deleteMany({
      where: { uniqueKey: { startsWith: `tg:lesson-summary:${again.id}:` } },
    });
  });
});
