/**
 * Self-check exercises (A-158): scoring of the six item kinds, the student's
 * view without the key, who may write, topic exercises locked until the topic
 * opens, and the best go per student.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { scoreExercise, seededShuffle } from "@/lib/exercises/score";
import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/rbac/default-roles";
import type { ExerciseItem } from "@/lib/validation/exercises";
import { exerciseItemSchema } from "@/lib/validation/exercises";
import { prisma } from "@/server/db/prisma";
import type { Actor } from "@/server/rbac/authorize";
import {
  createExercise,
  deleteExercise,
  getPortalExercise,
  listExerciseResults,
  listExercises,
  submitPortalExercise,
  updateExercise,
} from "@/server/services/exercises/exercises.service";
import { createGroup } from "@/server/services/groups/groups.service";
import { setHomework } from "@/server/services/homework/homework.service";
import { listPortalHomework } from "@/server/services/homework/homework.service";
import { createBranch } from "@/server/services/settings/branches.service";
import { createCourse } from "@/server/services/settings/courses.service";
import { setCourseSyllabus } from "@/server/services/settings/syllabus.service";
import {
  listPortalCourse,
  setTopicRelease,
} from "@/server/services/settings/topic-content.service";
import { createStudent } from "@/server/services/students/students.service";
import { listStudentLinks } from "@/server/services/video/video.service";

import { DEMO_ORG_ID, demoBranchIds } from "./support/tenant";

const RUN = String(Date.now() % 100_000).padStart(5, "0");
const TAG = `ex${RUN}`;
const shift = (n: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
};

const ITEMS: ExerciseItem[] = [
  { kind: "CHOICE", prompt: "Pick the fruit", options: ["Apple", "Car", "Pear"], correct: [0, 2] },
  { kind: "TRUE_FALSE", prompt: "Berlin is in Germany", correct: true },
  { kind: "GAP", prompt: "I ___ a student. You ___ here.", answers: [["am", "'m"], ["are"]] },
  {
    kind: "MATCH",
    prompt: "Match",
    pairs: [
      { left: "cat", right: "Katze" },
      { left: "dog", right: "Hund" },
    ],
  },
  { kind: "ORDER", prompt: "Order the words", items: ["I", "like", "tea"] },
  { kind: "SHORT", prompt: "Capital of France?", answers: ["Paris"] },
];

describe("exercise scoring", () => {
  it("scores each kind, loosely for text, with partial points for gaps and pairs", () => {
    const perfect = scoreExercise(ITEMS, {
      "0": [2, 0],
      "1": true,
      "2": [" AM", "are "],
      "3": ["Katze", "Hund"],
      "4": ["I", "like", "tea"],
      "5": "paris",
    });
    expect(perfect).toMatchObject({ score: 8, maxScore: 8, percent: 100 });
    const partial = scoreExercise(ITEMS, {
      "0": [0],
      "1": false,
      "2": ["'m", "is"],
      "3": ["Hund", "Hund"],
      "4": ["like", "I", "tea"],
    });
    expect(partial.items.map((r) => r.points)).toEqual([0, 0, 1, 1, 0, 0]);
    expect(partial.percent).toBe(25);
    // Garbage answers never throw.
    expect(scoreExercise(ITEMS, { "0": "x", "2": true, "3": [1, 2] } as never).score).toBe(0);
  });

  it("rejects an item whose key does not fit", () => {
    expect(
      exerciseItemSchema.safeParse({
        kind: "CHOICE",
        prompt: "x",
        options: ["a", "b"],
        correct: [2],
      }).success,
    ).toBe(false);
    expect(
      exerciseItemSchema.safeParse({ kind: "GAP", prompt: "no gap here", answers: [["a"]] })
        .success,
    ).toBe(false);
    expect(
      exerciseItemSchema.safeParse({
        kind: "MATCH",
        prompt: "x",
        pairs: [{ left: "a", right: "b" }],
      }).success,
    ).toBe(false);
  });

  it("shuffles the same way for the same seed", () => {
    const a = seededShuffle(["1", "2", "3", "4", "5"], "seed");
    expect(seededShuffle(["1", "2", "3", "4", "5"], "seed")).toEqual(a);
    expect([...a].sort()).toEqual(["1", "2", "3", "4", "5"]);
  });
});

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
const stranger: Actor = { ...teacher, fullName: "Other" };

let branchId: string;
let groupId: string;
let topicId: string;
let homeworkId: string;
let token: string;

beforeAll(async () => {
  const users = await Promise.all(
    ["CEO", "Teacher", "Stranger"].map((name, i) =>
      prisma.user.create({
        data: {
          phone: `+99895${RUN}9${i}`,
          fullName: `${TAG} ${name}`,
          passwordHash: "x",
          organizationId: DEMO_ORG_ID,
        },
      }),
    ),
  );
  ceo.userId = users[0]!.id;
  teacher.userId = users[1]!.id;
  stranger.userId = users[2]!.id;
  branchId = (await createBranch(ceo, { name: `${TAG} Branch`, isActive: true })).id;
  ceo.branchIds = await demoBranchIds();
  ceo.activeBranchId = branchId;
  for (const a of [teacher, stranger]) {
    a.branchIds = [branchId];
    a.activeBranchId = branchId;
  }
  const teacherRole = await prisma.role.findUniqueOrThrow({ where: { code: "TEACHER" } });
  await prisma.userRole.createMany({
    data: [teacher.userId, stranger.userId].map((userId) => ({ userId, roleId: teacherRole.id })),
  });
  await prisma.userBranch.createMany({
    data: [teacher.userId, stranger.userId].map((userId) => ({ userId, branchId })),
  });
  const courseId = (
    await createCourse(ceo, {
      branchId,
      name: `${TAG} Course`,
      description: undefined,
      price: 0,
      durationMonths: 1,
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
  const student = await createStudent(ceo, {
    branchId,
    fullName: `${TAG} Student`,
    phone: `+99895${RUN}99`,
    birthDate: null,
    gender: "MALE",
    photoUrl: null,
    password: null,
    sourceId: null,
    schoolId: null,
    note: null,
    membership: { groupId, joinedAt: shift(-7), customPrice: null, note: null, status: "ACTIVE" },
  });
  token = (await listStudentLinks(ceo, groupId)).find((l) => l.studentId === student.id)!.token;
  topicId = (await setCourseSyllabus(ceo, courseId, { topics: [{ title: "Greetings" }] }))[0]!.id;
  const lesson = await prisma.lesson.findFirstOrThrow({
    where: { groupId, date: { lt: new Date(`${shift(0)}T00:00:00Z`) } },
    orderBy: { date: "asc" },
  });
  homeworkId = (
    await setHomework(teacher, lesson.id, {
      text: "Do the exercise",
      linkUrl: null,
      attachmentUrl: null,
      dueDate: null,
      speaking: false,
    })
  ).id;
});

afterAll(async () => {
  await prisma.group.updateMany({ where: { id: groupId }, data: { status: "ARCHIVED" } });
});

describe("exercises (A-158)", () => {
  it("is written by the course's teacher, locked on a closed topic, scored and kept per student", async () => {
    await expect(
      createExercise(stranger, { title: "Nope", topicId, items: ITEMS }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      createExercise(teacher, { title: "Both", topicId, homeworkId, items: ITEMS }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    const onTopic = await createExercise(teacher, {
      title: "Greetings practice",
      topicId,
      items: ITEMS,
    });
    expect(onTopic).toMatchObject({ topicId, homeworkId: null, maxScore: 8, attempted: 0 });
    const list = await listExercises(stranger, { topicId });
    expect(list.canEdit).toBe(false);
    expect(list.items.map((e) => e.id)).toEqual([onTopic.id]);

    // The topic is not open to the group yet: no exercise on the page, and no doing it by id.
    let course = await listPortalCourse(token);
    expect(course!.topics[0]!.exercises).toEqual([]);
    await expect(getPortalExercise(token, onTopic.id)).rejects.toMatchObject({ code: "CONFLICT" });
    await setTopicRelease(teacher, groupId, topicId, { mode: "now" });
    course = await listPortalCourse(token);
    expect(course!.topics[0]!.exercises).toEqual([
      { id: onTopic.id, title: "Greetings practice", itemCount: 6, attempts: 0, best: null },
    ]);

    // The student's view carries no key; MATCH rights and ORDER pieces are shuffled but stable.
    const view = await getPortalExercise(token, onTopic.id);
    expect(JSON.stringify(view)).not.toContain("correct");
    expect(view.items[0]).toEqual({
      kind: "CHOICE",
      prompt: "Pick the fruit",
      options: ["Apple", "Car", "Pear"],
      multiple: true,
    });
    expect(view.items[2]).toEqual({
      kind: "GAP",
      prompt: "I ___ a student. You ___ here.",
      gaps: 2,
    });
    const match = view.items[3] as { rights: string[] };
    expect([...match.rights].sort()).toEqual(["Hund", "Katze"]);
    expect((await getPortalExercise(token, onTopic.id)).items[3]).toEqual(view.items[3]);

    const first = await submitPortalExercise(token, onTopic.id, {
      answers: {
        "0": [0],
        "1": true,
        "2": ["am", "are"],
        "3": ["Katze", "Hund"],
        "4": ["I", "like", "tea"],
        "5": "Paris",
      },
    });
    expect(first).toMatchObject({ score: 7, maxScore: 8, percent: 88, attempts: 1 });
    expect(first.items[0]).toMatchObject({ correct: false, key: ["Apple", "Pear"] });
    const second = await submitPortalExercise(token, onTopic.id, {
      answers: {
        "0": [0, 2],
        "1": true,
        "2": ["'M", "are"],
        "3": ["Katze", "Hund"],
        "4": ["I", "like", "tea"],
        "5": " paris ",
      },
    });
    expect(second).toMatchObject({ percent: 100, attempts: 2, best: { percent: 100 } });
    const worse = await submitPortalExercise(token, onTopic.id, { answers: {} });
    expect(worse).toMatchObject({ score: 0, best: { score: 8, percent: 100 }, attempts: 3 });

    const results = await listExerciseResults(teacher, onTopic.id);
    expect(results).toHaveLength(1);
    expect(results[0]).toMatchObject({
      fullName: `${TAG} Student`,
      attempts: 3,
      bestPercent: 100,
      bestScore: 8,
    });
    expect((await listExercises(teacher, { topicId })).items[0]!.attempted).toBe(1);
    expect((await listPortalCourse(token))!.topics[0]!.exercises[0]).toMatchObject({
      attempts: 3,
      best: { score: 8, maxScore: 8, percent: 100 },
    });

    // Editing keeps old attempts; a stranger cannot edit or delete.
    const edited = await updateExercise(teacher, onTopic.id, {
      title: "Renamed",
      items: ITEMS.slice(0, 2),
    });
    expect(edited).toMatchObject({ title: "Renamed", maxScore: 2 });
    await expect(
      updateExercise(stranger, onTopic.id, { title: "x", items: ITEMS }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(deleteExercise(stranger, onTopic.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("sits on a homework for that group only and shows up on the student's task", async () => {
    const onHomework = await createExercise(teacher, {
      title: "Homework check",
      homeworkId,
      items: [ITEMS[5]!],
    });
    await expect(
      createExercise(stranger, { title: "x", homeworkId, items: [ITEMS[5]!] }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const homework = await listPortalHomework(token);
    expect(homework![0]!.exercises).toEqual([
      { id: onHomework.id, title: "Homework check", itemCount: 1, attempts: 0, best: null },
    ]);
    const result = await submitPortalExercise(token, onHomework.id, { answers: { "0": "PARIS" } });
    expect(result).toMatchObject({ score: 1, maxScore: 1, percent: 100 });
    expect((await listPortalHomework(token))![0]!.exercises[0]!.best).toEqual({
      score: 1,
      maxScore: 1,
      percent: 100,
    });
    await deleteExercise(ceo, onHomework.id);
    expect((await listExercises(teacher, { homeworkId })).items).toEqual([]);
    expect(await prisma.exerciseAttempt.count({ where: { exerciseId: onHomework.id } })).toBe(0);
  });
});
