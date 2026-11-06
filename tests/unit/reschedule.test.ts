/**
 * Students moving and cancelling their own 1:1 lessons (A-166) against the
 * real database: the centre's switch, the notice window, the working-hours
 * and teacher-busy checks, the day-off rows staff see, and rebooking a
 * lesson that waits for a new time.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/rbac/default-roles";
import { prisma } from "@/server/db/prisma";
import type { Actor } from "@/server/rbac/authorize";
import { addGroupDayOff, listGroupDaysOff } from "@/server/services/groups/day-off.service";
import { createGroup } from "@/server/services/groups/groups.service";
import {
  STUDENT_CANCELLED,
  STUDENT_MOVED,
  bookPortalLesson,
  cancelPortalLesson,
  getPortalSchedule,
  movePortalLesson,
  rebookPortalLesson,
} from "@/server/services/portal/reschedule.service";
import { createBranch } from "@/server/services/settings/branches.service";
import { setAvailability } from "@/server/services/staff/availability.service";
import { createCourse } from "@/server/services/settings/courses.service";
import { getOrgSettings, updateOrgSettings } from "@/server/services/settings/org-settings.service";
import { isoToDate } from "@/server/services/settings/shared";
import { createStudent } from "@/server/services/students/students.service";
import { listStudentLinks } from "@/server/services/video/video.service";

import { DEMO_ORG_ID, demoBranchIds } from "./support/tenant";

const RUN = String(Date.now() % 100_000).padStart(5, "0");
const TAG = `rs${RUN}`;
const phone = (n: number) => `+99896${RUN}${String(n).padStart(2, "0")}`;
const tashkent = () => new Date(Date.now() + 5 * 60 * 60 * 1000);
const iso = (d: Date) => d.toISOString().slice(0, 10);
const day = (offset: number) => {
  const d = tashkent();
  d.setUTCDate(d.getUTCDate() + offset);
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
let token: string;
let settingsBefore: Awaited<ReturnType<typeof getOrgSettings>>;

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
    membership: { groupId, joinedAt: day(-3), customPrice: null, note: null, status: "ACTIVE" },
  });

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
      weekdayPattern: "CUSTOM",
      slots: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
        weekday,
        startTime: "10:00",
        endTime: "11:30",
        roomId: null,
      })),
      teachers: [{ userId: teacher.userId, role: "MAIN", shareType: "PERCENT", shareValue: 40 }],
      startDate: day(-3),
      endDate: null,
      status: "ACTIVE",
    })
  ).id;
  await student("Solo", 11);
  token = (await listStudentLinks(ceo, groupId))[0]!.token;
  settingsBefore = await getOrgSettings(ceo);
});

afterAll(async () => {
  if (settingsBefore) await updateOrgSettings(ceo, settingsBefore);
  const users = [ceo, teacher].map((a) => a.userId);
  await prisma.job.deleteMany({ where: { uniqueKey: { contains: groupId } } });
  await prisma.auditLog.deleteMany({ where: { OR: [{ branchId }, { actorId: { in: users } }] } });
  await prisma.groupMembership.deleteMany({ where: { groupId } });
  await prisma.group.deleteMany({ where: { branchId } });
  await prisma.student.deleteMany({ where: { branchId } });
  await prisma.course.deleteMany({ where: { branchId } });
  await prisma.userBranch.deleteMany({ where: { branchId } });
  await prisma.userRole.deleteMany({ where: { userId: { in: users } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.branch.deleteMany({ where: { id: branchId } });
  await prisma.$disconnect();
});

const lessonOn = (date: string) =>
  prisma.lesson.findFirst({ where: { groupId, date: isoToDate(date) } });
const dayOffOn = (date: string) =>
  prisma.groupDayOff.findUnique({ where: { groupId_date: { groupId, date: isoToDate(date) } } });

describe("students move their 1:1 lessons (A-166)", () => {
  it("is off until the centre switches it on", async () => {
    const schedule = await getPortalSchedule(token);
    expect(schedule?.rules.enabled).toBe(false);
    expect(schedule?.upcoming.every((l) => !l.canChange)).toBe(true);
    const lesson = (await lessonOn(day(2)))!;
    await expect(
      movePortalLesson(token, lesson.id, { date: day(2), startTime: "14:00", endTime: "15:30" }),
    ).rejects.toMatchObject({ status: 403 });
  });

  it("moves a lesson inside the window, checks the new time and shows staff the day off", async () => {
    await updateOrgSettings(ceo, {
      ...settingsBefore,
      studentReschedule: true,
      studentRescheduleHours: 2,
    });
    const schedule = (await getPortalSchedule(token))!;
    expect(schedule.rules).toMatchObject({ enabled: true, hours: 2 });
    const target = schedule.upcoming.find((l) => l.date === day(2))!;
    expect(target.canChange).toBe(true);

    // Not outside working hours, not on top of the teacher's other lesson.
    await expect(
      movePortalLesson(token, target.id, { date: day(2), startTime: "21:00", endTime: "22:30" }),
    ).rejects.toMatchObject({ fields: { startTime: ["validation.outsideWorkHours"] } });
    await expect(
      movePortalLesson(token, target.id, { date: day(3), startTime: "10:30", endTime: "12:00" }),
    ).rejects.toMatchObject({ fields: { startTime: ["validation.teacherBusy"] } });

    const after = (await movePortalLesson(token, target.id, {
      date: day(2),
      startTime: "14:00",
      endTime: "15:30",
    }))!;
    const moved = after.upcoming.find((l) => l.date === day(2))!;
    expect(moved).toMatchObject({ startTime: "14:00", endTime: "15:30", canChange: true });
    expect(await prisma.lesson.count({ where: { groupId, date: isoToDate(day(2)) } })).toBe(1);
    const dayOff = (await dayOffOn(day(2)))!;
    expect(dayOff).toMatchObject({ reason: STUDENT_MOVED, movedToLessonId: moved.id });
    expect(after.cancelled).toEqual([]);
    const staff = await listGroupDaysOff(teacher, groupId);
    expect(staff.find((d) => d.date === day(2))).toMatchObject({
      reason: STUDENT_MOVED,
      movedTo: { startTime: "14:00" },
    });

    // Moving the moved lesson again just updates it.
    const again = (await movePortalLesson(token, moved.id, {
      date: day(2),
      startTime: "16:00",
      endTime: "17:30",
    }))!;
    expect(again.upcoming.find((l) => l.date === day(2))).toMatchObject({ startTime: "16:00" });
    expect((await dayOffOn(day(2)))!.movedToLessonId).toBe(moved.id);
  });

  it("offers the teacher's free slots and books extra lessons inside them (A-169)", async () => {
    // No windows yet: the student types any time, and no slot list is shown.
    expect((await getPortalSchedule(token))!).toMatchObject({ hasAvailability: false, slots: [] });

    // The CEO may set a teacher's hours; the teacher sets their own.
    await setAvailability(ceo, teacher.userId, {
      windows: [{ weekday: 1, startTime: "09:00", endTime: "12:00" }],
    });
    await expect(
      setAvailability(teacher, teacher.userId, {
        windows: [
          { weekday: 1, startTime: "14:00", endTime: "18:00" },
          { weekday: 1, startTime: "17:00", endTime: "19:00" },
        ],
      }),
    ).rejects.toMatchObject({ fields: { windows: ["validation.availabilityOverlap"] } });
    const saved = await setAvailability(teacher, teacher.userId, {
      windows: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
        weekday,
        startTime: "14:00",
        endTime: "18:00",
      })),
    });
    expect(saved).toHaveLength(7);

    const schedule = (await getPortalSchedule(token))!;
    expect(schedule.hasAvailability).toBe(true);
    expect(schedule.rules).toMatchObject({ bookingLimit: 2, bookedAhead: 0 });
    expect(schedule.slots.length).toBeGreaterThan(0);
    // Lessons are 90 minutes; every slot sits inside the windows and off the moved lesson.
    for (const s of schedule.slots) {
      expect(s.startTime >= "14:00" && s.endTime <= "18:00").toBe(true);
    }
    const dayTwo = schedule.slots.filter((s) => s.date === day(2)).map((s) => s.startTime);
    expect(dayTwo).not.toContain("16:00");
    expect(dayTwo).not.toContain("15:00");

    // Outside the windows is refused even when free.
    await expect(
      bookPortalLesson(token, { date: day(3), startTime: "12:00", endTime: "13:30" }),
    ).rejects.toMatchObject({ fields: { startTime: ["validation.outsideAvailability"] } });

    const first = schedule.slots[0]!;
    const booked = (await bookPortalLesson(token, first))!;
    expect(booked.rules.bookedAhead).toBe(1);
    expect(
      booked.upcoming.some((l) => l.date === first.date && l.startTime === first.startTime),
    ).toBe(true);
    expect(booked.slots.some((s) => s.date === first.date && s.startTime === first.startTime)).toBe(
      false,
    );
    const second = booked.slots.find((s) => s.date !== first.date)!;
    const again = (await bookPortalLesson(token, second))!;
    expect(again.rules.bookedAhead).toBe(2);
    await expect(bookPortalLesson(token, again.slots[0]!)).rejects.toMatchObject({
      status: 409,
      message: "errors.bookingLimit",
    });
    await setAvailability(teacher, teacher.userId, { windows: [] });
  });

  it("cancels a lesson, lets the student rebook it, and refuses once the window closed", async () => {
    const lesson = (await lessonOn(day(4)))!;
    const after = (await cancelPortalLesson(token, lesson.id))!;
    expect(await lessonOn(day(4))).toBeNull();
    expect(await dayOffOn(day(4))).toMatchObject({ reason: STUDENT_CANCELLED, startTime: "10:00" });
    const waiting = after.cancelled.find((c) => c.date === day(4))!;
    expect(waiting).toMatchObject({
      reason: STUDENT_CANCELLED,
      startTime: "10:00",
      endTime: "11:30",
    });

    // The teacher's own day off without a new time waits for the student too.
    await addGroupDayOff(ceo, groupId, {
      date: day(5),
      reason: "Teacher away",
      notify: false,
      moveTo: null,
    });
    const both = (await getPortalSchedule(token))!;
    expect(both.cancelled.map((c) => c.date)).toEqual([day(4), day(5)]);

    const rebooked = (await rebookPortalLesson(token, waiting.dayOffId, {
      date: day(6),
      startTime: "13:00",
      endTime: "14:30",
    }))!;
    expect(rebooked.cancelled.map((c) => c.date)).toEqual([day(5)]);
    const extra = await prisma.lesson.findFirst({
      where: { groupId, date: isoToDate(day(6)), startTime: "13:00" },
    });
    expect(extra?.isExtra).toBe(true);
    expect(await dayOffOn(day(4))).toMatchObject({
      reason: STUDENT_MOVED,
      movedToLessonId: extra!.id,
    });

    // Too late: a lesson starting within the notice cannot change any more.
    const soonAt = new Date(tashkent().getTime() + 60 * 60_000);
    const hhmm = (d: Date) => d.toISOString().slice(11, 16);
    const soon = await prisma.lesson.create({
      data: {
        groupId,
        date: isoToDate(iso(soonAt)),
        startTime: hhmm(soonAt),
        endTime: hhmm(
          new Date(
            Math.min(soonAt.getTime() + 10 * 60_000, Date.parse(`${iso(soonAt)}T23:59:00Z`)),
          ),
        ),
        isExtra: true,
      },
    });
    await expect(cancelPortalLesson(token, soon.id)).rejects.toMatchObject({ status: 409 });
    await prisma.lesson.delete({ where: { id: soon.id } });

    // A second student makes it a group: the buttons go away.
    await student("Second", 12);
    expect((await getPortalSchedule(token))!.rules.enabled).toBe(false);
  });
});
