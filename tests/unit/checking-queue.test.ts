/**
 * The teacher's checking queue (A-160) against the real database: which
 * answers wait, in what order, who sees them, and how a verdict or a second
 * answer moves them.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/rbac/default-roles";
import { prisma } from "@/server/db/prisma";
import type { Actor } from "@/server/rbac/authorize";
import { createGroup } from "@/server/services/groups/groups.service";
import {
  countCheckingQueue,
  listCheckingQueue,
} from "@/server/services/homework/checking-queue.service";
import {
  reviewSubmission,
  setHomework,
  submitHomework,
} from "@/server/services/homework/homework.service";
import { createBranch } from "@/server/services/settings/branches.service";
import { createCourse } from "@/server/services/settings/courses.service";
import { createStudent } from "@/server/services/students/students.service";
import { listStudentLinks } from "@/server/services/video/video.service";

import { DEMO_ORG_ID, demoBranchIds } from "./support/tenant";

const RUN = String(Date.now() % 100_000).padStart(5, "0");
const TAG = `cq${RUN}`;
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
/** A teacher of the same branch who is not on the group. */
const other: Actor = { ...teacher, fullName: "Other" };
const cashier: Actor = { ...ceo, roles: ["CASHIER"], permissions: ["payments.create"] };

let groupId: string;
let homeworkId: string;
let anna: { membershipId: string; token: string };
let bob: { membershipId: string; token: string };

beforeAll(async () => {
  const [user, teacherUser, otherUser] = await Promise.all(
    ["CEO", "Teacher", "Other"].map((name, i) =>
      prisma.user.create({
        data: {
          phone: `+99895${RUN}5${i}`,
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
  cashier.userId = user!.id;
  const branchId = (await createBranch(ceo, { name: `${TAG} Branch`, isActive: true })).id;
  ceo.branchIds = await demoBranchIds();
  ceo.activeBranchId = branchId;
  for (const a of [teacher, other, cashier]) {
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
  const make = async (name: string, phone: string) => {
    const s = await createStudent(ceo, {
      branchId,
      fullName: `${TAG} ${name}`,
      phone,
      birthDate: null,
      gender: "MALE",
      photoUrl: null,
      password: null,
      sourceId: null,
      schoolId: null,
      note: null,
      membership: { groupId, joinedAt: shift(-7), customPrice: null, note: null, status: "ACTIVE" },
    });
    const link = (await listStudentLinks(ceo, groupId)).find((l) => l.studentId === s.id)!;
    return { membershipId: link.membershipId, token: link.token };
  };
  anna = await make("Anna", `+99895${RUN}41`);
  bob = await make("Bob", `+99895${RUN}42`);
  const lesson = await prisma.lesson.findFirstOrThrow({
    where: { groupId, date: { lt: new Date(`${shift(0)}T00:00:00Z`) } },
    orderBy: { date: "asc" },
  });
  homeworkId = (
    await setHomework(teacher, lesson.id, {
      text: "Write five sentences",
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

describe("the checking queue (A-160)", () => {
  it("lists waiting answers of the teacher's groups, oldest first, and empties as verdicts land", async () => {
    expect(await listCheckingQueue(teacher)).toEqual({ items: [], total: 0 });

    await submitHomework(bob.token, homeworkId, { note: "Bob first", attachmentUrl: null });
    await submitHomework(anna.token, homeworkId, { note: "Anna second", attachmentUrl: null });
    const queue = await listCheckingQueue(teacher);
    expect(queue.total).toBe(2);
    expect(queue.items.map((i) => [i.fullName, i.note])).toEqual([
      [`${TAG} Bob`, "Bob first"],
      [`${TAG} Anna`, "Anna second"],
    ]);
    expect(queue.items[0]).toMatchObject({
      homeworkId,
      membershipId: bob.membershipId,
      groupId,
      groupName: `${TAG} Group`,
      text: "Write five sentences",
      speaking: false,
    });
    expect(await countCheckingQueue(teacher)).toBe(2);
    // The office sees the whole branch; a teacher not on the group sees nothing; a cashier may not look.
    expect((await listCheckingQueue(ceo)).items.length).toBeGreaterThanOrEqual(2);
    expect(await listCheckingQueue(other)).toEqual({ items: [], total: 0 });
    expect(await countCheckingQueue(cashier)).toBe(0);
    await expect(listCheckingQueue(cashier)).rejects.toMatchObject({ code: "FORBIDDEN" });

    await reviewSubmission(teacher, homeworkId, bob.membershipId, { status: "ACCEPTED" });
    await reviewSubmission(teacher, homeworkId, anna.membershipId, {
      status: "RETURNED",
      teacherComment: "Five, not two",
    });
    expect(await listCheckingQueue(teacher)).toEqual({ items: [], total: 0 });

    // Anna answers again: back in the queue.
    await submitHomework(anna.token, homeworkId, { note: "Now five", attachmentUrl: null });
    const again = await listCheckingQueue(teacher);
    expect(again.items).toHaveLength(1);
    expect(again.items[0]).toMatchObject({
      membershipId: anna.membershipId,
      note: "Now five",
    });
  });
});
