/**
 * The gradebook (A-162) against the real database: category means, the
 * weighted final grade, course weights, the student's own view and scope.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/rbac/default-roles";
import { gradeWeightsSchema } from "@/lib/validation/settings";
import { prisma } from "@/server/db/prisma";
import type { Actor } from "@/server/rbac/authorize";
import {
  getGroupGradebook,
  getPortalGradebook,
} from "@/server/services/gradebook/gradebook.service";
import { createGroup } from "@/server/services/groups/groups.service";
import { markAttendance, setGrades } from "@/server/services/groups/lessons.service";
import {
  reviewSubmission,
  setHomework,
  submitHomework,
} from "@/server/services/homework/homework.service";
import { createBranch } from "@/server/services/settings/branches.service";
import { createCourse, updateCourse } from "@/server/services/settings/courses.service";
import { createStudent } from "@/server/services/students/students.service";
import { listStudentLinks } from "@/server/services/video/video.service";

import { DEMO_ORG_ID, demoBranchIds } from "./support/tenant";

const RUN = String(Date.now() % 100_000).padStart(5, "0");
const TAG = `gb${RUN}`;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const shift = (n: number) => {
  const d = new Date();
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
const stranger: Actor = { ...teacher, fullName: "Elsewhere" };

let courseId: string;
let groupId: string;
let anna: { studentId: string; membershipId: string; token: string };
let bob: { studentId: string; membershipId: string; token: string };
let lessonId: string;

beforeAll(async () => {
  const [user, teacherUser] = await Promise.all(
    ["CEO", "Teacher"].map((name, i) =>
      prisma.user.create({
        data: {
          phone: `+99894${RUN}6${i}`,
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
  courseId = (
    await createCourse(ceo, {
      branchId,
      name: `${TAG} Course`,
      description: undefined,
      price: 100_000,
      durationMonths: 2,
      gradingSystemId: null,
      color: null,
      gradeWeights: { lessons: 50, homework: 50, exercises: 0, tests: 0, exams: 0 },
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
      startDate: shift(-7),
      endDate: null,
      status: "ACTIVE",
    })
  ).id;
  const make = async (name: string, phone: string) => {
    const s = await createStudent(ceo, {
      branchId,
      fullName: `${TAG} ${name}`,
      phone,
      birthDate: null,
      gender: "FEMALE",
      photoUrl: null,
      password: null,
      sourceId: null,
      schoolId: null,
      note: null,
      membership: { groupId, joinedAt: shift(-7), customPrice: null, note: null, status: "ACTIVE" },
    });
    const link = (await listStudentLinks(ceo, groupId)).find((l) => l.studentId === s.id)!;
    return { studentId: s.id, membershipId: link.membershipId, token: link.token };
  };
  anna = await make("Anna", `+99894${RUN}71`);
  bob = await make("Bob", `+99894${RUN}72`);
  lessonId = (
    await prisma.lesson.findFirstOrThrow({
      where: { groupId, date: { lt: new Date(`${shift(0)}T00:00:00Z`) } },
      orderBy: { date: "asc" },
      select: { id: true },
    })
  ).id;
});

afterAll(async () => {
  await prisma.group.updateMany({ where: { id: groupId }, data: { status: "ARCHIVED" } });
});

describe("gradebook (A-162)", () => {
  it("rejects weights that do not add up to 100", () => {
    const bad = gradeWeightsSchema.safeParse({
      lessons: 50,
      homework: 30,
      exercises: 0,
      tests: 0,
      exams: 0,
    });
    expect(bad.success).toBe(false);
    expect(
      gradeWeightsSchema.safeParse({ lessons: 50, homework: 50, exercises: 0, tests: 0, exams: 0 })
        .success,
    ).toBe(true);
  });

  it("starts empty and shows the course's weights", async () => {
    const book = await getGroupGradebook(teacher, groupId);
    expect(book).toMatchObject({
      courseName: `${TAG} Course`,
      scaleName: null,
      weights: { lessons: 50, homework: 50, exercises: 0, tests: 0, exams: 0 },
    });
    expect(book.students.map((s) => [s.fullName, s.final, s.level])).toEqual([
      [`${TAG} Anna`, null, null],
      [`${TAG} Bob`, null, null],
    ]);
    await expect(getGroupGradebook(stranger, groupId)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("averages each category and weighs them into the final grade", async () => {
    await markAttendance(teacher, lessonId, [
      { membershipId: anna.membershipId, status: "PRESENT" },
      { membershipId: bob.membershipId, status: "PRESENT" },
    ]);
    // No grading scale: marks are read out of 100.
    await setGrades(teacher, lessonId, [
      { membershipId: anna.membershipId, score: 80 },
      { membershipId: bob.membershipId, score: 40 },
    ]);
    const homework = await setHomework(teacher, lessonId, {
      text: "Learn the letters",
      linkUrl: null,
      attachmentUrl: null,
      dueDate: null,
      speaking: false,
    });
    await submitHomework(anna.token, homework.id, { note: "Done", attachmentUrl: null });

    // Anna's work is still pending, so her homework category is empty: only the lesson counts.
    let book = await getGroupGradebook(teacher, groupId);
    const row = (name: string) => book.students.find((s) => s.fullName === `${TAG} ${name}`)!;
    expect(row("Anna")).toMatchObject({ final: 80 });
    expect(row("Anna").categories.find((c) => c.key === "homework")).toMatchObject({
      percent: null,
      count: 0,
    });
    // Bob never handed in and the lesson is over: 0 % for homework, (40 + 0) / 2.
    expect(row("Bob")).toMatchObject({ final: 20 });

    await reviewSubmission(teacher, homework.id, anna.membershipId, { status: "ACCEPTED" });
    book = await getGroupGradebook(teacher, groupId);
    expect(row("Anna")).toMatchObject({ final: 90 });
    expect(row("Anna").categories.map((c) => [c.key, c.percent, c.count])).toEqual([
      ["lessons", 80, 1],
      ["homework", 100, 1],
      ["exercises", null, 0],
      ["tests", null, 0],
      ["exams", null, 0],
    ]);

    // The student sees the same numbers on their page.
    const mine = (await getPortalGradebook(anna.token))!;
    expect(mine).toMatchObject({ courseName: `${TAG} Course`, final: 90, level: null });

    // Changing the course weights changes the final grade; null restores the defaults.
    await updateCourse(ceo, courseId, {
      gradeWeights: { lessons: 100, homework: 0, exercises: 0, tests: 0, exams: 0 },
    });
    book = await getGroupGradebook(teacher, groupId);
    expect(row("Anna").final).toBe(80);
    await updateCourse(ceo, courseId, { gradeWeights: null });
    book = await getGroupGradebook(teacher, groupId);
    expect(book.weights).toEqual({ lessons: 30, homework: 30, exercises: 0, tests: 20, exams: 20 });
    expect(row("Anna").final).toBe(90);
  });
});
