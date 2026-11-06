/**
 * Progress per topic and per course (A-159) against the real database: what
 * makes a topic complete, the course totals, the teacher's table, the
 * student's own view and the staff's per-student list.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/rbac/default-roles";
import type { ExerciseItem } from "@/lib/validation/exercises";
import { prisma } from "@/server/db/prisma";
import type { Actor } from "@/server/rbac/authorize";
import {
  createExercise,
  submitPortalExercise,
} from "@/server/services/exercises/exercises.service";
import { createGroup } from "@/server/services/groups/groups.service";
import { markAttendance } from "@/server/services/groups/lessons.service";
import { setHomework, submitHomework } from "@/server/services/homework/homework.service";
import {
  getGroupProgress,
  getPortalProgress,
  listStudentCourseProgress,
} from "@/server/services/progress/course-progress.service";
import { createBranch } from "@/server/services/settings/branches.service";
import { createCourse } from "@/server/services/settings/courses.service";
import { setCourseSyllabus } from "@/server/services/settings/syllabus.service";
import { createStudent } from "@/server/services/students/students.service";
import { listStudentLinks } from "@/server/services/video/video.service";

import { DEMO_ORG_ID, demoBranchIds } from "./support/tenant";

const RUN = String(Date.now() % 100_000).padStart(5, "0");
const TAG = `cp${RUN}`;
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
let topics: Array<{ id: string }> = [];
let anna: { studentId: string; membershipId: string; token: string };
let bob: { studentId: string; membershipId: string; token: string };
let lessons: Array<{ id: string }> = [];

beforeAll(async () => {
  const [user, teacherUser] = await Promise.all(
    ["CEO", "Teacher"].map((name, i) =>
      prisma.user.create({
        data: {
          phone: `+99895${RUN}6${i}`,
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
  anna = await make("Anna", `+99895${RUN}71`);
  bob = await make("Bob", `+99895${RUN}72`);
  topics = await setCourseSyllabus(ceo, courseId, {
    topics: [{ title: "Alphabet" }, { title: "Greetings" }, { title: "Numbers" }],
  });
  lessons = await prisma.lesson.findMany({
    where: { groupId, date: { lt: new Date(`${shift(0)}T00:00:00Z`) } },
    orderBy: { date: "asc" },
    take: 2,
    select: { id: true },
  });
  await prisma.lesson.update({
    where: { id: lessons[0]!.id },
    data: { courseTopicId: topics[0]!.id },
  });
});

afterAll(async () => {
  await prisma.group.updateMany({ where: { id: groupId }, data: { status: "ARCHIVED" } });
});

describe("course progress (A-159)", () => {
  it("completes a topic when the lesson was held and the student did its work", async () => {
    const lessonId = lessons[0]!.id;
    await markAttendance(teacher, lessonId, [
      { membershipId: anna.membershipId, status: "PRESENT" },
      { membershipId: bob.membershipId, status: "ABSENT" },
    ]);
    const homework = await setHomework(teacher, lessonId, {
      text: "Learn the letters",
      linkUrl: null,
      attachmentUrl: null,
      dueDate: null,
      speaking: false,
    });
    const exercise = await createExercise(teacher, {
      title: "Letters check",
      topicId: topics[0]!.id,
      items: ITEMS,
    });

    // Anna has attended but not yet done the work: the topic stays open.
    let mine = (await getPortalProgress(anna.token))!;
    expect(mine).toMatchObject({
      percent: 0,
      topicsTotal: 3,
      topicsCovered: 1,
      topicsComplete: 0,
      exercisesTotal: 1,
      exercisesDone: 0,
      scorePercent: null,
      attendancePercent: 100,
      homeworkSet: 1,
      homeworkDone: 0,
    });
    expect(mine.topics[0]).toMatchObject({
      attendance: "PRESENT",
      homework: "pending",
      exercisesTotal: 1,
      complete: false,
    });
    expect(mine.topics[1]).toMatchObject({ coveredOn: null, complete: false });

    await submitHomework(anna.token, homework.id, { note: "Done", attachmentUrl: null });
    await submitPortalExercise(anna.token, exercise.id, { answers: { "0": [1], "1": true } });
    mine = (await getPortalProgress(anna.token))!;
    expect(mine).toMatchObject({
      percent: 33,
      topicsComplete: 1,
      exercisesDone: 1,
      scorePercent: 50,
      homeworkDone: 1,
    });
    expect(mine.topics[0]).toMatchObject({
      homework: "submitted",
      complete: true,
      scorePercent: 50,
    });

    // Bob missed the lesson and did nothing: open, shown as missed.
    const his = (await getPortalProgress(bob.token))!;
    expect(his).toMatchObject({ percent: 0, attendancePercent: 0, exercisesDone: 0 });
    expect(his.topics[0]).toMatchObject({
      attendance: "ABSENT",
      homework: "pending",
      complete: false,
    });

    const table = await getGroupProgress(teacher, groupId);
    expect(table.topics.map((t) => t.title)).toEqual(["Alphabet", "Greetings", "Numbers"]);
    expect(table.students.map((s) => [s.fullName, s.percent, s.cells])).toEqual([
      [`${TAG} Anna`, 33, ["complete", "planned", "planned"]],
      [`${TAG} Bob`, 0, ["absent", "planned", "planned"]],
    ]);
    await expect(getGroupProgress(stranger, groupId)).rejects.toMatchObject({ code: "FORBIDDEN" });

    const list = await listStudentCourseProgress(ceo, anna.studentId);
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ groupId, percent: 33, courseName: `${TAG} Course` });
  });

  it("counts a topic that asks nothing as complete when attended, open when missed", async () => {
    await prisma.lesson.update({
      where: { id: lessons[1]!.id },
      data: { courseTopicId: topics[1]!.id },
    });
    await markAttendance(teacher, lessons[1]!.id, [
      { membershipId: anna.membershipId, status: "PRESENT" },
      { membershipId: bob.membershipId, status: "ABSENT" },
    ]);
    const table = await getGroupProgress(teacher, groupId);
    expect(table.students.map((s) => [s.percent, s.cells])).toEqual([
      [67, ["complete", "complete", "planned"]],
      [0, ["absent", "absent", "planned"]],
    ]);
    // Bob catches up on the exercise: the first topic is still short of the homework.
    const exercise = await prisma.exercise.findFirstOrThrow({ where: { topicId: topics[0]!.id } });
    await submitPortalExercise(bob.token, exercise.id, { answers: { "0": [0], "1": true } });
    const his = (await getPortalProgress(bob.token))!;
    expect(his.topics[0]).toMatchObject({ exercisesDone: 1, scorePercent: 100, complete: false });
    expect(his.scorePercent).toBe(100);
  });
});
