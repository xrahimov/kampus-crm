/**
 * A running group changes its days and times (A-193) against the real database:
 * each day may have its own time, the lessons already behind the group stay as
 * they were, the group's own teacher may make the change where the centre
 * allows it, and the students hear of it on Telegram.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/rbac/default-roles";
import { groupScheduleSchema } from "@/lib/validation/groups";
import { prisma } from "@/server/db/prisma";
import type { Actor } from "@/server/rbac/authorize";
import { addGroupDayOff, removeGroupDayOff } from "@/server/services/groups/day-off.service";
import {
  canChangeSchedule,
  createGroup,
  getGroup,
  updateGroup,
  updateGroupSchedule,
} from "@/server/services/groups/groups.service";
import { markAttendance } from "@/server/services/groups/lessons.service";
import { createBranch } from "@/server/services/settings/branches.service";
import { createCourse } from "@/server/services/settings/courses.service";
import { isoToDate } from "@/server/services/settings/shared";
import { createStudent } from "@/server/services/students/students.service";

import { DEMO_ORG_ID, demoBranchIds } from "./support/tenant";

const RUN = String(Date.now() % 100_000).padStart(5, "0");
const TAG = `sch${RUN}`;
const phone = (n: number) => `+99896${RUN}${String(n).padStart(2, "0")}`;
const chatId = `${RUN}${Date.now() % 1000}`;
/* The service's "today" is the Tashkent day, so the test dates are built from it too. */
const tashkent = () => new Date(Date.now() + 5 * 60 * 60 * 1000);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const day = (offset: number) => {
  const d = tashkent();
  d.setUTCDate(d.getUTCDate() + offset);
  return iso(d);
};
const weekdayOf = (date: string) => isoToDate(date).getUTCDay() || 7;
const TODAY = day(0);
const START = day(-28);

const EVEN = [2, 4, 6].map((weekday) => ({
  weekday,
  startTime: "19:30",
  endTime: "21:30",
  roomId: null,
}));
/** kai's example: Monday 20:30, Friday 16:30. */
const MON_FRI = [
  { weekday: 1, startTime: "20:30", endTime: "22:00", roomId: null },
  { weekday: 5, startTime: "16:30", endTime: "18:00", roomId: null },
];

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
const outsider: Actor = { ...teacher, fullName: "Outsider" };

let branchId: string;
let courseId: string;
let aliceId: string;
let membershipId: string;
let teacherSwitchBefore = false;

const setTeacherSwitch = (on: boolean) =>
  prisma.orgSettings.update({
    where: { organizationId: DEMO_ORG_ID },
    data: { teacherCanChangeSchedule: on },
  });

/** Only the teacher tests put the teacher on their groups, so the others never clash (A-116). */
const newGroup = async (
  name: string,
  slots = EVEN,
  pattern: "EVEN" | "CUSTOM" = "EVEN",
  withTeacher = false,
) =>
  (
    await createGroup(ceo, {
      branchId,
      name: `${TAG} ${name}`,
      courseId,
      gradingSystemId: null,
      weekdayPattern: pattern,
      slots,
      teachers: withTeacher
        ? [{ userId: teacher.userId, role: "MAIN", shareType: "PERCENT", shareValue: 40 }]
        : [],
      startDate: START,
      endDate: day(60),
      status: "ACTIVE",
      ignoreClashes: withTeacher,
    })
  ).id;

const lessons = async (groupId: string) =>
  (await prisma.lesson.findMany({ where: { groupId }, orderBy: [{ date: "asc" }] })).map((l) => ({
    id: l.id,
    date: iso(l.date),
    weekday: weekdayOf(iso(l.date)),
    time: `${l.startTime}-${l.endTime}`,
  }));

beforeAll(async () => {
  for (const [a, n] of [
    [ceo, 1],
    [teacher, 2],
    [outsider, 3],
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
  const teacherRole = await prisma.role.findUniqueOrThrow({ where: { code: "TEACHER" } });
  for (const t of [teacher, outsider]) {
    t.branchIds = [branchId];
    await prisma.userBranch.create({ data: { userId: t.userId, branchId } });
    await prisma.userRole.create({ data: { userId: t.userId, roleId: teacherRole.id } });
  }
  courseId = (
    await createCourse(ceo, {
      branchId,
      name: `${TAG} Course`,
      description: undefined,
      price: 400_000,
      durationMonths: 3,
      gradingSystemId: null,
      color: null,
    })
  ).id;
  const settings = await prisma.orgSettings.findUniqueOrThrow({
    where: { organizationId: DEMO_ORG_ID },
  });
  teacherSwitchBefore = settings.teacherCanChangeSchedule;
});

afterAll(async () => {
  await setTeacherSwitch(teacherSwitchBefore);
  const users = [ceo, teacher, outsider].map((a) => a.userId);
  await prisma.job.deleteMany({ where: { uniqueKey: { endsWith: `:${chatId}` } } });
  await prisma.studentTelegramChat.deleteMany({ where: { chatId } });
  await prisma.auditLog.deleteMany({ where: { OR: [{ branchId }, { actorId: { in: users } }] } });
  if (aliceId) await prisma.groupMembership.deleteMany({ where: { studentId: aliceId } });
  await prisma.group.deleteMany({ where: { branchId } });
  await prisma.student.deleteMany({ where: { branchId } });
  await prisma.course.deleteMany({ where: { branchId } });
  await prisma.userBranch.deleteMany({ where: { branchId } });
  await prisma.userRole.deleteMany({ where: { userId: { in: users } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.branch.deleteMany({ where: { id: branchId } });
  await prisma.$disconnect();
});

describe("a time of its own for each day", () => {
  it("plans every lesson at its weekday's time", async () => {
    const groupId = await newGroup("Own times", MON_FRI, "CUSTOM");
    const all = await lessons(groupId);
    expect(all.length).toBeGreaterThan(20);
    expect(new Set(all.map((l) => l.weekday))).toEqual(new Set([1, 5]));
    expect(all.filter((l) => l.weekday === 1).every((l) => l.time === "20:30-22:00")).toBe(true);
    expect(all.filter((l) => l.weekday === 5).every((l) => l.time === "16:30-18:00")).toBe(true);
    const group = await getGroup(ceo, groupId);
    expect(group.slots.map((s) => `${s.weekday} ${s.startTime}`)).toEqual(["1 20:30", "5 16:30"]);
  });

  it("refuses the same weekday twice and an end before the start", () => {
    const twice = groupScheduleSchema.safeParse({
      weekdayPattern: "CUSTOM",
      slots: [MON_FRI[0], { ...MON_FRI[0], startTime: "10:00", endTime: "11:00" }],
    });
    expect(twice.success).toBe(false);
    const backwards = groupScheduleSchema.safeParse({
      weekdayPattern: "CUSTOM",
      slots: [{ weekday: 1, startTime: "20:30", endTime: "20:00", roomId: null }],
    });
    expect(backwards.success).toBe(false);
  });
});

describe("changing the times of a running group", () => {
  it("keeps the lessons already behind the group and moves the ones from today on", async () => {
    const groupId = await newGroup("Running");
    const before = await lessons(groupId);
    const past = before.filter((l) => l.date < TODAY);
    expect(past.length).toBeGreaterThanOrEqual(11);

    const updated = await updateGroup(ceo, groupId, { weekdayPattern: "CUSTOM", slots: MON_FRI });
    expect(updated.weekdayPattern).toBe("CUSTOM");

    const after = await lessons(groupId);
    // The four weeks behind the group are exactly as they were: same lessons, same times.
    expect(after.filter((l) => l.date < TODAY)).toEqual(past);
    const ahead = after.filter((l) => l.date >= TODAY);
    expect(ahead.length).toBeGreaterThan(10);
    expect(new Set(ahead.map((l) => l.weekday))).toEqual(new Set([1, 5]));
    expect(ahead.filter((l) => l.weekday === 1).every((l) => l.time === "20:30-22:00")).toBe(true);
    expect(ahead.filter((l) => l.weekday === 5).every((l) => l.time === "16:30-18:00")).toBe(true);
  });

  it("rewrites from an earlier day when one is named, and never doubles a marked day", async () => {
    const groupId = await newGroup("Corrected");
    aliceId = (
      await createStudent(ceo, {
        branchId,
        fullName: `${TAG} Alice`,
        phone: phone(11),
        birthDate: null,
        gender: "FEMALE",
        photoUrl: null,
        password: null,
        sourceId: null,
        schoolId: null,
        note: null,
        membership: { groupId, joinedAt: START, customPrice: null, note: null, status: "ACTIVE" },
      })
    ).id;
    membershipId = (
      await prisma.groupMembership.findFirstOrThrow({ where: { groupId, studentId: aliceId } })
    ).id;
    const first = (await lessons(groupId))[0]!;
    await markAttendance(ceo, first.id, [{ membershipId, status: "PRESENT" }]);

    // Same days, an hour later, from the group's first day: a set-up mistake being corrected.
    await updateGroup(ceo, groupId, {
      slots: EVEN.map((s) => ({ ...s, startTime: "20:30", endTime: "22:30" })),
      scheduleFrom: START,
    });
    const after = await lessons(groupId);
    // The marked lesson keeps its own time and its day gets no second lesson.
    expect(after.filter((l) => l.date === first.date)).toEqual([first]);
    expect(after.filter((l) => l.date !== first.date).every((l) => l.time === "20:30-22:30")).toBe(
      true,
    );
    // One lesson per day, as before.
    expect(new Set(after.map((l) => l.date)).size).toBe(after.length);
  });

  it("refuses a start day that is still ahead", async () => {
    const groupId = await newGroup("Ahead");
    await expect(
      updateGroup(ceo, groupId, { weekdayPattern: "CUSTOM", slots: MON_FRI, scheduleFrom: day(7) }),
    ).rejects.toMatchObject({ code: "VALIDATION", fields: { scheduleFrom: expect.anything() } });
  });

  it("brings back only the restored day when a day off is undone", async () => {
    const groupId = await newGroup("Day off");
    await updateGroup(ceo, groupId, { weekdayPattern: "CUSTOM", slots: MON_FRI });
    const settled = await lessons(groupId);
    const next = settled.find((l) => l.date > TODAY)!;
    const off = await addGroupDayOff(ceo, groupId, {
      date: next.date,
      reason: "Teacher away",
      notify: false,
      moveTo: null,
    });
    expect((await lessons(groupId)).some((l) => l.date === next.date)).toBe(false);
    await removeGroupDayOff(ceo, groupId, off.id);
    // The lesson is back at its day's time and the Tue/Thu/Sat past is untouched.
    const restored = await lessons(groupId);
    expect(restored.map(({ date, time }) => ({ date, time }))).toEqual(
      settled.map(({ date, time }) => ({ date, time })),
    );
  });

  it("tells the students on Telegram when asked, each day with its time", async () => {
    const groupId = await newGroup("Notice");
    await prisma.groupMembership.create({
      data: { groupId, studentId: aliceId, status: "ACTIVE", joinedAt: isoToDate(START) },
    });
    await prisma.studentTelegramChat.create({
      data: { studentId: aliceId, chatId, name: "Alice", locale: "en" },
    });
    const jobs = () =>
      prisma.job.findMany({
        where: { uniqueKey: { startsWith: `tg:schedule:${groupId}:`, endsWith: `:${chatId}` } },
      });
    // Not asked: nobody is written to.
    await updateGroup(ceo, groupId, {
      slots: EVEN.map((s) => ({ ...s, startTime: "18:00", endTime: "20:00" })),
    });
    expect(await jobs()).toHaveLength(0);
    // The same times saved again are no change, even with the box ticked.
    await updateGroup(ceo, groupId, {
      slots: EVEN.map((s) => ({ ...s, startTime: "18:00", endTime: "20:00" })),
      notifySchedule: true,
    });
    expect(await jobs()).toHaveLength(0);

    await updateGroup(ceo, groupId, {
      weekdayPattern: "CUSTOM",
      slots: MON_FRI,
      notifySchedule: true,
    });
    const sent = await jobs();
    expect(sent).toHaveLength(1);
    const text = (sent[0]!.payload as { text: string }).text;
    expect(text).toContain(`${TAG} Notice`);
    expect(text).toContain("Mon 20:30–22:00, Fri 16:30–18:00");
  });
});

describe("the group's own teacher", () => {
  it("may change the times only where the centre switched it on", async () => {
    const groupId = await newGroup("Teacher's", EVEN, "EVEN", true);
    const group = await getGroup(ceo, groupId);
    await setTeacherSwitch(false);
    expect(await canChangeSchedule(teacher, group)).toBe(false);
    expect(await canChangeSchedule(ceo, group)).toBe(true);
    await expect(
      updateGroupSchedule(teacher, groupId, { weekdayPattern: "CUSTOM", slots: MON_FRI }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    // The full edit stays closed to teachers either way.
    await expect(updateGroup(teacher, groupId, { name: "Mine now" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });

    await setTeacherSwitch(true);
    expect(await canChangeSchedule(teacher, group)).toBe(true);
    expect(await canChangeSchedule(outsider, group)).toBe(false);
    await expect(
      updateGroupSchedule(outsider, groupId, { weekdayPattern: "CUSTOM", slots: MON_FRI }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const updated = await updateGroupSchedule(teacher, groupId, {
      weekdayPattern: "CUSTOM",
      slots: MON_FRI,
    });
    expect(updated.slots.map((s) => `${s.weekday} ${s.startTime}–${s.endTime}`)).toEqual([
      "1 20:30–22:00",
      "5 16:30–18:00",
    ]);
    // Name, teachers and period are not theirs to touch through this door.
    expect(updated.name).toBe(group.name);
    expect(updated.teachers.map((t) => t.userId)).toEqual([teacher.userId]);
    expect(updated.endDate).toBe(group.endDate);
    const audit = await prisma.auditLog.findFirst({
      where: { entityId: groupId, action: "group.update", actorId: teacher.userId },
    });
    expect(audit).not.toBeNull();
  });

  it("cannot save over a clash, and not on an archived group", async () => {
    await setTeacherSwitch(true);
    const groupId = await newGroup("Clashing", EVEN, "EVEN", true);
    // Another group of the same teacher already meets on Monday evening.
    await newGroup("Busy Monday", [MON_FRI[0]!], "CUSTOM", true);
    await expect(
      updateGroupSchedule(teacher, groupId, {
        weekdayPattern: "CUSTOM",
        slots: MON_FRI,
        ignoreClashes: true,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    // A manager may decide to save it anyway.
    const saved = await updateGroupSchedule(ceo, groupId, {
      weekdayPattern: "CUSTOM",
      slots: MON_FRI,
      ignoreClashes: true,
    });
    expect(saved.weekdayPattern).toBe("CUSTOM");

    await prisma.group.update({ where: { id: groupId }, data: { status: "ARCHIVED" } });
    await expect(
      updateGroupSchedule(teacher, groupId, { weekdayPattern: "EVEN", slots: EVEN }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
