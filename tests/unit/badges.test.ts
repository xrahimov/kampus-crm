/**
 * Badges (A-163) against the real database: earned by the events that can
 * earn them, listed for staff and for the student, never awarded twice.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/rbac/default-roles";
import type { ExerciseItem } from "@/lib/validation/exercises";
import { prisma } from "@/server/db/prisma";
import type { Actor } from "@/server/rbac/authorize";
import {
  BADGE_CODES,
  checkBadges,
  getPortalBadges,
  listStudentBadges,
} from "@/server/services/badges/badges.service";
import {
  createExercise,
  submitPortalExercise,
} from "@/server/services/exercises/exercises.service";
import { createGroup } from "@/server/services/groups/groups.service";
import { markAttendance } from "@/server/services/groups/lessons.service";
import {
  reviewSubmission,
  setHomework,
  submitHomework,
} from "@/server/services/homework/homework.service";
import { createBranch } from "@/server/services/settings/branches.service";
import { createCourse } from "@/server/services/settings/courses.service";
import { setCourseSyllabus } from "@/server/services/settings/syllabus.service";
import { createStudent } from "@/server/services/students/students.service";
import { listStudentLinks } from "@/server/services/video/video.service";

import { DEMO_ORG_ID, demoBranchIds } from "./support/tenant";

const RUN = String(Date.now() % 100_000).padStart(5, "0");
const TAG = `bd${RUN}`;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const shift = (n: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return iso(d);
};
const ITEMS: ExerciseItem[] = [
  { kind: "CHOICE", prompt: "Pick the fruit", options: ["Apple", "Car"], correct: [0] },
  { kind: "TRUE_FALSE", prompt: "Berlin is in Germany", correct: true },
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
const stranger: Actor = { ...teacher, fullName: "Elsewhere" };

let groupId: string;
let topicId: string;
let anna: { studentId: string; membershipId: string; token: string };
let lessons: Array<{ id: string }> = [];

beforeAll(async () => {
  const [user, teacherUser] = await Promise.all(
    ["CEO", "Teacher"].map((name, i) =>
      prisma.user.create({
        data: {
          phone: `+99893${RUN}6${i}`,
          fullName: `${TAG} ${name}`,
          passwordHash: "x",
          organizationId: DEMO_ORG_ID,
        },
      }),
    ),
  );
  ceo.userId = user!.id;
  teacher.userId = teacherUser!.id;
  stranger.userId = teacherUser!.id;
  const branchId = (await createBranch(ceo, { name: `${TAG} Branch`, isActive: true })).id;
  ceo.branchIds = await demoBranchIds();
  ceo.activeBranchId = branchId;
  teacher.branchIds = [branchId];
  teacher.activeBranchId = branchId;
  const teacherRole = await prisma.role.findUniqueOrThrow({ where: { code: "TEACHER" } });
  await prisma.userRole.create({ data: { userId: teacher.userId, roleId: teacherRole.id } });
  await prisma.userBranch.create({ data: { userId: teacher.userId, branchId } });
  const courseId = (
    await createCourse(ceo, {
      branchId,
      name: `${TAG} Course`,
      description: undefined,
      price: 100_000,
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
        endTime: "11:00",
        roomId: null,
      })),
      teachers: [{ userId: teacher.userId, role: "MAIN", shareType: "PERCENT", shareValue: 0 }],
      startDate: shift(-20),
      endDate: null,
      status: "ACTIVE",
    })
  ).id;
  const s = await createStudent(ceo, {
    branchId,
    fullName: `${TAG} Anna`,
    phone: `+99893${RUN}71`,
    birthDate: null,
    gender: "FEMALE",
    photoUrl: null,
    password: null,
    sourceId: null,
    schoolId: null,
    note: null,
    membership: { groupId, joinedAt: shift(-20), customPrice: null, note: null, status: "ACTIVE" },
  });
  const link = (await listStudentLinks(ceo, groupId)).find((l) => l.studentId === s.id)!;
  anna = { studentId: s.id, membershipId: link.membershipId, token: link.token };
  topicId = (await setCourseSyllabus(ceo, courseId, { topics: [{ title: "Alphabet" }] }))[0]!.id;
  lessons = await prisma.lesson.findMany({
    where: { groupId, date: { lt: new Date(`${shift(0)}T00:00:00Z`) } },
    orderBy: { date: "asc" },
    take: 12,
    select: { id: true },
  });
});

afterAll(async () => {
  await prisma.group.updateMany({ where: { id: groupId }, data: { status: "ARCHIVED" } });
});

describe("badges (A-163)", () => {
  it("lists every badge locked for a new student", async () => {
    const list = await listStudentBadges(ceo, anna.studentId);
    expect(list.map((b) => b.code)).toEqual([...BADGE_CODES]);
    expect(list.every((b) => b.earnedAt === null)).toBe(true);
    await expect(listStudentBadges(stranger, anna.studentId)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    expect(await getPortalBadges("not-a-real-token-at-all")).toBeNull();
  });

  it("awards the first homework when it is accepted, once", async () => {
    const homework = await setHomework(teacher, lessons[0]!.id, {
      text: "Learn the letters",
      linkUrl: null,
      attachmentUrl: null,
      dueDate: null,
      speaking: false,
    });
    await submitHomework(anna.token, homework.id, { note: "Done", attachmentUrl: null });
    let mine = (await getPortalBadges(anna.token))!;
    expect(mine.find((b) => b.code === "firstHomework")!.earnedAt).toBeNull();

    await reviewSubmission(teacher, homework.id, anna.membershipId, { status: "ACCEPTED" });
    mine = (await getPortalBadges(anna.token))!;
    expect(mine.find((b) => b.code === "firstHomework")!.earnedAt).not.toBeNull();
    expect(mine.find((b) => b.code === "homework10")!.earnedAt).toBeNull();

    // Returning the work later does not take the badge back; checking again awards nothing new.
    await reviewSubmission(teacher, homework.id, anna.membershipId, { status: "RETURNED" });
    expect(await checkBadges(prisma, anna.studentId)).toEqual([]);
    expect(await prisma.studentBadge.count({ where: { studentId: anna.studentId } })).toBe(1);
  });

  it("awards a flawless exercise and a ten-lesson streak", async () => {
    // The topic opens for the student once a held lesson covered it.
    await prisma.lesson.update({ where: { id: lessons[0]!.id }, data: { courseTopicId: topicId } });
    await markAttendance(teacher, lessons[0]!.id, [
      { membershipId: anna.membershipId, status: "PRESENT" },
    ]);
    const exercise = await createExercise(teacher, { title: "Letters", topicId, items: ITEMS });
    await submitPortalExercise(anna.token, exercise.id, { answers: { "0": [1], "1": true } });
    let mine = (await getPortalBadges(anna.token))!;
    expect(mine.find((b) => b.code === "exerciseAce")!.earnedAt).toBeNull();
    await submitPortalExercise(anna.token, exercise.id, { answers: { "0": [0], "1": true } });
    mine = (await getPortalBadges(anna.token))!;
    expect(mine.find((b) => b.code === "exerciseAce")!.earnedAt).not.toBeNull();

    // Nine lessons in a row, one missed, then ten in a row: the streak needs the ten.
    for (const [i, lesson] of lessons.slice(0, 9).entries()) {
      await markAttendance(teacher, lesson.id, [
        { membershipId: anna.membershipId, status: i === 4 ? "ABSENT" : "PRESENT" },
      ]);
    }
    mine = (await getPortalBadges(anna.token))!;
    expect(mine.find((b) => b.code === "streak10")!.earnedAt).toBeNull();
    for (const lesson of lessons.slice(9, 12)) {
      await markAttendance(teacher, lesson.id, [
        { membershipId: anna.membershipId, status: "PRESENT" },
      ]);
    }
    // Lessons 6..12 are seven in a row: still short. Re-mark the missed one as present: 1..12 = twelve.
    expect(
      (await getPortalBadges(anna.token))!.find((b) => b.code === "streak10")!.earnedAt,
    ).toBeNull();
    await markAttendance(teacher, lessons[4]!.id, [
      { membershipId: anna.membershipId, status: "PRESENT" },
    ]);
    const list = await listStudentBadges(ceo, anna.studentId);
    const streak = list.find((b) => b.code === "streak10")!;
    expect(streak.earnedAt).not.toBeNull();
    expect(streak.groupName).toBe(`${TAG} Group`);
    expect(
      list
        .filter((b) => b.earnedAt)
        .map((b) => b.code)
        .sort(),
      // Twelve daily lessons, all attended, also make a perfect month (8 or more marked, none missed).
    ).toEqual(["exerciseAce", "firstHomework", "perfectMonth", "streak10"].sort());
  });
});
