/**
 * The lesson link a teacher copies inside the video lesson (A-195), against the
 * real database: it is no credential, a signed-in student of the group lands on
 * their own page, a parent on their child's, anybody else nowhere, and a staff
 * member in the running call.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/rbac/default-roles";
import { isLessonLinkId, lessonLink, lessonLinkGroupId, lessonLinkPath } from "@/lib/lesson-link";
import { prisma } from "@/server/db/prisma";
import type { Actor } from "@/server/rbac/authorize";
import { createGroup } from "@/server/services/groups/groups.service";
import { addMember } from "@/server/services/groups/memberships.service";
import { createBranch } from "@/server/services/settings/branches.service";
import { createCourse } from "@/server/services/settings/courses.service";
import {
  accountForIdentity,
  createStudentSession,
  resolveStudentSession,
  safeNext,
  type StudentPrincipal,
} from "@/server/services/student-auth/student-auth.service";
import {
  lessonLinkStaffPath,
  lessonLinkTokenFor,
} from "@/server/services/video/lesson-link.service";
import { DEMO_ORG_ID, demoBranchIds } from "./support/tenant";

const RUN = String(Date.now() % 100_000).padStart(5, "0");
const TAG = `ll${RUN}`;
const phone = (n: number) => `+99895${RUN}${String(n).padStart(2, "0")}`;
const digits = (n: number) => phone(n).slice(1);
const tg = (n: number) => `6${RUN}${String(n).padStart(3, "0")}`;

const actor = (fullName: string, roles: string[], permissions: string[]): Actor => ({
  userId: "",
  fullName,
  roles,
  permissions,
  organizationId: DEMO_ORG_ID,
  branchIds: [],
  activeBranchId: null,
});
const ceo = actor("CEO", ["CEO"], ["*"]);
const teacher = actor("Teacher", ["TEACHER"], [...DEFAULT_ROLE_PERMISSIONS.TEACHER]);
const otherTeacher = actor("Other", ["TEACHER"], [...DEFAULT_ROLE_PERMISSIONS.TEACHER]);

let groupA: string;
let groupB: string;
let ali: { studentId: string; membershipId: string };
let vali: { studentId: string; membershipId: string };
let sami: { studentId: string; membershipId: string };

/** Signs a Telegram account in the way the login does and returns who the session is. */
async function signedIn(n: number, phoneNo: string): Promise<StudentPrincipal> {
  const account = await prisma.$transaction((tx) =>
    accountForIdentity(
      tx,
      {
        telegramUserId: tg(n),
        name: `${TAG} TG ${n}`,
        username: `${TAG}_${n}`,
        photoUrl: null,
        phone: phoneNo,
      },
      null,
    ),
  );
  const token = await createStudentSession(prisma, account.id, {});
  return (await resolveStudentSession(prisma, token))!;
}

beforeAll(async () => {
  const roleId = (await prisma.role.findFirstOrThrow({ where: { code: "TEACHER" } })).id;
  for (const [a, n, isTeacher] of [
    [ceo, 1, false],
    [teacher, 2, true],
    [otherTeacher, 3, true],
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
    if (isTeacher) await prisma.userRole.create({ data: { userId: user.id, roleId } });
  }
  const branchId = (await createBranch(ceo, { name: `${TAG} A`, isActive: true })).id;
  ceo.branchIds = await demoBranchIds();
  await prisma.userBranch.createMany({
    data: [teacher, otherTeacher].map((a) => ({ userId: a.userId, branchId })),
  });
  for (const a of [teacher, otherTeacher]) a.branchIds = [branchId];
  const courseId = (
    await createCourse(ceo, {
      branchId,
      name: `${TAG} English`,
      description: undefined,
      price: 300_000,
      durationMonths: 12,
      gradingSystemId: null,
      color: null,
    })
  ).id;
  const group = async (name: string, teacherId: string) =>
    (
      await createGroup(ceo, {
        branchId,
        name: `${TAG} ${name}`,
        courseId,
        gradingSystemId: null,
        weekdayPattern: "ODD",
        slots: [1, 3, 5].map((weekday) => ({
          weekday,
          startTime: "18:00",
          endTime: "19:30",
          roomId: null,
        })),
        teachers: [{ userId: teacherId, role: "MAIN", shareType: "PERCENT", shareValue: 40 }],
        startDate: "2026-09-01",
        endDate: null,
        status: "ACTIVE",
      })
    ).id;
  groupA = await group("A1", teacher.userId);
  groupB = await group("B1", otherTeacher.userId);
  const member = async (groupId: string, name: string, n: number) => {
    const m = await addMember(ceo, groupId, {
      newStudent: { fullName: `${TAG} ${name}`, phone: phone(n) },
      joinedAt: "2026-09-01",
      status: "ACTIVE",
      customPrice: null,
      note: null,
    });
    return { studentId: m.studentId, membershipId: m.id };
  };
  ali = await member(groupA, "Ali", 11);
  vali = await member(groupA, "Vali", 12);
  sami = await member(groupB, "Sami", 13);
  await prisma.parent.create({
    data: { studentId: vali.studentId, fullName: `${TAG} Mum`, phone: phone(21) },
  });
});

afterAll(async () => {
  await prisma.studentAccount.deleteMany({ where: { telegramUserId: { startsWith: `6${RUN}` } } });
  await prisma.videoRoom.deleteMany({ where: { groupId: { in: [groupA, groupB] } } });
});

describe("the lesson link's address (A-195)", () => {
  it("names the group and nothing else, and survives the sign-in", () => {
    expect(lessonLinkPath(groupA)).toBe(`/student/lesson/${groupA}`);
    expect(lessonLink("https://kampus.example/", groupA)).toBe(
      `https://kampus.example/student/lesson/${groupA}`,
    );
    // The login keeps the address as the place to land afterwards.
    expect(safeNext(lessonLinkPath(groupA))).toBe(lessonLinkPath(groupA));
    expect(lessonLinkGroupId(lessonLinkPath(groupA))).toBe(groupA);
    expect(lessonLinkGroupId(`/uz/student/lesson/${groupA}`)).toBe(groupA);
    expect(lessonLinkGroupId("/student")).toBeNull();
    expect(lessonLinkGroupId(`/student/lesson/${groupA}/x`)).toBeNull();
    expect(lessonLinkGroupId(null)).toBeNull();
    expect(isLessonLinkId("../../login")).toBe(false);
    expect(isLessonLinkId("short")).toBe(false);
  });
});

describe("who a lesson link lets in (A-195)", () => {
  it("takes a student of the group to their own page, also before they ever had a personal link", async () => {
    const before = await prisma.groupMembership.findUniqueOrThrow({
      where: { id: ali.membershipId },
      select: { videoToken: true },
    });
    expect(before.videoToken).toBeNull();
    const principal = await signedIn(1, digits(11));
    const token = await lessonLinkTokenFor(principal, groupA);
    expect(token).toMatch(/^[A-Za-z0-9_-]{20,64}$/);
    const after = await prisma.groupMembership.findUniqueOrThrow({
      where: { id: ali.membershipId },
      select: { videoToken: true },
    });
    expect(after.videoToken).toBe(token);
    // The same page every time.
    await expect(lessonLinkTokenFor(principal, groupA)).resolves.toBe(token);
  });

  it("takes a parent to their child's page", async () => {
    const principal = await signedIn(2, digits(21));
    expect(principal.childIds).toEqual([vali.studentId]);
    const token = await lessonLinkTokenFor(principal, groupA);
    const row = await prisma.groupMembership.findUniqueOrThrow({
      where: { id: vali.membershipId },
      select: { videoToken: true },
    });
    expect(token).toBe(row.videoToken);
  });

  it("gives a student of another group nothing, and nothing for a made-up address", async () => {
    const principal = await signedIn(3, digits(13));
    expect(principal.studentIds).toEqual([sami.studentId]);
    await expect(lessonLinkTokenFor(principal, groupA)).resolves.toBeNull();
    await expect(lessonLinkTokenFor(principal, groupB)).resolves.not.toBeNull();
    await expect(lessonLinkTokenFor(principal, "nope")).resolves.toBeNull();
    await expect(lessonLinkTokenFor(principal, "c".repeat(25))).resolves.toBeNull();
  });

  it("stops working for a student who left the group or whose group was archived", async () => {
    const principal = await signedIn(1, digits(11));
    await prisma.groupMembership.update({
      where: { id: ali.membershipId },
      data: { status: "ARCHIVED" },
    });
    await expect(lessonLinkTokenFor(principal, groupA)).resolves.toBeNull();
    await prisma.groupMembership.update({
      where: { id: ali.membershipId },
      data: { status: "FROZEN" },
    });
    await expect(lessonLinkTokenFor(principal, groupA)).resolves.toBeNull();
    await prisma.groupMembership.update({
      where: { id: ali.membershipId },
      data: { status: "ACTIVE" },
    });
    await prisma.group.update({ where: { id: groupA }, data: { status: "ARCHIVED" } });
    await expect(lessonLinkTokenFor(principal, groupA)).resolves.toBeNull();
    await prisma.group.update({ where: { id: groupA }, data: { status: "ACTIVE" } });
    await expect(lessonLinkTokenFor(principal, groupA)).resolves.not.toBeNull();
  });
});

describe("staff on a lesson link (A-195)", () => {
  it("opens the group, the running call when there is one, and nothing for a group that is not theirs", async () => {
    await expect(lessonLinkStaffPath(teacher, groupA)).resolves.toBe(`/groups/${groupA}`);
    await expect(lessonLinkStaffPath(teacher, groupB)).resolves.toBeNull();
    await expect(lessonLinkStaffPath(ceo, groupB)).resolves.toBe(`/groups/${groupB}`);
    await expect(lessonLinkStaffPath(ceo, "nope")).resolves.toBeNull();
    const room = await prisma.videoRoom.create({
      data: { groupId: groupA, startedById: teacher.userId },
    });
    await prisma.videoParticipant.create({
      data: {
        roomId: room.id,
        role: "HOST",
        userId: teacher.userId,
        displayName: teacher.fullName,
        secretHash: "x",
      },
    });
    await expect(lessonLinkStaffPath(teacher, groupA)).resolves.toBe(`/video/${room.id}`);
    await expect(lessonLinkStaffPath(otherTeacher, groupA)).resolves.toBeNull();
    const nobody = actor("Nobody", [], []);
    await expect(lessonLinkStaffPath(nobody, groupA)).resolves.toBeNull();
  });
});
