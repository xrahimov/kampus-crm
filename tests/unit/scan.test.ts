/**
 * Attendance by QR (A-139) against the real database: a badge code marks the
 * student present on their lesson of the day, a second scan says "already",
 * a lesson-scoped scan ignores other groups, and junk or a stranger's badge is
 * "unknown".
 */
import { beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/server/db/prisma";
import type { Actor } from "@/server/rbac/authorize";
import { createGroup } from "@/server/services/groups/groups.service";
import { parseBadgeCode, scanAttendance } from "@/server/services/groups/scan.service";
import { createBranch } from "@/server/services/settings/branches.service";
import { createCourse } from "@/server/services/settings/courses.service";
import { nowInTashkent } from "@/server/services/today/today.service";

import { DEMO_ORG_ID, demoBranchIds } from "./support/tenant";

const RUN = String(Date.now() % 100_000).padStart(5, "0");
const TAG = `qr${RUN}`;
const phone = (n: number) => `+99893${RUN}${String(n).padStart(2, "0")}`;

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
let groupId: string;
let otherGroupId: string;
let studentId: string;
let lessonId: string;

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
  const courseId = (
    await createCourse(ceo, {
      branchId,
      name: `${TAG} Course`,
      description: undefined,
      price: 100_000,
      durationMonths: 1,
      gradingSystemId: null,
      color: null,
    })
  ).id;
  const today = nowInTashkent().date;
  const group = (name: string) =>
    createGroup(ceo, {
      branchId,
      name,
      courseId,
      gradingSystemId: null,
      weekdayPattern: "CUSTOM",
      slots: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
        weekday,
        startTime: "09:00",
        endTime: "10:00",
        roomId: null,
      })),
      teachers: [],
      startDate: today,
      endDate: null,
      status: "ACTIVE",
    });
  groupId = (await group(`${TAG} Group`)).id;
  otherGroupId = (await group(`${TAG} Other`)).id;
  const student = await prisma.student.create({
    data: {
      branchId,
      fullName: `${TAG} Student`,
      phone: phone(10),
      memberships: {
        create: { groupId, joinedAt: new Date(`${today}T00:00:00Z`), status: "ACTIVE" },
      },
    },
  });
  studentId = student.id;
  lessonId = (
    await prisma.lesson.findFirstOrThrow({
      where: { groupId, date: new Date(`${today}T00:00:00Z`) },
    })
  ).id;
});

describe("attendance by QR", () => {
  it("reads badge codes and nothing else", () => {
    expect(parseBadgeCode("kampus:student:abc123")).toBe("abc123");
    expect(parseBadgeCode("  kampus:student:abc123\n")).toBe("abc123");
    expect(parseBadgeCode("kampus:payment:abc123")).toBeNull();
    expect(parseBadgeCode("https://example.com")).toBeNull();
    expect(parseBadgeCode("kampus:student:")).toBeNull();
  });

  it("marks the student present on their lesson of the day, once", async () => {
    const first = await scanAttendance(ceo, { code: `kampus:student:${studentId}` });
    expect(first).toMatchObject({
      status: "marked",
      studentName: `${TAG} Student`,
      groupName: `${TAG} Group`,
      lessonTime: "09:00–10:00",
      lessonId,
    });
    const mark = await prisma.attendance.findUnique({
      where: { lessonId_membershipId: { lessonId, membershipId: (await membership()).id } },
    });
    expect(mark?.status).toBe("PRESENT");
    const second = await scanAttendance(ceo, { code: `kampus:student:${studentId}` });
    expect(second.status).toBe("already");
  });

  it("scoped to a lesson, only that group's students count", async () => {
    const otherLesson = await prisma.lesson.findFirstOrThrow({ where: { groupId: otherGroupId } });
    const wrong = await scanAttendance(ceo, {
      code: `kampus:student:${studentId}`,
      lessonId: otherLesson.id,
    });
    expect(wrong).toMatchObject({ status: "noLesson", studentName: `${TAG} Student` });
    const right = await scanAttendance(ceo, { code: `kampus:student:${studentId}`, lessonId });
    expect(right.status).toBe("already");
    await expect(
      scanAttendance(ceo, { code: `kampus:student:${studentId}`, lessonId: "nope" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("answers unknown for junk and for a student outside the user's branches", async () => {
    expect((await scanAttendance(ceo, { code: "hello" })).status).toBe("unknown");
    expect((await scanAttendance(ceo, { code: "kampus:student:doesnotexist" })).status).toBe(
      "unknown",
    );
    const outsider: Actor = { ...ceo, branchIds: [], activeBranchId: null };
    expect((await scanAttendance(outsider, { code: `kampus:student:${studentId}` })).status).toBe(
      "unknown",
    );
  });
});

const membership = () => prisma.groupMembership.findFirstOrThrow({ where: { studentId, groupId } });
