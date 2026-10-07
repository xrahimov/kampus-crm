/**
 * Exams (Phase 8) against the real database: group and mock exams, results,
 * registrations, the teacher visibility switch and student progress.
 * Rows carry a run-specific tag and are removed at the end.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/rbac/default-roles";
import { examSchema } from "@/lib/validation/exams";
import { prisma } from "@/server/db/prisma";
import type { Actor } from "@/server/rbac/authorize";
import {
  createExam,
  deleteExam,
  getExam,
  getExamOptions,
  getExamResults,
  getStudentProgress,
  listExams,
  listGroupExams,
  registerStudent,
  searchCandidates,
  setExamResults,
  setExamStatus,
  unregisterStudent,
  updateExam,
} from "@/server/services/exams/exams.service";
import { createGroup } from "@/server/services/groups/groups.service";
import { markAttendance, setGrades } from "@/server/services/groups/lessons.service";
import { addMember } from "@/server/services/groups/memberships.service";
import { createBranch } from "@/server/services/settings/branches.service";
import { createCourse } from "@/server/services/settings/courses.service";
import { createGradingSystem } from "@/server/services/settings/grading-systems.service";
import { DEMO_ORG_ID, demoBranchIds } from "./support/tenant";

const RUN = String(Date.now() % 100_000).padStart(5, "0");
const TAG = `x${RUN}`;
const phone = (n: number) => `+99895${RUN}${String(n).padStart(2, "0")}`;

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
const watcher = actor("Watcher", ["WATCHER"], ["exams.view"]);

let branchA: string;
let branchB: string;
let groupA: string;
let groupB: string;
let gradingId: string;
let studentOne: string;
let studentTwo: string;
let membershipOne: string;
let examId: string;
let mockId: string;
let switchBefore: boolean | null = null;

const examInput = (over: Partial<Parameters<typeof examSchema.parse>[0]> = {}) =>
  examSchema.parse({
    type: "GROUP",
    name: `${TAG} Unit test`,
    groupId: groupA,
    isRetake: false,
    date: "2026-10-20",
    startTime: "10:00",
    endTime: "11:00",
    examinerId: "",
    roomId: "",
    gradingSystemId: gradingId,
    passScore: 50,
    maxScore: 100,
    price: "",
    capacity: "",
    groupIds: [],
    ...over,
  });

beforeAll(async () => {
  const teacherRole = await prisma.role.findUniqueOrThrow({ where: { code: "TEACHER" } });
  for (const [a, n] of [
    [ceo, 1],
    [teacher, 2],
    [watcher, 3],
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
  await prisma.userRole.create({ data: { userId: teacher.userId, roleId: teacherRole.id } });
  branchA = (await createBranch(ceo, { name: `${TAG} A`, isActive: true })).id;
  branchB = (await createBranch(ceo, { name: `${TAG} B`, isActive: true })).id;
  ceo.branchIds = await demoBranchIds();
  ceo.activeBranchId = branchA;
  await prisma.userBranch.createMany({
    data: [
      { userId: teacher.userId, branchId: branchA },
      { userId: watcher.userId, branchId: branchA },
    ],
  });
  teacher.branchIds = [branchA];
  watcher.branchIds = [branchA];
  gradingId = (
    await createGradingSystem(ceo, {
      name: `${TAG} scale`,
      rounding: "STANDARD",
      levels: [
        { name: "Weak", minScore: 0, maxScore: 49 },
        { name: "Good", minScore: 50, maxScore: 100 },
      ],
    })
  ).id;
  const courseA = (
    await createCourse(ceo, {
      branchId: branchA,
      name: `${TAG} English`,
      description: undefined,
      price: 500_000,
      durationMonths: 2,
      gradingSystemId: null,
      color: null,
    })
  ).id;
  const group = (withTeacher: boolean, name: string) =>
    createGroup(ceo, {
      branchId: branchA,
      name,
      courseId: courseA,
      gradingSystemId: null,
      weekdayPattern: "EVEN",
      slots: [2, 4, 6].map((weekday) => ({
        weekday,
        startTime: "10:00",
        endTime: "11:30",
        roomId: null,
      })),
      teachers: withTeacher
        ? [{ userId: teacher.userId, role: "MAIN", shareType: "PERCENT", shareValue: 40 }]
        : [],
      startDate: "2026-09-01",
      endDate: null,
      status: "ACTIVE",
    });
  groupA = (await group(true, `${TAG} GE-A`)).id;
  groupB = (await group(false, `${TAG} GE-B`)).id;
  const one = await addMember(ceo, groupA, {
    newStudent: { fullName: `${TAG} Aziz`, phone: phone(10) },
    joinedAt: "2026-09-01",
    customPrice: null,
    note: null,
    status: "ACTIVE",
  });
  const two = await addMember(ceo, groupA, {
    newStudent: { fullName: `${TAG} Bobur`, phone: phone(11) },
    joinedAt: "2026-09-01",
    customPrice: null,
    note: null,
    status: "ACTIVE",
  });
  studentOne = one.studentId;
  studentTwo = two.studentId;
  membershipOne = one.id;
  const settings = await prisma.orgSettings.findFirst();
  switchBefore = settings?.teachersSeeExamSchedule ?? null;
  if (settings) {
    await prisma.orgSettings.update({
      where: { id: settings.id },
      data: { teachersSeeExamSchedule: false },
    });
  }
});

afterAll(async () => {
  const branches = [branchA, branchB];
  if (switchBefore !== null) {
    await prisma.orgSettings.updateMany({ data: { teachersSeeExamSchedule: switchBefore } });
  }
  const exams = await prisma.exam.findMany({ where: { branchId: { in: branches } } });
  const students = await prisma.student.findMany({ where: { branchId: { in: branches } } });
  const groups = await prisma.group.findMany({ where: { branchId: { in: branches } } });
  await prisma.auditLog.deleteMany({
    where: {
      OR: [
        { branchId: { in: branches } },
        { entityId: { in: [...exams, ...students, ...groups].map((x) => x.id) } },
      ],
    },
  });
  await prisma.exam.deleteMany({ where: { branchId: { in: branches } } });
  await prisma.group.deleteMany({ where: { branchId: { in: branches } } });
  await prisma.student.deleteMany({ where: { branchId: { in: branches } } });
  await prisma.course.deleteMany({ where: { branchId: { in: branches } } });
  await prisma.gradingSystem.deleteMany({ where: { name: `${TAG} scale` } });
  const users = await prisma.user.findMany({ where: { phone: { startsWith: `+99895${RUN}` } } });
  const ids = users.map((u) => u.id);
  await prisma.auditLog.deleteMany({ where: { actorId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.branch.deleteMany({ where: { id: { in: branches } } });
  await prisma.$disconnect();
});

describe("exam validation", () => {
  it("rejects a pass score above the maximum and a mock without groups", () => {
    const bad = examSchema.safeParse({
      type: "GROUP",
      name: "x",
      groupId: "g",
      date: "2026-10-20",
      startTime: "10:00",
      endTime: "11:00",
      passScore: 120,
      maxScore: 100,
    });
    expect(bad.success).toBe(false);
    expect(bad.error?.issues.map((i) => i.path.join("."))).toContain("passScore");
    const mock = examSchema.safeParse({
      type: "MOCK",
      name: "x",
      date: "2026-10-20",
      startTime: "10:00",
      endTime: "11:00",
      passScore: 5,
      maxScore: 9,
    });
    expect(mock.success).toBe(false);
    expect(mock.error?.issues.map((i) => i.path.join("."))).toContain("groupIds");
  });
});

describe("group exams", () => {
  it("creates a group exam and lists it under the group tab with counters", async () => {
    const exam = await createExam(ceo, examInput());
    examId = exam.id;
    expect(exam.type).toBe("GROUP");
    expect(exam.groupName).toBe(`${TAG} GE-A`);
    expect(exam.gradingSystemName).toBe(`${TAG} scale`);
    expect(exam.studentCount).toBe(2);
    const list = await listExams(ceo, {
      type: "GROUP",
      status: "NOT_STARTED",
      groupId: groupA,
      from: "2026-10-01",
      to: "2026-10-31",
    });
    expect(list.items.map((x) => x.id)).toContain(exam.id);
    expect(list.counts.GROUP).toBeGreaterThanOrEqual(1);
    const outside = await listExams(ceo, { type: "GROUP", from: "2026-11-01" });
    expect(outside.items.map((x) => x.id)).not.toContain(exam.id);
  });

  it("refuses creation to a viewer and hides exams from teachers until the switch is on", async () => {
    await expect(createExam(watcher, examInput())).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(listExams(teacher, { type: "GROUP" })).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "errors.examsHidden",
    });
    await prisma.orgSettings.updateMany({ data: { teachersSeeExamSchedule: true } });
    const other = await createExam(ceo, examInput({ groupId: groupB, name: `${TAG} other` }));
    const mine = await listExams(teacher, { type: "GROUP" });
    expect(mine.items.map((x) => x.id)).toContain(examId);
    expect(mine.items.map((x) => x.id)).not.toContain(other.id);
    await expect(getExam(teacher, other.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await deleteExam(ceo, other.id);
  });

  it("grades members, derives the level from the grading system and caps the score", async () => {
    const sheet = await getExamResults(ceo, examId);
    expect(sheet.rows.map((r) => r.studentId).sort()).toEqual([studentOne, studentTwo].sort());
    expect(sheet.rows.every((r) => r.score === null && r.passed === null)).toBe(true);
    await expect(
      setExamResults(ceo, examId, {
        results: [{ studentId: studentOne, score: 101, isPresent: true, comment: null }],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    const rows = await setExamResults(ceo, examId, {
      results: [
        { studentId: studentOne, score: 72, isPresent: true, comment: "ok" },
        { studentId: studentTwo, score: null, isPresent: false, comment: null },
      ],
    });
    const one = rows.find((r) => r.studentId === studentOne)!;
    expect(one).toMatchObject({ score: 72, level: "Good", passed: true, comment: "ok" });
    const two = rows.find((r) => r.studentId === studentTwo)!;
    expect(two).toMatchObject({ score: null, isPresent: false, passed: null });
    const exam = await getExam(ceo, examId);
    expect(exam.gradedCount).toBe(1);
  });

  it("keeps a graded exam from deletion, finishes and reopens it", async () => {
    await expect(deleteExam(ceo, examId)).rejects.toMatchObject({
      code: "CONFLICT",
      message: "errors.examHasResults",
    });
    const finished = await setExamStatus(ceo, examId, "FINISHED");
    expect(finished.status).toBe("FINISHED");
    expect(finished.finishedAt).not.toBeNull();
    const list = await listExams(ceo, { type: "GROUP", status: "NOT_STARTED" });
    expect(list.items.map((x) => x.id)).not.toContain(examId);
    const reopened = await setExamStatus(ceo, examId, "NOT_STARTED");
    expect(reopened.status).toBe("NOT_STARTED");
    const updated = await updateExam(
      ceo,
      examId,
      examInput({ name: `${TAG} renamed`, isRetake: true }),
    );
    expect(updated).toMatchObject({ name: `${TAG} renamed`, isRetake: true });
    await expect(
      updateExam(ceo, examId, examInput({ type: "MOCK", groupId: "", groupIds: [groupA] })),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });
});

describe("mock exams", () => {
  it("targets several groups, registers candidates up to the capacity", async () => {
    const mock = await createExam(
      ceo,
      examInput({
        type: "MOCK",
        name: `${TAG} Mock`,
        groupId: "",
        groupIds: [groupA, groupB],
        price: 150_000,
        capacity: 1,
        passScore: 5.5,
        maxScore: 9,
        gradingSystemId: "",
      }),
    );
    mockId = mock.id;
    expect(mock.groups.map((g) => g.id).sort()).toEqual([groupA, groupB].sort());
    expect(mock).toMatchObject({ price: 150_000, capacity: 1, studentCount: 0 });
    const counts = await listExams(ceo, { type: "MOCK", from: "2026-10-01", to: "2026-10-31" });
    expect(counts.counts.MOCK).toBeGreaterThanOrEqual(1);

    const found = await searchCandidates(ceo, mockId, "Aziz");
    expect(found.map((c) => c.id)).toContain(studentOne);
    const rows = await registerStudent(ceo, mockId, studentOne);
    expect(rows.map((r) => r.studentId)).toEqual([studentOne]);
    expect(rows[0]!.registeredAt).not.toBeNull();
    expect((await searchCandidates(ceo, mockId, "Aziz")).map((c) => c.id)).not.toContain(
      studentOne,
    );
    await expect(registerStudent(ceo, mockId, studentTwo)).rejects.toMatchObject({
      code: "CONFLICT",
      message: "errors.examFull",
    });
    await expect(registerStudent(ceo, examId, studentTwo)).rejects.toMatchObject({
      code: "CONFLICT",
      message: "errors.notMockExam",
    });
    expect((await getExam(ceo, mockId)).studentCount).toBe(1);
  });

  it("grades a registration on a custom scale and shows up in the group tab", async () => {
    const rows = await setExamResults(ceo, mockId, {
      results: [{ studentId: studentOne, score: 6.5, isPresent: true, comment: null }],
    });
    expect(rows[0]).toMatchObject({ score: 6.5, passed: true, level: null });
    const tab = await listGroupExams(ceo, groupA);
    expect(tab.map((x) => x.id).sort()).toEqual([examId, mockId].sort());
    const options = await getExamOptions(ceo);
    expect(options.groups.map((g) => g.id)).toEqual(expect.arrayContaining([groupA, groupB]));
    expect(options.gradingSystems.map((g) => g.id)).toContain(gradingId);
  });

  it("removes a registration, then deletes the empty exam", async () => {
    await unregisterStudent(ceo, mockId, studentOne);
    expect((await getExamResults(ceo, mockId)).rows).toHaveLength(0);
    await deleteExam(ceo, mockId);
    await expect(getExam(ceo, mockId)).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("student progress", () => {
  it("averages grades and attendance by month and lists exam results", async () => {
    const lesson = await prisma.lesson.findFirstOrThrow({
      where: { groupId: groupA, date: { gte: new Date("2026-09-01"), lt: new Date("2026-10-01") } },
      orderBy: { date: "asc" },
    });
    const second = await prisma.lesson.findFirstOrThrow({
      where: { groupId: groupA, id: { not: lesson.id } },
      orderBy: { date: "asc" },
    });
    await markAttendance(ceo, lesson.id, [{ membershipId: membershipOne, status: "PRESENT" }]);
    await markAttendance(ceo, second.id, [{ membershipId: membershipOne, status: "ABSENT" }]);
    await setGrades(ceo, lesson.id, [{ membershipId: membershipOne, score: 80 }]);
    await setGrades(ceo, second.id, [{ membershipId: membershipOne, score: 60 }]);
    const progress = await getStudentProgress(ceo, studentOne);
    expect(progress.gradeAverage).toBe(70);
    expect(progress.attendancePercent).toBe(50);
    expect(progress.examAverage).toBe(72);
    expect(progress.months.length).toBeGreaterThanOrEqual(1);
    expect(progress.months[0]!.lessons).toBeGreaterThanOrEqual(1);
    expect(progress.exams).toHaveLength(1);
    expect(progress.exams[0]).toMatchObject({
      examId,
      score: 72,
      maxScore: 100,
      passed: true,
      level: "Good",
    });
  });
});
