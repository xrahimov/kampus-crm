/**
 * Standalone assignments with a rubric (A-161) against the real database: who
 * may set one, how it sits among the lesson homework, the rubric scoring on
 * review, the student's view and the checking queue.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/rbac/default-roles";
import { assignmentSchema } from "@/lib/validation/groups";
import { prisma } from "@/server/db/prisma";
import type { Actor } from "@/server/rbac/authorize";
import { createGroup } from "@/server/services/groups/groups.service";
import { listCheckingQueue } from "@/server/services/homework/checking-queue.service";
import {
  createAssignment,
  deleteHomework,
  listGroupHomework,
  listPortalHomework,
  reviewSubmission,
  setHomework,
  submitHomework,
  updateAssignment,
} from "@/server/services/homework/homework.service";
import { createBranch } from "@/server/services/settings/branches.service";
import { createCourse } from "@/server/services/settings/courses.service";
import { createStudent } from "@/server/services/students/students.service";
import { listStudentLinks } from "@/server/services/video/video.service";

import { DEMO_ORG_ID, demoBranchIds } from "./support/tenant";

const RUN = String(Date.now() % 100_000).padStart(5, "0");
const TAG = `as${RUN}`;
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
const other: Actor = { ...teacher, fullName: "Other" };

let groupId: string;
let membershipId: string;
let token: string;
let lessonHomeworkId: string;

beforeAll(async () => {
  const [user, teacherUser, otherUser] = await Promise.all(
    ["CEO", "Teacher", "Other"].map((name, i) =>
      prisma.user.create({
        data: {
          phone: `+99895${RUN}3${i}`,
          fullName: `${TAG} ${name}`,
          passwordHash: "x",
          organizationId: DEMO_ORG_ID,
        },
      }),
    ),
  );
  ceo.userId = user!.id;
  teacher.userId = teacherUser!.id;
  other.userId = otherUser!.id;
  const branchId = (await createBranch(ceo, { name: `${TAG} Branch`, isActive: true })).id;
  ceo.branchIds = await demoBranchIds();
  ceo.activeBranchId = branchId;
  for (const a of [teacher, other]) {
    a.branchIds = [branchId];
    a.activeBranchId = branchId;
  }
  const teacherRole = await prisma.role.findUniqueOrThrow({ where: { code: "TEACHER" } });
  await prisma.userRole.createMany({
    data: [teacher.userId, other.userId].map((userId) => ({ userId, roleId: teacherRole.id })),
  });
  await prisma.userBranch.createMany({
    data: [teacher.userId, other.userId].map((userId) => ({ userId, branchId })),
  });
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
  const student = await createStudent(ceo, {
    branchId,
    fullName: `${TAG} Student`,
    phone: `+99895${RUN}31`,
    birthDate: null,
    gender: "FEMALE",
    photoUrl: null,
    password: null,
    sourceId: null,
    schoolId: null,
    note: null,
    membership: { groupId, joinedAt: shift(-7), customPrice: null, note: null, status: "ACTIVE" },
  });
  const link = (await listStudentLinks(ceo, groupId)).find((l) => l.studentId === student.id)!;
  membershipId = link.membershipId;
  token = link.token;
  const lesson = await prisma.lesson.findFirstOrThrow({
    where: { groupId, date: { lt: new Date(`${shift(0)}T00:00:00Z`) } },
    orderBy: { date: "desc" },
  });
  lessonHomeworkId = (
    await setHomework(teacher, lesson.id, {
      text: "Lesson task",
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

const ESSAY = {
  title: "My city essay",
  text: "Write 200 words about your city.",
  linkUrl: null,
  attachmentUrl: null,
  speaking: false,
  dueDate: shift(7),
  rubric: [
    { name: "Content", max: 10 },
    { name: "Grammar", max: 5 },
  ],
};

describe("assignments (A-161)", () => {
  it("validates the form the way the dialog sends it", () => {
    expect(assignmentSchema.parse({ title: " Essay ", text: "x", dueDate: "" }).rubric).toEqual([]);
    expect(assignmentSchema.safeParse({ title: "", text: "x" }).success).toBe(false);
    expect(
      assignmentSchema.safeParse({ title: "E", text: "x", rubric: [{ name: "A", max: 0 }] })
        .success,
    ).toBe(false);
  });

  it("is set by the group's teacher for the whole group and sorts by its due date", async () => {
    await expect(createAssignment(other, groupId, ESSAY)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    const essay = await createAssignment(teacher, groupId, ESSAY);
    expect(essay).toMatchObject({
      lessonId: null,
      lessonDate: null,
      title: "My city essay",
      maxScore: 15,
      dueDate: shift(7),
    });
    expect(essay.rubric).toEqual(ESSAY.rubric);
    expect(essay.submissions).toHaveLength(1);

    const list = await listGroupHomework(teacher, groupId);
    expect(list.items.map((h) => h.id)).toEqual([essay.id, lessonHomeworkId]);

    await expect(updateAssignment(teacher, lessonHomeworkId, ESSAY)).rejects.toMatchObject({
      code: "CONFLICT",
      message: "errors.notAnAssignment",
    });
    const renamed = await updateAssignment(teacher, essay.id, { ...ESSAY, title: "City essay" });
    expect(renamed.title).toBe("City essay");
    expect(
      await prisma.auditLog.count({
        where: { entityId: essay.id, action: { in: ["homework.create", "homework.update"] } },
      }),
    ).toBe(2);
  });

  it("takes the student's answer, scores the rubric on review and shows the points", async () => {
    const essay = (await listGroupHomework(teacher, groupId)).items.find((h) => !h.lessonId)!;
    const mine = (await listPortalHomework(token))!;
    expect(mine[0]).toMatchObject({
      id: essay.id,
      title: "City essay",
      lessonDate: null,
      maxScore: 15,
      submission: null,
    });
    expect(mine[0]!.rubric).toEqual(ESSAY.rubric);

    await submitHomework(token, essay.id, { note: "My city is Urganch…", attachmentUrl: null });
    const queue = await listCheckingQueue(teacher);
    expect(queue.items.find((i) => i.homeworkId === essay.id)).toMatchObject({
      lessonDate: null,
      title: "City essay",
      note: "My city is Urganch…",
    });

    // Too many points, or one per criterion missing, is refused.
    await expect(
      reviewSubmission(teacher, essay.id, membershipId, {
        status: "ACCEPTED",
        rubricScores: [11, 5],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(
      reviewSubmission(teacher, essay.id, membershipId, { status: "ACCEPTED", rubricScores: [8] }),
    ).rejects.toMatchObject({ code: "VALIDATION" });

    await reviewSubmission(teacher, essay.id, membershipId, {
      status: "ACCEPTED",
      teacherComment: "Good work",
      rubricScores: [8, 4],
    });
    const checked = (await listGroupHomework(teacher, groupId)).items.find(
      (h) => h.id === essay.id,
    )!;
    expect(checked.submissions[0]).toMatchObject({
      status: "ACCEPTED",
      rubricScores: [8, 4],
      score: 12,
    });
    const seen = (await listPortalHomework(token))!.find((h) => h.id === essay.id)!;
    expect(seen.submission).toMatchObject({ status: "ACCEPTED", rubricScores: [8, 4], score: 12 });
    expect((await listCheckingQueue(teacher)).items.some((i) => i.homeworkId === essay.id)).toBe(
      false,
    );

    // A lesson's homework has no rubric, so points are refused there; deleting an assignment works.
    await submitHomework(token, lessonHomeworkId, { note: "done", attachmentUrl: null });
    await expect(
      reviewSubmission(teacher, lessonHomeworkId, membershipId, {
        status: "ACCEPTED",
        rubricScores: [1],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await deleteHomework(teacher, essay.id);
    expect((await listPortalHomework(token))!.some((h) => h.id === essay.id)).toBe(false);
  });
});
