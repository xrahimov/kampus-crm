/**
 * Lesson cancellation and move with notice (A-117) against the real database:
 * a group's day off drops or moves the lesson and tells the students and their
 * parents by Telegram and auto-SMS; undoing it brings the lesson back; a branch
 * holiday does the same for every group meeting that day.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/rbac/default-roles";
import { prisma } from "@/server/db/prisma";
import type { Actor } from "@/server/rbac/authorize";
import {
  addGroupDayOff,
  listGroupDaysOff,
  removeGroupDayOff,
} from "@/server/services/groups/day-off.service";
import { createGroup } from "@/server/services/groups/groups.service";
import { getMonthGrid } from "@/server/services/groups/lessons.service";
import { createBranch } from "@/server/services/settings/branches.service";
import { createCourse } from "@/server/services/settings/courses.service";
import { createDayOff, deleteDayOff } from "@/server/services/settings/days-off.service";
import { isoToDate } from "@/server/services/settings/shared";
import { DEFAULT_AUTO_SMS, updateAutoSmsSettings } from "@/server/services/sms/auto-sms.service";
import { createStudent } from "@/server/services/students/students.service";

import { DEMO_ORG_ID, demoBranchIds } from "./support/tenant";

const RUN = String(Date.now() % 100_000).padStart(5, "0");
const TAG = `off${RUN}`;
const phone = (n: number) => `+99895${RUN}${String(n).padStart(2, "0")}`;
const chatId = `${RUN}${Date.now() % 1000}`;
const EVEN = [2, 4, 6];
const tashkent = () => new Date(Date.now() + 5 * 60 * 60 * 1000);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const day = (offset: number) => {
  const d = tashkent();
  d.setUTCDate(d.getUTCDate() + offset);
  return iso(d);
};
/** The n-th even weekday (Tue, Thu, Sat) after today. */
const evenAfter = (n: number) => {
  const d = tashkent();
  let count = 0;
  for (;;) {
    d.setUTCDate(d.getUTCDate() + 1);
    if (EVEN.includes(d.getUTCDay() || 7) && ++count === n) return iso(d);
  }
};
/** The last even weekday before today. */
const evenBefore = () => {
  const d = tashkent();
  for (;;) {
    d.setUTCDate(d.getUTCDate() - 1);
    if (EVEN.includes(d.getUTCDay() || 7)) return iso(d);
  }
};
const addDays = (date: string, n: number) => {
  const d = isoToDate(date);
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
const teacher: Actor = {
  ...ceo,
  fullName: "Teacher",
  roles: ["TEACHER"],
  permissions: [...DEFAULT_ROLE_PERMISSIONS.TEACHER],
};

let branchId: string;
let groupId: string;
let aliceId: string;
let bobId: string;

beforeAll(async () => {
  for (const [a, n] of [
    [ceo, 1],
    [teacher, 2],
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
  }
  branchId = (await createBranch(ceo, { name: `${TAG} Branch`, isActive: true })).id;
  ceo.branchIds = await demoBranchIds();
  ceo.activeBranchId = branchId;
  teacher.branchIds = [branchId];
  await prisma.userBranch.create({ data: { userId: teacher.userId, branchId } });
  const teacherRole = await prisma.role.findUniqueOrThrow({ where: { code: "TEACHER" } });
  await prisma.userRole.create({ data: { userId: teacher.userId, roleId: teacherRole.id } });
  const courseId = (
    await createCourse(ceo, {
      branchId,
      name: `${TAG} Course`,
      description: undefined,
      price: 400_000,
      durationMonths: 2,
      gradingSystemId: null,
      color: null,
    })
  ).id;
  groupId = (
    await createGroup(ceo, {
      branchId,
      name: `${TAG} Group`,
      courseId,
      gradingSystemId: null,
      weekdayPattern: "EVEN",
      slots: EVEN.map((weekday) => ({
        weekday,
        startTime: "10:00",
        endTime: "11:30",
        roomId: null,
      })),
      teachers: [{ userId: teacher.userId, role: "MAIN", shareType: "PERCENT", shareValue: 40 }],
      startDate: day(-10),
      endDate: null,
      status: "ACTIVE",
    })
  ).id;
  const student = (name: string, n: number, withPhone: boolean) =>
    createStudent(ceo, {
      branchId,
      fullName: `${TAG} ${name}`,
      phone: withPhone ? phone(n) : null,
      birthDate: null,
      gender: "MALE",
      photoUrl: null,
      password: null,
      sourceId: null,
      schoolId: null,
      note: null,
      membership: { groupId, joinedAt: day(-10), customPrice: null, note: null, status: "ACTIVE" },
    });
  aliceId = (await student("Alice", 11, true)).id;
  bobId = (await student("Bob", 12, false)).id;
  await prisma.parent.create({
    data: { studentId: aliceId, fullName: `${TAG} Mother`, phone: phone(13) },
  });
  await prisma.studentTelegramChat.create({
    data: { studentId: aliceId, chatId, name: "Alice", locale: "en" },
  });
  await updateAutoSmsSettings(ceo, {
    settings: (["LESSON_CANCELLED", "LESSON_MOVED", "LESSON_RESTORED"] as const).map((event) => ({
      event,
      isActive: true,
      template: DEFAULT_AUTO_SMS[event],
    })),
  });
});

afterAll(async () => {
  const students = [aliceId, bobId];
  const users = [ceo, teacher].map((a) => a.userId);
  const messages = await prisma.smsMessage.findMany({
    where: { studentId: { in: students } },
    select: { id: true },
  });
  for (const m of messages) {
    await prisma.job.deleteMany({
      where: { type: "sms.send", payload: { path: ["messageId"], equals: m.id } },
    });
  }
  await prisma.job.deleteMany({ where: { uniqueKey: { endsWith: `:${chatId}` } } });
  await prisma.smsMessage.deleteMany({ where: { studentId: { in: students } } });
  await prisma.studentTelegramChat.deleteMany({ where: { chatId } });
  await prisma.parent.deleteMany({ where: { studentId: { in: students } } });
  await prisma.auditLog.deleteMany({ where: { OR: [{ branchId }, { actorId: { in: users } }] } });
  await prisma.groupMembership.deleteMany({ where: { studentId: { in: students } } });
  await prisma.group.deleteMany({ where: { branchId } });
  await prisma.dayOff.deleteMany({ where: { branchId } });
  await prisma.student.deleteMany({ where: { branchId } });
  await prisma.course.deleteMany({ where: { branchId } });
  await prisma.userBranch.deleteMany({ where: { branchId } });
  await prisma.userRole.deleteMany({ where: { userId: { in: users } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.branch.deleteMany({ where: { id: branchId } });
  await prisma.$disconnect();
});

const lessonsOn = (date: string, extra?: boolean) =>
  prisma.lesson.count({
    where: { groupId, date: isoToDate(date), ...(extra === undefined ? {} : { isExtra: extra }) },
  });
const telegramJob = (key: string) => prisma.job.findUnique({ where: { uniqueKey: `tg:${key}` } });
const textOf = (job: { payload: unknown } | null) =>
  (job?.payload as { text?: string })?.text ?? "";

describe("a group's day off", () => {
  it("drops the lesson, remembers its hour and tells the students and parents", async () => {
    const date = evenAfter(1);
    expect(await lessonsOn(date)).toBe(1);
    const dto = await addGroupDayOff(ceo, groupId, {
      date,
      reason: "Teacher ill",
      notify: true,
      moveTo: null,
    });
    expect(dto).toMatchObject({ date, reason: "Teacher ill", startTime: "10:00", movedTo: null });
    expect(dto.notified).toBe(true);
    expect(await lessonsOn(date)).toBe(0);

    // Telegram: every chat linked to a student of the group, in its own language.
    const job = await telegramJob(`dayoff:${dto.id}:${chatId}`);
    expect(job).not.toBeNull();
    expect(textOf(job)).toContain(`${TAG} Group`);
    expect(textOf(job)).toContain("at 10:00–11:30 is cancelled. Teacher ill");

    // Auto-SMS: the student and the parent, through the LESSON_CANCELLED switch.
    const sms = await prisma.smsMessage.findMany({
      where: { refKey: { startsWith: `dayoff:${dto.id}:` } },
    });
    expect(sms.map((m) => [m.recipientType, m.phone, m.event]).sort()).toEqual([
      ["PARENT", phone(13), "LESSON_CANCELLED"],
      ["STUDENT", phone(11), "LESSON_CANCELLED"],
    ]);
    expect(sms[0]?.text).toContain("Teacher ill");
    expect(sms.find((m) => m.recipientType === "PARENT")?.recipientName).toBe(`${TAG} Mother`);

    // The month grid lists it; the same date cannot be taken off twice.
    const grid = await getMonthGrid(ceo, groupId, date.slice(0, 7));
    expect(grid.changes.filter((c) => c.date === date)).toMatchObject([
      { scope: "GROUP", reason: "Teacher ill", startTime: "10:00", movedTo: null },
    ]);
    expect(grid.lessons.some((l) => l.date === date)).toBe(false);
    await expect(
      addGroupDayOff(ceo, groupId, { date, reason: "Again", notify: false, moveTo: null }),
    ).rejects.toMatchObject({ code: "VALIDATION", fields: { date: ["validation.duplicate"] } });
    expect((await listGroupDaysOff(ceo, groupId)).map((d) => d.notified)).toEqual([true]);
  });

  it("moves the lesson to a new hour and says where", async () => {
    const date = evenAfter(2);
    const newDate = addDays(date, 1);
    const dto = await addGroupDayOff(ceo, groupId, {
      date,
      reason: "Room repair",
      notify: true,
      moveTo: { date: newDate, startTime: "12:00", endTime: "13:00" },
    });
    expect(dto.movedTo).toMatchObject({ date: newDate, startTime: "12:00", endTime: "13:00" });
    const lesson = await prisma.lesson.findUniqueOrThrow({ where: { id: dto.movedTo!.lessonId } });
    expect(lesson.isExtra).toBe(true);
    const grid = await getMonthGrid(ceo, groupId, newDate.slice(0, 7));
    expect(grid.lessons.find((l) => l.id === lesson.id)?.movedFrom).toBe(date);
    expect(grid.changes.find((c) => c.date === date)?.movedTo).toEqual({
      date: newDate,
      startTime: "12:00",
      endTime: "13:00",
    });
    expect(textOf(await telegramJob(`dayoff:${dto.id}:${chatId}`))).toContain("moves to");
    expect(textOf(await telegramJob(`dayoff:${dto.id}:${chatId}`))).toContain("12:00–13:00");
    const sms = await prisma.smsMessage.findFirst({
      where: { refKey: `dayoff:${dto.id}:${aliceId}` },
    });
    expect(sms?.event).toBe("LESSON_MOVED");
    expect(sms?.text).toContain(newDate);

    // Moving onto an hour the group already has is refused, and nothing is left behind.
    const other = evenAfter(3);
    await expect(
      addGroupDayOff(ceo, groupId, {
        date: other,
        reason: "x",
        notify: false,
        moveTo: { date: evenAfter(4), startTime: "10:00", endTime: "11:30" },
      }),
    ).rejects.toMatchObject({
      code: "VALIDATION",
      fields: { moveTo: ["validation.lessonExists"] },
    });
    expect(await prisma.groupDayOff.count({ where: { groupId, date: isoToDate(other) } })).toBe(0);
    expect(await lessonsOn(other, false)).toBe(1);
  });

  it("undoes a day off: the lesson is back, the moved one gone, and the families hear", async () => {
    const daysOff = await listGroupDaysOff(ceo, groupId);
    const moved = daysOff.find((d) => d.movedTo)!;
    const dropped = daysOff.find((d) => !d.movedTo)!;
    await expect(removeGroupDayOff(teacher, groupId, moved.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await removeGroupDayOff(ceo, groupId, moved.id);
    expect(await lessonsOn(moved.date, false)).toBe(1);
    expect(await prisma.lesson.count({ where: { id: moved.movedTo!.lessonId } })).toBe(0);
    expect(textOf(await telegramJob(`dayoff:${moved.id}:restored:${chatId}`))).toContain(
      "takes place after all",
    );
    const sms = await prisma.smsMessage.findFirst({
      where: { refKey: `dayoff:${moved.id}:restored:${aliceId}` },
    });
    expect(sms?.event).toBe("LESSON_RESTORED");
    expect((await listGroupDaysOff(ceo, groupId)).map((d) => d.id)).toEqual([dropped.id]);
  });

  it("tells nobody about a past date or when the switch is off", async () => {
    const past = await addGroupDayOff(ceo, groupId, {
      date: evenBefore(),
      reason: "Was off",
      notify: true,
      moveTo: null,
    });
    expect(past.notified).toBe(false);
    expect(await telegramJob(`dayoff:${past.id}:${chatId}`)).toBeNull();
    const quiet = await addGroupDayOff(ceo, groupId, {
      date: evenAfter(5),
      reason: "Quiet",
      notify: false,
      moveTo: null,
    });
    expect(quiet.notified).toBe(false);
    expect(await telegramJob(`dayoff:${quiet.id}:${chatId}`)).toBeNull();
    expect(
      await prisma.smsMessage.count({ where: { refKey: { startsWith: `dayoff:${quiet.id}` } } }),
    ).toBe(0);
  });
});

describe("a branch holiday", () => {
  it("drops that day's lessons of the branch's groups and tells them; deleting it brings them back", async () => {
    const date = evenAfter(6);
    expect(await lessonsOn(date)).toBe(1);
    const holiday = await createDayOff(ceo, {
      branchId,
      date,
      reason: "Public holiday",
      notify: true,
    });
    expect(await lessonsOn(date)).toBe(0);
    expect(textOf(await telegramJob(`holiday:${holiday.id}:${groupId}:${chatId}`))).toContain(
      "Public holiday",
    );
    const sms = await prisma.smsMessage.findFirst({
      where: { refKey: `holiday:${holiday.id}:${groupId}:${aliceId}` },
    });
    expect(sms?.event).toBe("LESSON_CANCELLED");
    expect(
      await prisma.smsMessage.count({
        where: { refKey: `holiday:${holiday.id}:${groupId}:${bobId}` },
      }),
    ).toBe(0);
    const grid = await getMonthGrid(ceo, groupId, date.slice(0, 7));
    expect(grid.changes.find((c) => c.date === date)).toMatchObject({
      scope: "BRANCH",
      reason: "Public holiday",
    });

    await deleteDayOff(ceo, holiday.id);
    expect(await lessonsOn(date, false)).toBe(1);
    expect(
      textOf(await telegramJob(`holiday:${holiday.id}:${groupId}:restored:${chatId}`)),
    ).toContain("takes place after all");
    expect(
      await prisma.smsMessage.count({
        where: { refKey: `holiday:${holiday.id}:${groupId}:restored:${aliceId}` },
      }),
    ).toBe(1);
  });
});
