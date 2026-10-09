/**
 * Bulk actions on students and leads (A-132) against the real database: add to
 * a group, give a discount, archive and restore many students; move, archive and
 * restore many leads; the ticked-leads SMS target; permissions and scope.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/rbac/default-roles";
import { prisma } from "@/server/db/prisma";
import type { Actor } from "@/server/rbac/authorize";
import { createGroup } from "@/server/services/groups/groups.service";
import { createBoard } from "@/server/services/leads/boards.service";
import { bulkLeads, createLead, getLead } from "@/server/services/leads/leads.service";
import { createBranch } from "@/server/services/settings/branches.service";
import { createCourse } from "@/server/services/settings/courses.service";
import { resolveRecipients } from "@/server/services/sms/sms.service";
import { bulkStudents } from "@/server/services/students/bulk.service";
import { createStudent, listStudents } from "@/server/services/students/students.service";

import { DEMO_ORG_ID, demoBranchIds } from "./support/tenant";

const RUN = String(Date.now() % 100_000).padStart(5, "0");
const TAG = `bk${RUN}`;
const phone = (n: number) => `+99891${RUN}${String(n).padStart(2, "0")}`;
const TODAY = new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString().slice(0, 10);

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
/** An admin of branch A only: branch B's rows are out of scope for them. */
const admin = actor("Admin", ["ADMIN"], [...DEFAULT_ROLE_PERMISSIONS.ADMIN, "discounts.give"]);
const viewer = actor("Viewer", ["VIEWER"], ["students.view", "leads.view"]);

let branchA: string;
let branchB: string;
let groupA: string;
let groupA2: string;
let columnId: string;
let column2: string;
const students: Record<string, string> = {};
const leads: string[] = [];

beforeAll(async () => {
  for (const [a, n] of [
    [ceo, 1],
    [admin, 2],
    [viewer, 3],
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
  branchA = (await createBranch(ceo, { name: `${TAG} A`, isActive: true })).id;
  branchB = (await createBranch(ceo, { name: `${TAG} B`, isActive: true })).id;
  ceo.branchIds = await demoBranchIds();
  ceo.activeBranchId = branchA;
  admin.branchIds = [branchA];
  viewer.branchIds = [branchA];
  await prisma.userBranch.createMany({
    data: [admin, viewer].map((a) => ({ userId: a.userId, branchId: branchA })),
  });
  const courseId = (
    await createCourse(ceo, {
      branchId: branchA,
      name: `${TAG} Course`,
      description: undefined,
      price: 500_000,
      durationMonths: 3,
      gradingSystemId: null,
      color: "#0F766E",
    })
  ).id;
  const group = (name: string) =>
    createGroup(ceo, {
      branchId: branchA,
      name,
      courseId,
      gradingSystemId: null,
      weekdayPattern: "ODD",
      slots: [1, 3, 5].map((weekday) => ({
        weekday,
        startTime: "10:00",
        endTime: "11:30",
        roomId: null,
      })),
      teachers: [],
      startDate: TODAY,
      endDate: null,
      status: "ACTIVE",
    });
  groupA = (await group(`${TAG} Group A`)).id;
  groupA2 = (await group(`${TAG} Group A2`)).id;
  const student = (name: string, n: number, branchId: string, groupId: string | null) =>
    createStudent(ceo, {
      branchId,
      fullName: `${TAG} ${name}`,
      phone: phone(n),
      birthDate: null,
      gender: "MALE",
      photoUrl: null,
      password: null,
      sourceId: null,
      schoolId: null,
      note: null,
      membership: groupId
        ? { groupId, joinedAt: TODAY, customPrice: null, note: null, status: "ACTIVE" }
        : null,
    });
  students.alice = (await student("Alice", 10, branchA, groupA)).id;
  students.bob = (await student("Bob", 11, branchA, null)).id;
  students.carl = (await student("Carl", 12, branchA, null)).id;
  students.dora = (await student("Dora", 13, branchB, null)).id;
  await prisma.student.update({ where: { id: students.carl }, data: { isArchived: true } });

  const boardId = (await createBoard(ceo, { name: `${TAG} Board`, branchId: branchA })).id;
  const cols = await prisma.leadColumn.findMany({
    where: { boardId },
    orderBy: { sortOrder: "asc" },
  });
  columnId = cols[0]!.id;
  column2 = (
    await prisma.leadColumn.create({ data: { boardId, name: `${TAG} Next`, sortOrder: 9 } })
  ).id;
  for (const [name, n] of [
    ["Lead One", 20],
    ["Lead Two", 21],
  ] as const) {
    leads.push(
      (
        await createLead(ceo, {
          columnId,
          fullName: `${TAG} ${name}`,
          phones: n === 20 ? [phone(n)] : [],
          birthDate: null,
          age: null,
          sourceId: null,
          teacherId: null,
          days: null,
          lessonTime: null,
          status: "NEW",
          temperature: null,
          comment: null,
        })
      ).id,
    );
  }
});

afterAll(async () => {
  const branches = [branchA, branchB];
  const users = [ceo, admin, viewer].map((a) => a.userId);
  const ids = Object.values(students);
  await prisma.auditLog.deleteMany({
    where: {
      OR: [
        { branchId: { in: branches } },
        { actorId: { in: users } },
        { entityId: { in: [...ids, ...leads] } },
      ],
    },
  });
  await prisma.notification.deleteMany({ where: { userId: { in: users } } });
  await prisma.lead.deleteMany({ where: { branchId: { in: branches } } });
  await prisma.leadBoard.deleteMany({ where: { branchId: { in: branches } } });
  await prisma.smsMessage.deleteMany({ where: { studentId: { in: ids } } });
  await prisma.coinTransaction.deleteMany({ where: { studentId: { in: ids } } });
  await prisma.discount.deleteMany({ where: { membership: { studentId: { in: ids } } } });
  await prisma.groupMembership.deleteMany({ where: { studentId: { in: ids } } });
  await prisma.group.deleteMany({ where: { branchId: { in: branches } } });
  await prisma.student.deleteMany({ where: { branchId: { in: branches } } });
  await prisma.course.deleteMany({ where: { branchId: { in: branches } } });
  await prisma.userBranch.deleteMany({ where: { branchId: { in: branches } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.branch.deleteMany({ where: { id: { in: branches } } });
  await prisma.$disconnect();
});

describe("bulk actions on students", () => {
  it("adds the ticked students to a group, skipping members, the archived and the out-of-scope", async () => {
    const result = await bulkStudents(admin, {
      action: "addToGroup",
      studentIds: [students.alice!, students.bob!, students.carl!, students.dora!],
      groupId: groupA,
      joinedAt: TODAY,
      status: "ACTIVE",
    });
    expect(result).toEqual({ done: 1, skipped: 3 });
    const bob = await prisma.groupMembership.findMany({ where: { studentId: students.bob } });
    expect(bob.map((m) => [m.groupId, m.status])).toEqual([[groupA, "ACTIVE"]]);
    const audit = await prisma.auditLog.count({
      where: { action: "membership.create", entityId: bob[0]!.id },
    });
    expect(audit).toBe(1);
  });

  it("gives the discount on each one's membership in the chosen group", async () => {
    // Alice and Bob are in group A; Carl has no open membership; the price must be below the course's.
    const result = await bulkStudents(admin, {
      action: "discount",
      studentIds: [students.alice!, students.bob!, students.carl!],
      groupId: groupA,
      discountedPrice: 400_000,
      months: 2,
      comment: "autumn",
    });
    expect(result).toEqual({ done: 2, skipped: 1 });
    const rows = await prisma.discount.findMany({
      where: { membership: { groupId: groupA } },
      select: { amount: true, months: true, comment: true },
    });
    expect(rows).toHaveLength(2);
    expect(rows.every((d) => Number(d.amount) === 100_000 && d.months === 2)).toBe(true);
    // A price not below the regular one gives nothing: everyone is skipped.
    expect(
      await bulkStudents(admin, {
        action: "discount",
        studentIds: [students.alice!],
        groupId: groupA2,
        discountedPrice: 400_000,
        months: 1,
      }),
    ).toEqual({ done: 0, skipped: 1 });
  });

  it("archives and restores many, within the actor's branches and permission", async () => {
    await expect(
      bulkStudents(viewer, { action: "archive", studentIds: [students.alice!] }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const archived = await bulkStudents(admin, {
      action: "archive",
      studentIds: [students.alice!, students.bob!, students.carl!, students.dora!],
    });
    // Carl was archived already, Dora is in branch B.
    expect(archived).toEqual({ done: 2, skipped: 2 });
    const gone = await prisma.student.findMany({
      where: { id: { in: [students.alice!, students.bob!] } },
      select: { isArchived: true, memberships: { select: { status: true } } },
    });
    expect(gone.every((s) => s.isArchived)).toBe(true);
    expect(gone.flatMap((s) => s.memberships).every((m) => m.status === "ARCHIVED")).toBe(true);
    const restored = await bulkStudents(admin, {
      action: "restore",
      studentIds: [students.alice!, students.bob!],
    });
    expect(restored).toEqual({ done: 2, skipped: 0 });
    // The Excel export of a selection: only those ids.
    const page = await listStudents(
      ceo,
      {
        page: 1,
        pageSize: 50,
        skip: 0,
        take: 50,
        q: undefined,
        sort: { field: "fullName", direction: "asc" },
      },
      { ids: [students.alice!, students.bob!] },
    );
    expect(page.items.map((s) => s.id).sort()).toEqual([students.alice!, students.bob!].sort());
  });
});

describe("bulk actions on leads", () => {
  it("moves, archives and restores the ticked leads, skipping those already there", async () => {
    expect(await bulkLeads(admin, { action: "move", leadIds: leads, columnId: column2 })).toEqual({
      done: 2,
      skipped: 0,
    });
    expect(await bulkLeads(admin, { action: "move", leadIds: leads, columnId: column2 })).toEqual({
      done: 0,
      skipped: 2,
    });
    expect((await getLead(ceo, leads[0]!)).columnId).toBe(column2);
    expect(await bulkLeads(admin, { action: "archive", leadIds: leads })).toEqual({
      done: 2,
      skipped: 0,
    });
    expect((await getLead(ceo, leads[1]!)).isArchived).toBe(true);
    expect(await bulkLeads(admin, { action: "restore", leadIds: [...leads, "nope"] })).toEqual({
      done: 2,
      skipped: 1,
    });
    await expect(bulkLeads(viewer, { action: "archive", leadIds: leads })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    const audits = await prisma.auditLog.count({
      where: {
        entityId: { in: leads },
        action: { in: ["lead.move", "lead.archive", "lead.restore"] },
      },
    });
    expect(audits).toBe(6);
  });

  it("addresses an SMS to the ticked leads with a phone", async () => {
    const { recipients, skipped } = await resolveRecipients(admin, {
      kind: "leads",
      leadIds: leads,
    });
    expect(recipients.map((r) => [r.type, r.name, r.phone])).toEqual([
      ["LEAD", `${TAG} Lead One`, phone(20)],
    ]);
    expect(skipped).toBe(1);
  });
});
