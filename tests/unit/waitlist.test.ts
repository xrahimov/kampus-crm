/**
 * Waiting list (A-138) against the real database: entries queue per course in
 * order and refuse a duplicate phone, "Offer seats" texts as many as the group
 * has free seats and marks them offered (SMS only when the switch is on,
 * Telegram for a linked student), enrolling converts a lead or creates a
 * student and closes the entry, and a group of another course is refused.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/server/db/prisma";
import { fakeSmsOutbox } from "@/server/integrations/sms/provider";
import type { Actor } from "@/server/rbac/authorize";
import { createGroup } from "@/server/services/groups/groups.service";
import { createBoard, createColumn } from "@/server/services/leads/boards.service";
import { createLead, getLead } from "@/server/services/leads/leads.service";
import {
  createWaitlistEntry,
  enrolWaitlistEntry,
  getGroupWaitlist,
  listWaitlist,
  offerSeats,
  updateWaitlistEntry,
} from "@/server/services/leads/waitlist.service";
import { createBranch } from "@/server/services/settings/branches.service";
import { createCourse } from "@/server/services/settings/courses.service";
import { createRoom } from "@/server/services/settings/rooms.service";
import { updateAutoSmsSettings } from "@/server/services/sms/auto-sms.service";

import { DEMO_ORG_ID, demoBranchIds } from "./support/tenant";

const RUN = String(Date.now() % 100_000).padStart(5, "0");
const TAG = `wl${RUN}`;
const phone = (n: number) => `+99894${RUN}${String(n).padStart(2, "0")}`;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const daysFromNow = (n: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
};

const ceo: Actor = {
  userId: "",
  fullName: "CEO",
  roles: ["CEO"],
  permissions: ["*"],
  organizationId: DEMO_ORG_ID,
  branchIds: [],
  activeBranchId: null,
};

const list = (over: Partial<Parameters<typeof listWaitlist>[1]> = {}) => ({
  page: 1,
  pageSize: 50,
  skip: 0,
  take: 50,
  sort: { field: "createdAt" as const, direction: "asc" as const },
  ...over,
});

let branchId: string;
let courseId: string;
let otherCourseId: string;
let roomId: string;
let groupId: string;
let leadId: string;
let studentId: string;
const entries: Record<string, string> = {};
let smsWasActive = false;

beforeAll(async () => {
  const user = await prisma.user.create({
    data: {
      phone: phone(1),
      fullName: `${TAG} CEO`,
      passwordHash: "x",
      organizationId: DEMO_ORG_ID,
    },
  });
  ceo.userId = user.id;
  branchId = (await createBranch(ceo, { name: `${TAG} Branch`, isActive: true })).id;
  ceo.branchIds = await demoBranchIds();
  ceo.activeBranchId = branchId;
  const course = (name: string) =>
    createCourse(ceo, {
      branchId,
      name,
      description: undefined,
      price: 200_000,
      durationMonths: 3,
      gradingSystemId: null,
      color: null,
    });
  courseId = (await course(`${TAG} English`)).id;
  otherCourseId = (await course(`${TAG} Maths`)).id;
  roomId = (await createRoom(ceo, { branchId, name: `${TAG} Room`, capacity: 2 })).id;
  const board = await createBoard(ceo, { name: `${TAG} Board`, branchId });
  const column = await createColumn(ceo, board.id, { name: "New" });
  leadId = (
    await createLead(ceo, {
      columnId: column.id,
      fullName: `${TAG} Lead`,
      phones: [phone(10)],
      birthDate: null,
      age: null,
      sourceId: null,
      teacherId: null,
      referrerId: null,
      ownerId: null,
      nextContactAt: null,
      days: null,
      lessonTime: null,
      status: "NEW",
      temperature: null,
      comment: null,
    })
  ).id;
  const student = await prisma.student.create({
    data: { branchId, fullName: `${TAG} Student`, phone: phone(11) },
  });
  studentId = student.id;
  await prisma.studentTelegramChat.create({
    data: { studentId, chatId: `${TAG}-chat`, locale: "en" },
  });
  const setting = await prisma.autoSmsSetting.findUnique({
    where: { organizationId_event: { organizationId: DEMO_ORG_ID, event: "WAITLIST_OFFER" } },
  });
  smsWasActive = setting?.isActive ?? false;
});

afterAll(async () => {
  await prisma.autoSmsSetting.updateMany({
    where: { organizationId: DEMO_ORG_ID, event: "WAITLIST_OFFER" },
    data: { isActive: smsWasActive },
  });
  if (groupId) {
    await prisma.group.updateMany({ where: { id: groupId }, data: { status: "ARCHIVED" } });
  }
});

describe("waiting list", () => {
  it("queues people per course in order and refuses the same phone twice", async () => {
    const a = await createWaitlistEntry(ceo, {
      branchId,
      courseId,
      leadId,
      fullName: `${TAG} Lead`,
      phone: phone(10),
      days: "EVEN",
      lessonTime: "18:00",
    });
    const b = await createWaitlistEntry(ceo, {
      branchId,
      courseId,
      studentId,
      fullName: `${TAG} Student`,
      phone: phone(11),
    });
    const c = await createWaitlistEntry(ceo, {
      branchId,
      courseId,
      fullName: `${TAG} Walk-in`,
      phone: phone(12),
      note: "Evenings only",
    });
    const other = await createWaitlistEntry(ceo, {
      branchId,
      courseId: otherCourseId,
      fullName: `${TAG} Maths person`,
      phone: phone(13),
    });
    entries.a = a.id;
    entries.b = b.id;
    entries.c = c.id;
    entries.other = other.id;
    expect([a.position, b.position, c.position, other.position]).toEqual([1, 2, 3, 1]);
    expect(a.leadId).toBe(leadId);
    expect(b.studentId).toBe(studentId);

    await expect(
      createWaitlistEntry(ceo, { branchId, courseId, fullName: "Again", phone: phone(10) }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    const page = await listWaitlist(ceo, list(), { courseId });
    expect(page.items.map((e) => e.fullName)).toEqual([
      `${TAG} Lead`,
      `${TAG} Student`,
      `${TAG} Walk-in`,
    ]);
    expect(page.summary.waiting).toBeGreaterThanOrEqual(4);
    expect(page.summary.byCourse.find((x) => x.courseId === courseId)?.waiting).toBe(3);

    const found = await listWaitlist(ceo, list({ q: phone(12) }));
    expect(found.items.map((e) => e.id)).toEqual([c.id]);
  });

  it("offers as many seats as the group's smallest room leaves, texting and messaging them", async () => {
    groupId = (
      await createGroup(ceo, {
        branchId,
        name: `${TAG} Group`,
        courseId,
        gradingSystemId: null,
        weekdayPattern: "ODD",
        slots: [1, 3, 5].map((weekday) => ({
          weekday,
          startTime: "18:00",
          endTime: "19:30",
          roomId,
        })),
        teachers: [],
        startDate: daysFromNow(3),
        endDate: null,
        status: "ACTIVE",
      })
    ).id;
    const before = await getGroupWaitlist(ceo, groupId);
    expect(before.freeSeats).toBe(2);
    expect(before.waiting).toBe(3);
    expect(before.next.map((e) => e.id)).toEqual([entries.a, entries.b]);

    // With the SMS switch off, nobody is texted but the entries are still offered.
    await prisma.autoSmsSetting.upsert({
      where: { organizationId_event: { organizationId: DEMO_ORG_ID, event: "WAITLIST_OFFER" } },
      create: {
        organizationId: DEMO_ORG_ID,
        event: "WAITLIST_OFFER",
        template: "x",
        isActive: false,
      },
      update: { isActive: false },
    });
    expect(before.smsActive).toBe(false);
    const outboxBefore = fakeSmsOutbox.length;
    const dry = await offerSeats(ceo, groupId, { limit: 1 });
    expect(dry).toMatchObject({ offered: 1, sms: 0, telegram: 0 });
    expect(fakeSmsOutbox.length).toBe(outboxBefore);
    const afterDry = await listWaitlist(ceo, list(), { courseId });
    expect(afterDry.items.find((e) => e.id === entries.a)).toMatchObject({
      status: "OFFERED",
      position: null,
      offeredGroup: { id: groupId },
    });
    expect(afterDry.items.find((e) => e.id === entries.b)?.position).toBe(1);

    // Switch on: the next seat goes to the linked student, by SMS and Telegram.
    const settings = await updateAutoSmsSettings(ceo, {
      settings: [
        {
          event: "WAITLIST_OFFER",
          isActive: true,
          template: "{studentName}: {groupName} {days} {time} {date}",
        },
      ],
    });
    expect(settings.find((s) => s.event === "WAITLIST_OFFER")?.isActive).toBe(true);
    // One seat is left: the room takes 2 and one is already offered.
    expect((await getGroupWaitlist(ceo, groupId)).freeSeats).toBe(1);
    const result = await offerSeats(ceo, groupId, {});
    expect(result.offered).toBe(1);
    expect(result.sms).toBe(1);
    expect(result.telegram).toBe(1);
    const text = fakeSmsOutbox.at(-1)!;
    expect(text.phone).toBe(phone(11));
    expect(text.text).toContain(`${TAG} Group`);
    expect(text.text).toContain("18:00–19:30");
    expect(text.text).toContain(daysFromNow(3));
    const job = await prisma.job.findFirst({
      where: {
        type: "telegram.send",
        uniqueKey: `tg:waitlist:${entries.b}:${groupId}:${TAG}-chat`,
      },
    });
    expect(job).not.toBeNull();
    expect((job!.payload as { text: string }).text).toContain(`${TAG} Group`);

    // Both seats are spoken for: the third person waits, nobody more is offered.
    const after = await getGroupWaitlist(ceo, groupId);
    expect(after).toMatchObject({ waiting: 1, freeSeats: 0, next: [] });
    expect(await offerSeats(ceo, groupId, {})).toMatchObject({ offered: 0 });
    const audit = await prisma.auditLog.findFirst({
      where: { action: "waitlist.offer", entityId: groupId },
    });
    expect(audit).not.toBeNull();
  });

  it("enrols a lead (converting it) and a walk-in (as a new student), and closes the entries", async () => {
    const lead = await enrolWaitlistEntry(ceo, entries.a!, {
      groupId,
      joinedAt: daysFromNow(3),
      status: "NEW",
    });
    expect(lead.status).toBe("ENROLLED");
    expect((await getLead(ceo, leadId)).studentId).not.toBeNull();

    const walkIn = await enrolWaitlistEntry(ceo, entries.c!, {
      groupId,
      joinedAt: daysFromNow(3),
      status: "NEW",
    });
    expect(walkIn.status).toBe("ENROLLED");
    const student = await prisma.student.findFirst({ where: { phone: phone(12) } });
    expect(student?.fullName).toBe(`${TAG} Walk-in`);
    const members = await prisma.groupMembership.count({ where: { groupId } });
    expect(members).toBe(2);

    await expect(
      enrolWaitlistEntry(ceo, entries.a!, { groupId, joinedAt: daysFromNow(3), status: "NEW" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    // A group of another course is refused for the Maths entry.
    await expect(
      enrolWaitlistEntry(ceo, entries.other!, { groupId, joinedAt: daysFromNow(3), status: "NEW" }),
    ).rejects.toMatchObject({ code: "VALIDATION" });

    // The offered student declines, then is put back in the queue.
    const declined = await updateWaitlistEntry(ceo, entries.b!, { status: "DECLINED" });
    expect(declined.status).toBe("DECLINED");
    expect(declined.closedAt).not.toBeNull();
    const back = await updateWaitlistEntry(ceo, entries.b!, { status: "WAITING" });
    expect(back).toMatchObject({ status: "WAITING", position: 1, offeredGroup: null });
    const closed = await listWaitlist(ceo, list(), { courseId, status: "ENROLLED" });
    expect(closed.items.map((e) => e.id).sort()).toEqual([entries.a, entries.c].sort());
  });
});
