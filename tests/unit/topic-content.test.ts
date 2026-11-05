/**
 * Lesson content per syllabus topic (A-157) against the real database: who may
 * write it, the replace-all save, when a group's students see a topic (after
 * the lesson, now, from a date) and the student's own view through their link.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/rbac/default-roles";
import { prisma } from "@/server/db/prisma";
import type { Actor } from "@/server/rbac/authorize";
import { createGroup } from "@/server/services/groups/groups.service";
import { markAttendance } from "@/server/services/groups/lessons.service";
import { portalFileAllowed } from "@/server/services/homework/homework.service";
import { createBranch } from "@/server/services/settings/branches.service";
import { createCourse } from "@/server/services/settings/courses.service";
import { getGroupSyllabus, setCourseSyllabus } from "@/server/services/settings/syllabus.service";
import {
  getTopicContent,
  listPortalCourse,
  setTopicContent,
  setTopicRelease,
} from "@/server/services/settings/topic-content.service";
import { createStudent } from "@/server/services/students/students.service";
import { listStudentLinks } from "@/server/services/video/video.service";

import { DEMO_ORG_ID, demoBranchIds } from "./support/tenant";

const RUN = String(Date.now() % 100_000).padStart(5, "0");
const TAG = `tc${RUN}`;
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
const stranger: Actor = { ...teacher, fullName: "Other teacher" };

let branchId: string;
let courseId: string;
let groupId: string;
let membershipId: string;
let token: string;
let topics: Array<{ id: string; title: string }> = [];
let pastLessonId: string;

beforeAll(async () => {
  const [user, teacherUser, strangerUser] = await Promise.all(
    ["CEO", "Teacher", "Stranger"].map((name, i) =>
      prisma.user.create({
        data: {
          phone: `+99895${RUN}8${i}`,
          fullName: `${TAG} ${name}`,
          passwordHash: "x",
          organizationId: DEMO_ORG_ID,
        },
      }),
    ),
  );
  ceo.userId = user!.id;
  teacher.userId = teacherUser!.id;
  stranger.userId = strangerUser!.id;
  branchId = (await createBranch(ceo, { name: `${TAG} Branch`, isActive: true })).id;
  ceo.branchIds = await demoBranchIds();
  ceo.activeBranchId = branchId;
  teacher.branchIds = [branchId];
  teacher.activeBranchId = branchId;
  stranger.branchIds = [branchId];
  stranger.activeBranchId = branchId;
  const teacherRole = await prisma.role.findUniqueOrThrow({ where: { code: "TEACHER" } });
  await prisma.userRole.createMany({
    data: [teacher.userId, stranger.userId].map((userId) => ({ userId, roleId: teacherRole.id })),
  });
  await prisma.userBranch.createMany({
    data: [teacher.userId, stranger.userId].map((userId) => ({ userId, branchId })),
  });
  courseId = (
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
    phone: `+99895${RUN}79`,
    birthDate: null,
    gender: "FEMALE",
    photoUrl: null,
    password: null,
    sourceId: null,
    schoolId: null,
    note: null,
    membership: { groupId, joinedAt: shift(-7), customPrice: null, note: null, status: "ACTIVE" },
  });
  const links = await listStudentLinks(ceo, groupId);
  const link = links.find((l) => l.studentId === student.id)!;
  membershipId = link.membershipId;
  token = link.token;
  topics = await setCourseSyllabus(ceo, courseId, {
    topics: [{ title: "Alphabet" }, { title: "Greetings" }, { title: "Numbers" }],
  });
  const past = await prisma.lesson.findFirstOrThrow({
    where: { groupId, date: { lt: new Date(`${shift(0)}T00:00:00Z`) } },
    orderBy: { date: "asc" },
  });
  pastLessonId = past.id;
});

afterAll(async () => {
  await prisma.group.updateMany({ where: { id: groupId }, data: { status: "ARCHIVED" } });
});

describe("topic content (A-157)", () => {
  it("is written by the course's teacher or the office, read by anyone who sees groups", async () => {
    const alphabet = topics[0]!;
    const empty = await getTopicContent(teacher, alphabet.id);
    expect(empty).toMatchObject({ title: "Alphabet", blocks: [], canEdit: true });
    expect((await getTopicContent(stranger, alphabet.id)).canEdit).toBe(false);
    await expect(
      setTopicContent(stranger, alphabet.id, {
        blocks: [{ kind: "TEXT", title: "Nope", body: "x" }],
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const saved = await setTopicContent(teacher, alphabet.id, {
      blocks: [
        { kind: "TEXT", title: "Read first", body: "A, B, C.\n\nThe letters." },
        { kind: "VIDEO", title: "Watch", url: "https://youtu.be/dQw4w9WgXcQ" },
        {
          kind: "FILE",
          title: "Worksheet",
          url: "/api/v1/files/documents/" + "a".repeat(32) + ".pdf",
        },
        { kind: "LINK", title: "Practice", url: "https://example.com/abc" },
      ],
    });
    expect(saved.blocks.map((b) => [b.sortOrder, b.kind])).toEqual([
      [1, "TEXT"],
      [2, "VIDEO"],
      [3, "FILE"],
      [4, "LINK"],
    ]);
    // Replace-all: the list is what was sent, in that order.
    const again = await setTopicContent(ceo, alphabet.id, {
      blocks: [{ kind: "LINK", title: "Practice", url: "https://example.com/abc" }],
    });
    expect(again.blocks).toHaveLength(1);
    expect(
      await prisma.auditLog.count({ where: { action: "topic.content", entityId: alphabet.id } }),
    ).toBe(2);
    await setTopicContent(ceo, alphabet.id, { blocks: saved.blocks });
  });

  it("opens a topic to the group after the lesson, now, or from a date", async () => {
    const [alphabet, greetings, numbers] = topics.map((t) => ({ id: t.id })) as [
      { id: string },
      { id: string },
      { id: string },
    ];
    await setTopicContent(ceo, greetings.id, {
      blocks: [{ kind: "TEXT", title: "Hello", body: "Hello, goodbye." }],
    });
    let syllabus = await getGroupSyllabus(ceo, groupId);
    expect(syllabus.topics.map((t) => [t.blocks, t.release.mode, t.open])).toEqual([
      [4, "lesson", false],
      [1, "lesson", false],
      [0, "lesson", false],
    ]);
    let portal = await listPortalCourse(token);
    expect(portal).toMatchObject({ total: 3, open: 0 });
    expect(portal!.topics.every((t) => !t.open && t.blocks.length === 0)).toBe(true);

    // Attendance on a past lesson covers Alphabet, which opens by itself.
    await markAttendance(teacher, pastLessonId, [{ membershipId, status: "PRESENT" }]);
    portal = await listPortalCourse(token);
    expect(portal!.topics[0]).toMatchObject({ open: true, coveredOn: expect.any(String) });
    expect(portal!.topics[0]!.blocks).toHaveLength(4);
    // Files come through the student's own link; YouTube and web links stay as they are.
    const file = portal!.topics[0]!.blocks.find((b) => b.kind === "FILE")!;
    expect(file.url).toBe(`/api/v1/public/class/${token}/files/documents/${"a".repeat(32)}.pdf`);
    expect(await portalFileAllowed(token, `documents/${"a".repeat(32)}.pdf`)).toBe(true);
    expect(portal!.topics[0]!.blocks.find((b) => b.kind === "VIDEO")!.url).toBe(
      "https://youtu.be/dQw4w9WgXcQ",
    );

    // The teacher opens Greetings now and Numbers from tomorrow; a stranger cannot.
    await expect(
      setTopicRelease(stranger, groupId, greetings.id, { mode: "now" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await setTopicRelease(teacher, groupId, greetings.id, { mode: "now" })).toEqual({
      mode: "now",
      date: null,
    });
    const tomorrow = shift(1);
    expect(
      await setTopicRelease(teacher, groupId, numbers.id, { mode: "date", date: tomorrow }),
    ).toEqual({ mode: "date", date: tomorrow });
    syllabus = await getGroupSyllabus(teacher, groupId);
    expect(syllabus.topics.map((t) => [t.release.mode, t.open])).toEqual([
      ["lesson", true],
      ["now", true],
      ["date", false],
    ]);
    portal = await listPortalCourse(token);
    expect(portal!.open).toBe(2);
    expect(portal!.topics[1]!.blocks[0]).toMatchObject({ kind: "TEXT", body: "Hello, goodbye." });
    expect(portal!.topics[2]).toMatchObject({ open: false, opensOn: tomorrow, blocks: [] });

    // A date in the past opens it; "after the lesson" closes it again (no lesson covered it).
    await setTopicRelease(teacher, groupId, numbers.id, { mode: "date", date: shift(-1) });
    expect((await listPortalCourse(token))!.topics[2]!.open).toBe(true);
    await setTopicRelease(teacher, groupId, numbers.id, { mode: "lesson" });
    expect((await listPortalCourse(token))!.topics[2]!.open).toBe(false);
    // A topic of another course is refused.
    const other = await createCourse(ceo, {
      branchId,
      name: `${TAG} Other`,
      description: undefined,
      price: 0,
      durationMonths: 1,
      gradingSystemId: null,
      color: null,
    });
    const [foreign] = await setCourseSyllabus(ceo, other.id, { topics: [{ title: "Other" }] });
    await expect(
      setTopicRelease(teacher, groupId, foreign!.id, { mode: "now" }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    expect(alphabet.id).toBeTruthy();
  });
});
