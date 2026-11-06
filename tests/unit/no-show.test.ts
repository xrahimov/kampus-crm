/**
 * No-show in a 1:1 call (A-167) against the real database: the teacher alone
 * in the room long enough marks the only student absent once, tells them on
 * Telegram and the staff feed, and the sync carries it to the teacher's screen;
 * a student who joined, a fresh room or a group lesson leave everything alone.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/rbac/default-roles";
import { videoSyncSchema } from "@/lib/validation/video";
import { prisma } from "@/server/db/prisma";
import type { Actor } from "@/server/rbac/authorize";
import { tashkentToday } from "@/server/services/groups/day-off.service";
import { createGroup } from "@/server/services/groups/groups.service";
import { createBranch } from "@/server/services/settings/branches.service";
import { createCourse } from "@/server/services/settings/courses.service";
import { isoToDate } from "@/server/services/settings/shared";
import { createStudent } from "@/server/services/students/students.service";
import { checkRoomNoShow } from "@/server/services/video/no-show.service";
import {
  endVideoRoom,
  joinVideoRoomAsStaff,
  joinVideoRoomAsStudent,
  listStudentLinks,
  startVideoRoom,
  syncVideoPeer,
} from "@/server/services/video/video.service";

import { DEMO_ORG_ID, demoBranchIds } from "./support/tenant";

const RUN = String(Date.now() % 100_000).padStart(5, "0");
const TAG = `ns${RUN}`;
const phone = (n: number) => `+99897${RUN}${String(n).padStart(2, "0")}`;
const chatId = `${RUN}${Date.now() % 1000}`;
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
let lessonId: string;
let membershipId: string;
let studentId: string;
let token: string;

/** Pretends the call has been open for `minutes`. */
const ageRoom = (roomId: string, minutes: number) =>
  prisma.videoRoom.update({
    where: { id: roomId },
    data: { startedAt: new Date(Date.now() - minutes * 60_000) },
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
      startDate: day(-2),
      endDate: null,
      status: "ACTIVE",
    })
  ).id;
  studentId = (
    await createStudent(ceo, {
      branchId,
      fullName: `${TAG} Solo`,
      phone: phone(11),
      birthDate: null,
      gender: "MALE",
      photoUrl: null,
      password: null,
      sourceId: null,
      schoolId: null,
      note: null,
      membership: { groupId, joinedAt: day(-2), customPrice: null, note: null, status: "ACTIVE" },
    })
  ).id;
  await prisma.studentTelegramChat.create({
    data: { studentId, chatId, name: "Solo", locale: "en" },
  });
  const link = (await listStudentLinks(ceo, groupId))[0]!;
  token = link.token;
  membershipId = link.membershipId;
  // Today's lesson started at five past midnight, so it is always in the past.
  const lesson = await prisma.lesson.findFirstOrThrow({
    where: { groupId, date: isoToDate(tashkentToday()) },
  });
  lessonId = lesson.id;
  await prisma.lesson.update({
    where: { id: lessonId },
    data: { startTime: "00:05", endTime: "00:50" },
  });
});

afterAll(async () => {
  const users = [ceo, teacher].map((a) => a.userId);
  await prisma.job.deleteMany({ where: { uniqueKey: { endsWith: `:${chatId}` } } });
  await prisma.smsMessage.deleteMany({ where: { studentId } });
  await prisma.studentTelegramChat.deleteMany({ where: { chatId } });
  await prisma.auditLog.deleteMany({ where: { OR: [{ branchId }, { actorId: { in: users } }] } });
  await prisma.group.deleteMany({ where: { branchId } });
  await prisma.student.deleteMany({ where: { branchId } });
  await prisma.course.deleteMany({ where: { branchId } });
  await prisma.userBranch.deleteMany({ where: { branchId } });
  await prisma.userRole.deleteMany({ where: { userId: { in: users } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.branch.deleteMany({ where: { id: branchId } });
  await prisma.$disconnect();
});

const mark = () =>
  prisma.attendance.findUnique({ where: { lessonId_membershipId: { lessonId, membershipId } } });

describe("no-show in a 1:1 call (A-167)", () => {
  it("waits the configured minutes, then marks the student absent once and tells everyone", async () => {
    const room = await startVideoRoom(teacher, groupId, { lessonId });
    expect(await checkRoomNoShow(room.id)).toBeNull();
    await ageRoom(room.id, 5);
    expect(await checkRoomNoShow(room.id)).toBeNull();
    expect(await mark()).toBeNull();

    await ageRoom(room.id, 16);
    const host = await joinVideoRoomAsStaff(teacher, room.id);
    const synced = await syncVideoPeer(
      host.participantId,
      videoSyncSchema.parse({ secret: host.secret }),
    );
    expect(synced.noShow).not.toBeNull();
    expect((await mark())?.status).toBe("ABSENT");
    const stored = await prisma.videoRoom.findUniqueOrThrow({ where: { id: room.id } });
    expect(stored.noShowAt?.toISOString()).toBe(synced.noShow);
    const tg = await prisma.job.findUnique({
      where: { uniqueKey: `tg:no-show:${room.id}:${chatId}` },
    });
    expect(tg).not.toBeNull();
    expect((tg!.payload as { text: string }).text).toContain("15 minutes");
    const audit = await prisma.auditLog.findFirst({
      where: { action: "attendance.mark", entityId: lessonId },
    });
    expect(audit?.actorId).toBe(teacher.userId);

    // Again: the same moment, nothing new.
    const again = await checkRoomNoShow(room.id);
    expect(again?.toISOString()).toBe(synced.noShow);
    expect(
      await prisma.job.count({
        where: { uniqueKey: { startsWith: "tg:no-show:", endsWith: `:${chatId}` } },
      }),
    ).toBe(1);
    await endVideoRoom(teacher, room.id);
  });

  it("does nothing while a student has joined, or when the rule is off", async () => {
    await prisma.attendance.deleteMany({ where: { lessonId } });
    const room = await startVideoRoom(teacher, groupId, { lessonId });
    await joinVideoRoomAsStudent(token);
    await ageRoom(room.id, 30);
    expect(await checkRoomNoShow(room.id)).toBeNull();
    expect(await mark()).toBeNull();
    await endVideoRoom(teacher, room.id);

    // A room without a lesson has nothing to mark.
    const free = await startVideoRoom(teacher, groupId, { lessonId: null });
    await ageRoom(free.id, 30);
    expect(await checkRoomNoShow(free.id)).toBeNull();
    await endVideoRoom(teacher, free.id);
  });
});
