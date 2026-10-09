/**
 * Homework against the real database: a teacher sets a task for a lesson, the
 * student answers through their personal link, the teacher accepts or returns
 * it, coins follow the "Uy vazifasi" rule (A-79, A-102).
 * Rows carry a run-specific tag and are removed at the end.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/rbac/default-roles";
import { homeworkSchema } from "@/lib/validation/groups";
import { prisma } from "@/server/db/prisma";
import type { Actor } from "@/server/rbac/authorize";
import { createGroup } from "@/server/services/groups/groups.service";
import { addMember } from "@/server/services/groups/memberships.service";
import {
  deleteHomework,
  listGroupHomework,
  listPortalHomework,
  portalFileAllowed,
  reviewSubmission,
  setHomework,
  submitHomework,
} from "@/server/services/homework/homework.service";
import { createBranch } from "@/server/services/settings/branches.service";
import { createCourse } from "@/server/services/settings/courses.service";
import { listStudentLinks } from "@/server/services/video/video.service";
import { DEMO_ORG_ID, demoBranchIds } from "./support/tenant";

const RUN = String(Date.now() % 100_000).padStart(5, "0");
const TAG = `h${RUN}`;
const phone = (n: number) => `+99894${RUN}${String(n).padStart(2, "0")}`;

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

let branchId: string;
let groupId: string;
let membershipOne: string;
let studentOne: string;
let tokenOne: string;
let lessonId: string;
let homeworkId: string;
let previousAutoCoins: boolean | null = null;
let organizationId: string;

beforeAll(async () => {
  organizationId = DEMO_ORG_ID;
  const settings = await prisma.orgSettings.findUnique({ where: { organizationId } });
  previousAutoCoins = settings?.autoCoins ?? null;
  await prisma.orgSettings.update({ where: { organizationId }, data: { autoCoins: true } });
  await prisma.coinRule.upsert({
    where: { organizationId_event: { organizationId, event: "HOMEWORK" } },
    update: { isActive: true, amount: 10 },
    create: { organizationId, event: "HOMEWORK", amount: 10, isActive: true },
  });

  const teacherRole = await prisma.role.findFirstOrThrow({ where: { code: "TEACHER" } });
  for (const [a, n, withRole] of [
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
    if (withRole) {
      await prisma.userRole.create({ data: { userId: user.id, roleId: teacherRole.id } });
    }
  }
  branchId = (await createBranch(ceo, { name: `${TAG} A`, isActive: true })).id;
  ceo.branchIds = await demoBranchIds();
  ceo.activeBranchId = branchId;
  await prisma.userBranch.createMany({
    data: [teacher, otherTeacher].map((a) => ({ userId: a.userId, branchId })),
  });
  teacher.branchIds = [branchId];
  otherTeacher.branchIds = [branchId];
  const courseId = (
    await createCourse(ceo, {
      branchId,
      name: `${TAG} German`,
      description: undefined,
      price: 0,
      durationMonths: 2,
      gradingSystemId: null,
      color: null,
    })
  ).id;
  groupId = (
    await createGroup(ceo, {
      branchId,
      name: `${TAG} A1`,
      courseId,
      gradingSystemId: null,
      weekdayPattern: "ODD",
      slots: [1, 3, 5].map((weekday) => ({
        weekday,
        startTime: "18:00",
        endTime: "19:30",
        roomId: null,
      })),
      teachers: [{ userId: teacher.userId, role: "MAIN", shareType: "PERCENT", shareValue: 40 }],
      startDate: "2026-09-01",
      endDate: null,
      status: "ACTIVE",
    })
  ).id;
  const one = await addMember(ceo, groupId, {
    newStudent: { fullName: `${TAG} Student One`, phone: phone(11) },
    joinedAt: "2026-09-01",
    status: "ACTIVE",
    customPrice: null,
    note: null,
  });
  membershipOne = one.id;
  studentOne = one.studentId;
  await addMember(ceo, groupId, {
    newStudent: { fullName: `${TAG} Student Two` },
    joinedAt: "2026-09-01",
    status: "ACTIVE",
    customPrice: null,
    note: null,
  });
  lessonId = (
    await prisma.lesson.findFirstOrThrow({ where: { groupId }, orderBy: { date: "asc" } })
  ).id;
  tokenOne = (await listStudentLinks(teacher, groupId)).find(
    (l) => l.membershipId === membershipOne,
  )!.token;
});

afterAll(async () => {
  if (previousAutoCoins !== null) {
    await prisma.orgSettings.update({
      where: { organizationId },
      data: { autoCoins: previousAutoCoins },
    });
  }
  // Guarded: a setup that failed early must not turn these into table-wide deletes.
  if (groupId) await prisma.group.deleteMany({ where: { id: groupId } });
  await prisma.student.deleteMany({ where: { fullName: { startsWith: TAG } } });
  await prisma.course.deleteMany({ where: { name: { startsWith: TAG } } });
  await prisma.user.deleteMany({ where: { fullName: { startsWith: TAG } } });
  if (branchId) await prisma.branch.deleteMany({ where: { id: branchId } });
});

describe("homework", () => {
  it("validates the form the way the dialog sends it", () => {
    expect(
      homeworkSchema.parse({ text: " Read p. 12 ", linkUrl: "", attachmentUrl: null, dueDate: "" }),
    ).toEqual({ text: "Read p. 12", linkUrl: null, attachmentUrl: null, dueDate: null });
    expect(homeworkSchema.safeParse({ text: "x", linkUrl: "not a url" }).success).toBe(false);
    expect(homeworkSchema.safeParse({ text: "" }).success).toBe(false);
  });

  it("lets the group's teacher set one homework per lesson", async () => {
    await expect(
      setHomework(otherTeacher, lessonId, {
        text: "x",
        linkUrl: null,
        attachmentUrl: null,
        dueDate: null,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const created = await setHomework(teacher, lessonId, {
      text: "Learn the alphabet",
      linkUrl: "https://example.org/abc",
      attachmentUrl: "/api/v1/files/documents/" + "a".repeat(32) + ".pdf",
      dueDate: "2026-10-10",
    });
    homeworkId = created.id;
    expect(created).toMatchObject({
      lessonId,
      text: "Learn the alphabet",
      dueDate: "2026-10-10",
      createdByName: `${TAG} Teacher`,
    });
    expect(created.submissions).toHaveLength(2);
    expect(created.submissions.every((s) => s.status === null)).toBe(true);

    // Setting again replaces the task and keeps the id.
    const replaced = await setHomework(teacher, lessonId, {
      text: "Learn the alphabet, A–M",
      linkUrl: null,
      attachmentUrl: created.attachmentUrl,
      dueDate: null,
    });
    expect(replaced.id).toBe(homeworkId);
    expect(replaced.dueDate).toBeNull();

    const list = await listGroupHomework(teacher, groupId);
    expect(list.items.map((h) => h.id)).toEqual([homeworkId]);
    expect(list.lessons.find((l) => l.id === lessonId)?.hasHomework).toBe(true);
    expect(list.lessons.some((l) => !l.hasHomework)).toBe(true);
    expect(
      await prisma.auditLog.count({
        where: { entityId: homeworkId, action: { in: ["homework.create", "homework.update"] } },
      }),
    ).toBe(2);
  });

  it("shows the student their task through the link and takes their answer", async () => {
    const items = (await listPortalHomework(tokenOne))!;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      id: homeworkId,
      text: "Learn the alphabet, A–M",
      submission: null,
    });
    // Files are served through the link, not the staff endpoint.
    expect(items[0]!.attachmentUrl).toMatch(/^\/api\/v1\/public\/class\/.+\/files\/documents\//);
    expect(await portalFileAllowed(tokenOne, `documents/${"a".repeat(32)}.pdf`)).toBe(true);
    expect(await portalFileAllowed(tokenOne, `documents/${"b".repeat(32)}.pdf`)).toBe(false);

    await expect(
      submitHomework(tokenOne, homeworkId, { note: "", attachmentUrl: null }),
    ).rejects.toMatchObject({
      code: "VALIDATION",
    });
    await submitHomework(tokenOne, homeworkId, { note: "Done: A to M", attachmentUrl: null });
    const after = (await listPortalHomework(tokenOne))!;
    expect(after[0]!.submission).toMatchObject({ status: "SUBMITTED", note: "Done: A to M" });

    const staff = await listGroupHomework(teacher, groupId);
    const row = staff.items[0]!.submissions.find((s) => s.membershipId === membershipOne)!;
    expect(row).toMatchObject({ status: "SUBMITTED", note: "Done: A to M" });
    expect(await listPortalHomework("not-a-real-token-at-all-123")).toBeNull();
  });

  it("awards the homework coins once on accept and takes them back on return", async () => {
    await reviewSubmission(teacher, homeworkId, membershipOne, {
      status: "ACCEPTED",
      teacherComment: "Sehr gut",
    });
    const coins = () =>
      prisma.coinTransaction.aggregate({
        where: { studentId: studentOne },
        _sum: { amount: true },
      });
    expect((await coins())._sum.amount).toBe(10);
    // Accepting twice does not pay twice.
    await reviewSubmission(teacher, homeworkId, membershipOne, { status: "ACCEPTED" });
    expect((await coins())._sum.amount).toBe(10);
    // An accepted answer is final for the student.
    await expect(
      submitHomework(tokenOne, homeworkId, { note: "again", attachmentUrl: null }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    expect((await listPortalHomework(tokenOne))![0]!.submission).toMatchObject({
      status: "ACCEPTED",
      teacherComment: "Sehr gut",
    });

    await reviewSubmission(teacher, homeworkId, membershipOne, {
      status: "RETURNED",
      teacherComment: "Please add N–Z",
    });
    expect((await coins())._sum.amount ?? 0).toBe(0);
    // Returned: the student may answer again, which clears the teacher's note.
    await submitHomework(tokenOne, homeworkId, { note: "A to Z", attachmentUrl: null });
    expect((await listPortalHomework(tokenOne))![0]!.submission).toMatchObject({
      status: "SUBMITTED",
      teacherComment: null,
    });
  });

  it("marks a speaking task and carries the recording and the teacher's spoken reply", async () => {
    const audio = `/api/v1/files/homework/${"d".repeat(32)}.weba`;
    const reply = `/api/v1/files/documents/${"e".repeat(32)}.weba`;
    const spoken = await setHomework(teacher, lessonId, {
      text: "Introduce yourself in five sentences",
      linkUrl: null,
      attachmentUrl: null,
      speaking: true,
      dueDate: null,
    });
    expect(spoken.speaking).toBe(true);
    expect((await listPortalHomework(tokenOne))![0]!.speaking).toBe(true);

    await submitHomework(tokenOne, homeworkId, { note: null, attachmentUrl: audio });
    await reviewSubmission(teacher, homeworkId, membershipOne, {
      status: "RETURNED",
      teacherComment: "Mind the th sound",
      teacherAudioUrl: reply,
    });
    const portal = (await listPortalHomework(tokenOne))![0]!.submission!;
    expect(portal.attachmentUrl).toMatch(/^\/api\/v1\/public\/class\/.+\/files\/homework\//);
    expect(portal.teacherAudioUrl).toMatch(/^\/api\/v1\/public\/class\/.+\/files\/documents\//);
    expect(await portalFileAllowed(tokenOne, `documents/${"e".repeat(32)}.weba`)).toBe(true);
    const staff = await listGroupHomework(teacher, groupId);
    expect(staff.items[0]!.submissions.find((x) => x.membershipId === membershipOne)).toMatchObject(
      { attachmentUrl: audio, teacherAudioUrl: reply, status: "RETURNED" },
    );
    // Accepting without a new recording keeps the spoken reply; a new answer clears it.
    await reviewSubmission(teacher, homeworkId, membershipOne, { status: "RETURNED" });
    expect((await listPortalHomework(tokenOne))![0]!.submission!.teacherAudioUrl).not.toBeNull();
    await submitHomework(tokenOne, homeworkId, { note: "Take two", attachmentUrl: audio });
    expect((await listPortalHomework(tokenOne))![0]!.submission!.teacherAudioUrl).toBeNull();
  });

  it("deletes the task with its answers and coins", async () => {
    await reviewSubmission(teacher, homeworkId, membershipOne, { status: "ACCEPTED" });
    await expect(deleteHomework(otherTeacher, homeworkId)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await deleteHomework(teacher, homeworkId);
    expect(await prisma.homework.findUnique({ where: { id: homeworkId } })).toBeNull();
    expect(await prisma.coinTransaction.count({ where: { studentId: studentOne } })).toBe(0);
    expect(await listPortalHomework(tokenOne)).toEqual([]);
  });
});
