/**
 * Time zones for students abroad (A-177): the conversions, the student page
 * in the student's zone, the reminder text and setting the zone from the page.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  isValidTimeZone,
  lessonInZone,
  slotInZone,
  timeZoneLabel,
  utcToZoned,
  zonedToUtc,
} from "@/lib/time-zones";
import { prisma } from "@/server/db/prisma";
import type { Actor } from "@/server/rbac/authorize";
import { createGroup } from "@/server/services/groups/groups.service";
import { addMember } from "@/server/services/groups/memberships.service";
import { getPortal, setPortalTimeZone } from "@/server/services/portal/portal.service";
import { createBranch } from "@/server/services/settings/branches.service";
import { createCourse } from "@/server/services/settings/courses.service";
import { getStudent, updateStudent } from "@/server/services/students/students.service";
import { lessonTimesFor } from "@/server/services/telegram/student-telegram.service";
import { getClassPage, listStudentLinks } from "@/server/services/video/video.service";

import { DEMO_ORG_ID, demoBranchIds } from "./support/tenant";

const RUN = String(Date.now() % 100_000).padStart(5, "0");
const TAG = `tz${RUN}`;
const daysAgo = (n: number) => {
  const d = new Date(Date.now() + 5 * 60 * 60 * 1000);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};

describe("conversions", () => {
  it("knows real zones and rejects made-up ones", () => {
    expect(isValidTimeZone("Europe/Berlin")).toBe(true);
    expect(isValidTimeZone("Asia/Tashkent")).toBe(true);
    expect(isValidTimeZone("Mars/Olympus")).toBe(false);
    expect(isValidTimeZone("not a zone")).toBe(false);
    expect(timeZoneLabel("Asia/Tashkent")).toBe("Asia/Tashkent (GMT+5)");
  });

  it("turns a Tashkent wall clock into an instant and back", () => {
    const at = zonedToUtc("2026-11-06", "19:30", "Asia/Tashkent");
    expect(at.toISOString()).toBe("2026-11-06T14:30:00.000Z");
    expect(utcToZoned(at, "Asia/Tashkent")).toEqual({
      date: "2026-11-06",
      time: "19:30",
      weekday: 5,
    });
    // Across a DST change in the target zone (Berlin leaves summer time on 2026-10-25).
    expect(zonedToUtc("2026-10-24", "12:00", "Europe/Berlin").toISOString()).toBe(
      "2026-10-24T10:00:00.000Z",
    );
    expect(zonedToUtc("2026-10-26", "12:00", "Europe/Berlin").toISOString()).toBe(
      "2026-10-26T11:00:00.000Z",
    );
  });

  it("shows a centre lesson in the student's zone, with the day shift", () => {
    const berlin = lessonInZone(
      { date: "2026-11-06", startTime: "19:30", endTime: "21:30" },
      "Europe/Berlin",
    );
    expect(berlin).toEqual({
      date: "2026-11-06",
      startTime: "15:30",
      endTime: "17:30",
      dayShift: 0,
    });
    // New York is ten hours behind in winter: an evening lesson is the same afternoon...
    expect(
      lessonInZone(
        { date: "2026-11-06", startTime: "19:30", endTime: "21:30" },
        "America/New_York",
      ),
    ).toMatchObject({ date: "2026-11-06", startTime: "09:30", dayShift: 0 });
    // ...and a morning lesson lands on the evening before.
    expect(
      lessonInZone(
        { date: "2026-11-06", startTime: "08:00", endTime: "09:00" },
        "America/New_York",
      ),
    ).toEqual({ date: "2026-11-05", startTime: "22:00", endTime: "23:00", dayShift: -1 });
    // Tokyo is four hours ahead: a late lesson slips into the next day.
    expect(
      lessonInZone({ date: "2026-11-06", startTime: "21:00", endTime: "22:30" }, "Asia/Tokyo"),
    ).toEqual({ date: "2026-11-07", startTime: "01:00", endTime: "02:30", dayShift: 1 });
  });

  it("moves a weekly slot to the right weekday in the student's zone", () => {
    const from = new Date("2026-11-04T06:00:00Z");
    // Tuesday 08:00 in Tashkent is Monday 22:00 in New York.
    expect(
      slotInZone({ weekday: 2, startTime: "08:00", endTime: "09:00" }, "America/New_York", from),
    ).toEqual({ weekday: 1, startTime: "22:00", endTime: "23:00" });
    // Sunday 21:00 in Tashkent is Monday 01:00 in Tokyo.
    expect(
      slotInZone({ weekday: 7, startTime: "21:00", endTime: "22:00" }, "Asia/Tokyo", from),
    ).toEqual({ weekday: 1, startTime: "01:00", endTime: "02:00" });
    expect(
      slotInZone({ weekday: 3, startTime: "19:30", endTime: "21:00" }, "Europe/Berlin", from),
    ).toEqual({ weekday: 3, startTime: "15:30", endTime: "17:00" });
  });

  it("writes reminder times in the student's zone and names it", () => {
    const lesson = { date: "2026-11-06", startTime: "19:30", endTime: "21:30" };
    expect(lessonTimesFor(lesson, { timeZone: null })).toEqual({
      start: "19:30",
      end: "21:30",
      date: "2026-11-06",
    });
    expect(lessonTimesFor(lesson, { timeZone: "Asia/Tashkent" }).end).toBe("21:30");
    expect(lessonTimesFor(lesson, { timeZone: "Europe/Berlin" })).toEqual({
      start: "15:30",
      end: "17:30 (Europe/Berlin)",
      date: "2026-11-06",
    });
  });
});

describe("the student's page in their zone", () => {
  const ceo: Actor = {
    userId: "",
    fullName: `${TAG} CEO`,
    roles: ["CEO"],
    permissions: ["*"],
    organizationId: DEMO_ORG_ID,
    branchIds: [],
    activeBranchId: null,
  };
  let branchId: string;
  let groupId: string;
  let studentId: string;
  let token: string;

  beforeAll(async () => {
    const user = await prisma.user.create({
      data: {
        phone: `+99894${RUN}01`,
        fullName: ceo.fullName,
        passwordHash: "x",
        organizationId: DEMO_ORG_ID,
      },
    });
    ceo.userId = user.id;
    branchId = (await createBranch(ceo, { name: `${TAG} Branch`, isActive: true })).id;
    ceo.branchIds = await demoBranchIds();
    ceo.activeBranchId = branchId;
    const courseId = (
      await createCourse(ceo, {
        branchId,
        name: `${TAG} Course`,
        description: undefined,
        price: 100_000,
        durationMonths: 2,
        gradingSystemId: null,
        color: "#0F766E",
      })
    ).id;
    // A lesson every day at 08:00 Tashkent: in New York that is the evening before.
    groupId = (
      await createGroup(ceo, {
        branchId,
        name: `${TAG} Group`,
        courseId,
        gradingSystemId: null,
        weekdayPattern: "CUSTOM",
        slots: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
          weekday,
          startTime: "08:00",
          endTime: "09:00",
          roomId: null,
        })),
        teachers: [],
        startDate: daysAgo(10),
        endDate: null,
        status: "ACTIVE",
      })
    ).id;
    const member = await addMember(ceo, groupId, {
      newStudent: { fullName: `${TAG} Student`, phone: `+99894${RUN}02` },
      joinedAt: daysAgo(10),
      status: "ACTIVE",
    });
    studentId = member.studentId;
    token = (await listStudentLinks(ceo, groupId))[0]!.token;
  });

  afterAll(async () => {
    await prisma.auditLog.deleteMany({ where: { OR: [{ branchId }, { actorId: ceo.userId }] } });
    await prisma.groupMembership.deleteMany({ where: { studentId } });
    await prisma.group.deleteMany({ where: { branchId } });
    await prisma.student.deleteMany({ where: { branchId } });
    await prisma.course.deleteMany({ where: { branchId } });
    await prisma.user.deleteMany({ where: { id: ceo.userId } });
    await prisma.branch.deleteMany({ where: { id: branchId } });
    await prisma.$disconnect();
  });

  it("keeps the centre's time until a zone is set, then converts page and schedule", async () => {
    let portal = (await getPortal(token))!;
    expect(portal.student.timeZone).toBeNull();
    expect(portal.nextLesson?.local).toBeNull();
    let page = (await getClassPage(token))!;
    expect(page.timeZone).toBeNull();
    expect(page.localSchedule).toBeNull();

    expect(await setPortalTimeZone(token, "America/New_York")).toBe(true);
    portal = (await getPortal(token))!;
    expect(portal.student.timeZone).toBe("America/New_York");
    expect(portal.nextLesson?.startTime).toBe("08:00");
    expect(portal.nextLesson?.local).toMatchObject({ startTime: "22:00", dayShift: -1 });
    // Lessons before New York left summer time (1 November) fall at 23:00 there.
    expect(
      portal.lessons.every(
        (l) => l.local?.dayShift === -1 && ["22:00", "23:00"].includes(l.local.startTime),
      ),
    ).toBe(true);
    page = (await getClassPage(token))!;
    expect(page.timeZone).toBe("America/New_York");
    expect(page.localSchedule?.map((s) => s.startTime)).toEqual(Array(7).fill("22:00"));
    expect(page.schedule.map((s) => s.startTime)).toEqual(Array(7).fill("08:00"));

    // Staff see and may change it on the student card; empty means the centre's time again.
    expect((await getStudent(ceo, studentId)).timeZone).toBe("America/New_York");
    await updateStudent(ceo, studentId, { timeZone: "Europe/Berlin" });
    expect((await getPortal(token))!.nextLesson?.local?.startTime).toBe("04:00");
    await updateStudent(ceo, studentId, { timeZone: null });
    expect((await getPortal(token))!.student.timeZone).toBeNull();
    expect(await setPortalTimeZone("x".repeat(24), "Europe/Berlin")).toBe(false);
  });
});
