/**
 * Attendance from a video lesson (online-lessons B1, A-151), against the real
 * database: minutes online decide the proposed mark, a late join is noted, and
 * applying writes the marks through the normal attendance path.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/server/db/prisma";
import type { Actor } from "@/server/rbac/authorize";
import { createGroup } from "@/server/services/groups/groups.service";
import { addMember } from "@/server/services/groups/memberships.service";
import { createBranch } from "@/server/services/settings/branches.service";
import { createCourse } from "@/server/services/settings/courses.service";
import {
  applyCallAttendance,
  getCallAttendance,
} from "@/server/services/video/call-attendance.service";
import { DEMO_ORG_ID, demoBranchIds } from "./support/tenant";

const RUN = String(Date.now() % 100_000).padStart(5, "0");
const TAG = `ca${RUN}`;
const phone = (n: number) => `+99895${RUN}${String(n).padStart(2, "0")}`;

const ceo: Actor = {
  userId: "",
  fullName: "CEO",
  roles: ["CEO"],
  permissions: ["*"],
  organizationId: DEMO_ORG_ID,
  branchIds: [],
  activeBranchId: null,
};

let branchId: string;
let roomId: string;
let lessonId: string;
const members: Record<string, { membershipId: string; studentId: string }> = {};

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
  branchId = (await createBranch(ceo, { name: `${TAG} A`, isActive: true })).id;
  ceo.branchIds = await demoBranchIds();
  const courseId = (
    await createCourse(ceo, {
      branchId,
      name: `${TAG} English`,
      description: undefined,
      price: 300_000,
      durationMonths: 24,
      gradingSystemId: null,
      color: null,
    })
  ).id;
  const groupId = (
    await createGroup(ceo, {
      branchId,
      name: `${TAG} B1`,
      courseId,
      gradingSystemId: null,
      weekdayPattern: "EVERY_DAY",
      slots: [1, 2, 3, 4, 5, 6].map((weekday) => ({
        weekday,
        startTime: "18:00",
        endTime: "19:30",
        roomId: null,
      })),
      teachers: [],
      startDate: "2026-09-01",
      endDate: null,
      status: "ACTIVE",
    })
  ).id;
  for (const [name, n] of [
    ["Ali", 11],
    ["Vali", 12],
    ["Late", 13],
    ["Away", 14],
  ] as const) {
    const m = await addMember(ceo, groupId, {
      newStudent: { fullName: `${TAG} ${name}`, phone: phone(n) },
      joinedAt: "2026-09-01",
      status: "ACTIVE",
      customPrice: null,
      note: null,
    });
    members[name] = { membershipId: m.id, studentId: m.studentId };
  }
  const lesson = await prisma.lesson.findFirstOrThrow({
    where: { groupId },
    orderBy: { date: "asc" },
  });
  lessonId = lesson.id;
  // 18:00 Tashkent = 13:00 UTC on the lesson's day.
  const start = new Date(lesson.date.getTime() + 13 * 3600_000);
  const at = (min: number) => new Date(start.getTime() + min * 60_000);
  const room = await prisma.videoRoom.create({
    data: {
      groupId,
      lessonId,
      startedById: user.id,
      startedAt: at(-2),
      status: "ENDED",
      endedAt: at(90),
    },
  });
  roomId = room.id;
  const peer = (name: string, from: number, to: number) =>
    prisma.videoParticipant.create({
      data: {
        roomId,
        role: "STUDENT",
        studentId: members[name]!.studentId,
        displayName: name,
        secretHash: "x",
        joinedAt: at(from),
        leftAt: at(to),
        lastSeenAt: at(to),
      },
    });
  await peer("Ali", 0, 85);
  // Vali dropped and came back: 3 + 6 minutes, below the 10-minute default.
  await peer("Vali", 1, 4);
  await peer("Vali", 30, 36);
  await peer("Late", 25, 90);
});

afterAll(async () => {
  await prisma.group.deleteMany({ where: { branchId } });
  await prisma.student.deleteMany({ where: { branchId } });
});

describe("attendance from a call (B1)", () => {
  it("proposes present for enough minutes, absent otherwise, and notes a late join", async () => {
    const dto = await getCallAttendance(ceo, roomId);
    expect(dto.lessonId).toBe(lessonId);
    expect(dto.thresholdMinutes).toBeGreaterThan(0);
    const row = (name: string) =>
      dto.rows.find((r) => r.membershipId === members[name]!.membershipId)!;
    expect(row("Ali")).toMatchObject({
      minutes: 85,
      suggested: "PRESENT",
      lateMinutes: 0,
      current: null,
    });
    expect(row("Vali")).toMatchObject({ minutes: 9, suggested: "ABSENT", lateMinutes: 1 });
    expect(row("Late")).toMatchObject({ minutes: 65, suggested: "PRESENT", lateMinutes: 25 });
    expect(row("Away")).toMatchObject({ minutes: 0, suggested: "ABSENT", lateMinutes: null });
  });

  it("writes the confirmed marks with the late note, and needs the attendance right", async () => {
    await expect(
      applyCallAttendance({ ...ceo, permissions: ["groups.view"] }, roomId, []),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await applyCallAttendance(ceo, roomId, [
      { membershipId: members.Ali!.membershipId, status: "PRESENT" },
      { membershipId: members.Vali!.membershipId, status: "PRESENT" },
      { membershipId: members.Late!.membershipId, status: "PRESENT" },
      { membershipId: members.Away!.membershipId, status: "EXCUSED" },
    ]);
    const marks = await prisma.attendance.findMany({ where: { lessonId } });
    const of = (name: string) => marks.find((m) => m.membershipId === members[name]!.membershipId)!;
    expect(of("Ali")).toMatchObject({ status: "PRESENT", comment: null });
    expect(of("Vali")).toMatchObject({ status: "PRESENT", comment: null });
    expect(of("Late")).toMatchObject({ status: "PRESENT", comment: "+25 min" });
    expect(of("Away")).toMatchObject({ status: "EXCUSED" });
    const again = await getCallAttendance(ceo, roomId);
    expect(again.rows.find((r) => r.membershipId === members.Away!.membershipId)!.current).toBe(
      "EXCUSED",
    );
  });
});
