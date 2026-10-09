/**
 * Room and teacher clashes (A-116) against the real database: a group that
 * doubles a room or a teacher at an overlapping hour is refused with the list
 * of clashes, "save anyway" lets it through, only changed plans are checked on
 * update, and the same slots draw the weekly timetable of a room or a teacher.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/rbac/default-roles";
import { prisma } from "@/server/db/prisma";
import type { Actor } from "@/server/rbac/authorize";
import { findClashes, getTimetable } from "@/server/services/groups/clashes.service";
import { createGroup, updateGroup } from "@/server/services/groups/groups.service";
import { createBranch } from "@/server/services/settings/branches.service";
import { createCourse } from "@/server/services/settings/courses.service";
import { createRoom } from "@/server/services/settings/rooms.service";

import { DEMO_ORG_ID, demoBranchIds } from "./support/tenant";

const RUN = String(Date.now() % 100_000).padStart(5, "0");
const TAG = `clash${RUN}`;
const phone = (n: number) => `+99897${RUN}${String(n).padStart(2, "0")}`;
/** A Tashkent calendar day relative to today (negative = in the past). */
const day = (offset: number) => {
  const d = new Date(Date.now() + 5 * 60 * 60 * 1000);
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
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
const teacherA: Actor = {
  ...ceo,
  fullName: "Teacher A",
  roles: ["TEACHER"],
  permissions: [...DEFAULT_ROLE_PERMISSIONS.TEACHER],
};
const teacherB: Actor = { ...teacherA, fullName: "Teacher B" };

let branchId: string;
let courseId: string;
let roomA: string;
let roomB: string;
let groupOne: string;

const evenDays = (startTime: string, endTime: string, roomId: string | null) =>
  [2, 4, 6].map((weekday) => ({ weekday, startTime, endTime, roomId }));
const share = (userId: string) => ({
  userId,
  role: "MAIN" as const,
  shareType: "PERCENT" as const,
  shareValue: 40,
});
const input = (
  name: string,
  slots: ReturnType<typeof evenDays>,
  teacherIds: string[],
  startDate = day(-10),
) => ({
  branchId,
  name: `${TAG} ${name}`,
  courseId,
  gradingSystemId: null,
  weekdayPattern: "EVEN" as const,
  slots,
  teachers: teacherIds.map(share),
  startDate,
  endDate: null,
  status: "ACTIVE" as const,
});

beforeAll(async () => {
  for (const [a, n] of [
    [ceo, 1],
    [teacherA, 2],
    [teacherB, 3],
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
  for (const a of [teacherA, teacherB]) {
    a.branchIds = [branchId];
    a.activeBranchId = branchId;
  }
  await prisma.userBranch.createMany({
    data: [teacherA, teacherB].map((a) => ({ userId: a.userId, branchId })),
  });
  const teacherRole = await prisma.role.findUniqueOrThrow({ where: { code: "TEACHER" } });
  await prisma.userRole.createMany({
    data: [teacherA, teacherB].map((a) => ({ userId: a.userId, roleId: teacherRole.id })),
  });
  courseId = (
    await createCourse(ceo, {
      branchId,
      name: `${TAG} Course`,
      description: undefined,
      price: 400_000,
      durationMonths: 2,
      gradingSystemId: null,
      color: "#2D4498",
    })
  ).id;
  roomA = (await createRoom(ceo, { branchId, name: `${TAG} Room A`, capacity: 12 })).id;
  roomB = (await createRoom(ceo, { branchId, name: `${TAG} Room B`, capacity: 12 })).id;
  groupOne = (
    await createGroup(ceo, input("One", evenDays("09:00", "10:30", roomA), [teacherA.userId]))
  ).id;
});

afterAll(async () => {
  const users = [ceo, teacherA, teacherB].map((a) => a.userId);
  await prisma.auditLog.deleteMany({ where: { OR: [{ branchId }, { actorId: { in: users } }] } });
  await prisma.group.deleteMany({ where: { branchId } });
  await prisma.room.deleteMany({ where: { branchId } });
  await prisma.course.deleteMany({ where: { branchId } });
  await prisma.userBranch.deleteMany({ where: { branchId } });
  await prisma.userRole.deleteMany({ where: { userId: { in: users } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.branch.deleteMany({ where: { id: branchId } });
  await prisma.$disconnect();
});

describe("saving a group", () => {
  it("refuses the same room and the same teacher at an overlapping hour with the clash list", async () => {
    let caught: unknown;
    try {
      await createGroup(ceo, input("Dup", evenDays("10:00", "11:00", roomA), [teacherA.userId]));
    } catch (e) {
      caught = e;
    }
    expect(caught).toMatchObject({ code: "CONFLICT", message: "errors.scheduleClash" });
    const clashes = (caught as { meta: { clashes: Array<Record<string, unknown>> } }).meta.clashes;
    expect(clashes).toHaveLength(6);
    expect(clashes.filter((c) => c.kind === "ROOM").map((c) => c.weekday)).toEqual([2, 4, 6]);
    expect(clashes.filter((c) => c.kind === "TEACHER").map((c) => c.weekday)).toEqual([2, 4, 6]);
    expect(clashes[0]).toMatchObject({
      kind: "ROOM",
      weekday: 2,
      startTime: "09:00",
      endTime: "10:30",
      groupId: groupOne,
      groupName: `${TAG} One`,
      roomName: `${TAG} Room A`,
      teacherName: null,
    });
    expect(clashes.find((c) => c.kind === "TEACHER")).toMatchObject({
      roomName: null,
      teacherName: `${TAG} Teacher A`,
    });
  });

  it("lets another room and teacher, a back-to-back hour and a later period through", async () => {
    await createGroup(ceo, input("Other", evenDays("09:00", "10:30", roomB), [teacherB.userId]));
    await createGroup(ceo, input("Next", evenDays("10:30", "12:00", roomA), [teacherA.userId]));
    await createGroup(
      ceo,
      input("Later", evenDays("09:00", "10:30", roomA), [teacherA.userId], day(120)),
    );
    expect(
      await findClashes(prisma, {
        organizationId: DEMO_ORG_ID,
        slots: evenDays("09:00", "10:30", roomA),
        teacherIds: [teacherA.userId],
        startDate: day(100),
        endDate: day(110),
      }),
    ).toEqual([]);
  });

  it("saves anyway when the user says so, and skips archived groups", async () => {
    const anyway = await createGroup(ceo, {
      ...input("Anyway", evenDays("09:00", "10:30", roomA), [teacherA.userId]),
      ignoreClashes: true,
    });
    expect(anyway.name).toBe(`${TAG} Anyway`);
    // Archived groups hold no room and no teacher any more.
    await prisma.group.update({ where: { id: anyway.id }, data: { status: "ARCHIVED" } });
    const found = await findClashes(prisma, {
      organizationId: DEMO_ORG_ID,
      groupId: groupOne,
      slots: evenDays("09:00", "10:30", roomA),
      teacherIds: [teacherA.userId],
      startDate: day(-10),
      endDate: day(50),
    });
    expect(found).toEqual([]);
  });

  it("checks an update only when the schedule, the teachers or the period change", async () => {
    const next = await prisma.group.findFirstOrThrow({
      where: { branchId, name: `${TAG} Next` },
      select: { id: true },
    });
    // "Next" sits right after "One": a rename alone is not checked …
    await updateGroup(ceo, next.id, { name: `${TAG} Next renamed` });
    // … moving it onto "One" is.
    await expect(
      updateGroup(ceo, next.id, { slots: evenDays("09:30", "11:00", roomA) }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      updateGroup(ceo, next.id, { slots: evenDays("09:30", "11:00", roomA), teachers: [] }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    // A free hour with a free teacher goes through.
    const moved = await updateGroup(ceo, next.id, {
      slots: evenDays("12:00", "13:00", null),
      teachers: [share(teacherB.userId)],
    });
    expect(moved.slots.map((s) => s.startTime)).toEqual(["12:00", "12:00", "12:00"]);
    const forced = await updateGroup(ceo, next.id, {
      slots: evenDays("09:30", "11:00", roomA),
      ignoreClashes: true,
    });
    expect(forced.slots[0]?.roomName).toBe(`${TAG} Room A`);
  });
});

describe("the timetable", () => {
  it("draws one room's week for the office and lists the branch's rooms and teachers", async () => {
    const week = await getTimetable(ceo, { mode: "room", branchId, id: roomA });
    expect(week.mode).toBe("room");
    expect(week.branchId).toBe(branchId);
    expect(week.selectedId).toBe(roomA);
    expect(week.rooms.map((r) => r.name)).toEqual([`${TAG} Room A`, `${TAG} Room B`]);
    expect(week.teachers.map((t) => t.fullName).sort()).toEqual([
      `${TAG} Teacher A`,
      `${TAG} Teacher B`,
    ]);
    expect(week.workStart < week.workEnd).toBe(true);
    const names = new Set(week.blocks.map((b) => b.groupName));
    expect(names.has(`${TAG} One`)).toBe(true);
    expect(names.has(`${TAG} Next renamed`)).toBe(true);
    // "Later" starts in four months and "Anyway" is archived: neither is this week's.
    expect(names.has(`${TAG} Later`)).toBe(false);
    expect(names.has(`${TAG} Anyway`)).toBe(false);
    expect(week.blocks.filter((b) => b.groupName === `${TAG} One`)).toMatchObject([
      { weekday: 2, startTime: "09:00", endTime: "10:30", roomName: `${TAG} Room A` },
      { weekday: 4 },
      { weekday: 6 },
    ]);
    expect(week.blocks[0]).toMatchObject({
      courseName: `${TAG} Course`,
      color: "#2D4498",
      teacherNames: [`${TAG} Teacher A`],
    });
    const other = await getTimetable(ceo, { mode: "room", branchId, id: roomB });
    expect(other.blocks.map((b) => b.groupName)).toEqual(Array(3).fill(`${TAG} Other`));
  });

  it("opens on the teacher's own week and shows nobody else's", async () => {
    const mine = await getTimetable(teacherA, {});
    expect(mine.mode).toBe("teacher");
    expect(mine.branchId).toBe(branchId);
    expect(mine.selectedId).toBe(teacherA.userId);
    expect(mine.teachers.map((t) => t.id)).toEqual([teacherA.userId]);
    expect(new Set(mine.blocks.map((b) => b.groupName))).toEqual(new Set([`${TAG} One`]));
    // Asking for a colleague's week falls back to one's own.
    const theirs = await getTimetable(teacherA, { mode: "teacher", id: teacherB.userId });
    expect(theirs.selectedId).toBe(teacherA.userId);
    const byRoom = await getTimetable(teacherA, { mode: "room", id: roomA });
    expect(byRoom.blocks.map((b) => b.groupName)).toEqual(Array(3).fill(`${TAG} One`));
  });
});
