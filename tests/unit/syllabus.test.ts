/**
 * Course syllabus (A-137) against the real database: the topic list is saved
 * in order and keeps linked rows, the group's next topic moves on as lessons
 * take topics, attendance marks give a lesson the next topic by themselves,
 * and a topic of another course is refused on a lesson.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/server/db/prisma";
import type { Actor } from "@/server/rbac/authorize";
import { createGroup } from "@/server/services/groups/groups.service";
import {
  getMonthGrid,
  markAttendance,
  updateLesson,
} from "@/server/services/groups/lessons.service";
import { createBranch } from "@/server/services/settings/branches.service";
import { createCourse } from "@/server/services/settings/courses.service";
import {
  getCourseSyllabus,
  getGroupSyllabus,
  nextTopicForGroup,
  setCourseSyllabus,
} from "@/server/services/settings/syllabus.service";
import { createStudent } from "@/server/services/students/students.service";

import { DEMO_ORG_ID, demoBranchIds } from "./support/tenant";

const RUN = String(Date.now() % 100_000).padStart(5, "0");
const TAG = `syl${RUN}`;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
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

let branchId: string;
let courseId: string;
let otherCourseId: string;
let groupId: string;
let membershipId: string;
let lessons: Array<{ id: string; date: string }> = [];

beforeAll(async () => {
  const user = await prisma.user.create({
    data: {
      phone: `+99895${RUN}77`,
      fullName: `${TAG} CEO`,
      passwordHash: "x",
      organizationId: DEMO_ORG_ID,
    },
  });
  ceo.userId = user.id;
  branchId = (await createBranch(ceo, { name: `${TAG} Branch`, isActive: true })).id;
  ceo.branchIds = await demoBranchIds();
  ceo.activeBranchId = branchId;
  const course = (name: string) =>
    createCourse(ceo, {
      branchId,
      name,
      description: undefined,
      price: 100_000,
      durationMonths: 2,
      gradingSystemId: null,
      color: null,
    });
  courseId = (await course(`${TAG} Course`)).id;
  otherCourseId = (await course(`${TAG} Other`)).id;
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
      teachers: [],
      startDate: daysAgo(7),
      endDate: null,
      status: "ACTIVE",
    })
  ).id;
  const student = await createStudent(ceo, {
    branchId,
    fullName: `${TAG} Student`,
    phone: `+99895${RUN}78`,
    birthDate: null,
    gender: "FEMALE",
    photoUrl: null,
    password: null,
    sourceId: null,
    schoolId: null,
    note: null,
    membership: { groupId, joinedAt: daysAgo(7), customPrice: null, note: null, status: "ACTIVE" },
  });
  membershipId = (
    await prisma.groupMembership.findFirstOrThrow({ where: { studentId: student.id, groupId } })
  ).id;
  const rows = await prisma.lesson.findMany({
    where: { groupId, date: { lt: new Date(`${daysAgo(0)}T00:00:00Z`) } },
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
  });
  lessons = rows.map((l) => ({ id: l.id, date: iso(l.date) }));
  expect(lessons.length).toBeGreaterThanOrEqual(3);
});

afterAll(async () => {
  await prisma.group.updateMany({ where: { id: groupId }, data: { status: "ARCHIVED" } });
});

describe("course syllabus", () => {
  it("saves the topics in order and keeps a row whose title stays", async () => {
    const first = await setCourseSyllabus(ceo, courseId, {
      topics: [
        { title: "Alphabet" },
        { title: "Greetings", note: "Hello, goodbye" },
        { title: "Numbers" },
      ],
    });
    expect(first.map((t) => [t.sortOrder, t.title])).toEqual([
      [1, "Alphabet"],
      [2, "Greetings"],
      [3, "Numbers"],
    ]);
    expect(first[1]!.note).toBe("Hello, goodbye");
    const greetingsId = first[1]!.id;

    // Reordered, one dropped, one added: Greetings keeps its id.
    const second = await setCourseSyllabus(ceo, courseId, {
      topics: [{ title: "Greetings" }, { title: "Alphabet" }, { title: "Colours" }],
    });
    expect(second.map((t) => t.title)).toEqual(["Greetings", "Alphabet", "Colours"]);
    expect(second[0]!.id).toBe(greetingsId);
    expect(second[0]!.note).toBeNull();
    expect(await getCourseSyllabus(ceo, courseId)).toEqual(second);
    const audit = await prisma.auditLog.findFirst({
      where: { action: "course.syllabus", entityId: courseId },
    });
    expect(audit).not.toBeNull();

    // Back to the teaching order the rest of the tests use.
    await setCourseSyllabus(ceo, courseId, {
      topics: [{ title: "Alphabet" }, { title: "Greetings" }, { title: "Numbers" }],
    });
  });

  it("gives a lesson the next topic when attendance is first marked", async () => {
    expect((await nextTopicForGroup(prisma, { id: groupId, courseId }))?.title).toBe("Alphabet");
    const before = await getGroupSyllabus(ceo, groupId);
    expect(before).toMatchObject({ total: 3, done: 0, next: { title: "Alphabet" } });

    await markAttendance(ceo, lessons[0]!.id, [{ membershipId, status: "PRESENT" }]);
    const after = await getGroupSyllabus(ceo, groupId);
    expect(after).toMatchObject({ done: 1, next: { title: "Greetings" } });
    expect(after.topics[0]).toMatchObject({
      status: "done",
      lessonId: lessons[0]!.id,
      lessonDate: lessons[0]!.date,
    });
    expect(after.topics[1]!.status).toBe("next");
    expect(after.topics[2]!.status).toBe("planned");

    // Marking the same lesson again does not move on.
    await markAttendance(ceo, lessons[0]!.id, [{ membershipId, status: "ABSENT" }]);
    expect((await getGroupSyllabus(ceo, groupId)).done).toBe(1);

    // The month grid shows the syllabus title beside the free text.
    const grid = await getMonthGrid(ceo, groupId, lessons[0]!.date.slice(0, 7));
    const row = grid.lessons.find((l) => l.id === lessons[0]!.id)!;
    expect(row.topic).toBeNull();
    expect(row.courseTopicTitle).toBe("Alphabet");
  });

  it("lets the teacher pick a topic by hand and refuses one of another course", async () => {
    const topics = await getCourseSyllabus(ceo, courseId);
    const numbers = topics.find((t) => t.title === "Numbers")!;
    await updateLesson(ceo, lessons[1]!.id, { courseTopicId: numbers.id });
    const after = await getGroupSyllabus(ceo, groupId);
    expect(after.done).toBe(2);
    // Greetings is still the next one: it was skipped, not covered.
    expect(after.next?.title).toBe("Greetings");

    // A lesson with a free-text topic keeps it when attendance is marked.
    await updateLesson(ceo, lessons[2]!.id, { topic: "Revision" });
    await markAttendance(ceo, lessons[2]!.id, [{ membershipId, status: "PRESENT" }]);
    expect((await getGroupSyllabus(ceo, groupId)).done).toBe(2);

    const [foreign] = await setCourseSyllabus(ceo, otherCourseId, { topics: [{ title: "Other" }] });
    await expect(
      updateLesson(ceo, lessons[2]!.id, { courseTopicId: foreign!.id }),
    ).rejects.toMatchObject({ code: "VALIDATION" });

    // Clearing the link puts the topic back in the queue.
    await updateLesson(ceo, lessons[1]!.id, { courseTopicId: null });
    expect((await getGroupSyllabus(ceo, groupId)).done).toBe(1);
  });
});
