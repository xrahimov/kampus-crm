/**
 * Lead boards, leads, sources and forms against the real database (Phase 7).
 * Rows carry a run-specific tag and are removed at the end.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/rbac/default-roles";
import { prisma } from "@/server/db/prisma";
import type { Actor } from "@/server/rbac/authorize";
import { createGroup } from "@/server/services/groups/groups.service";
import {
  activateStudents,
  addMember,
  listMembers,
} from "@/server/services/groups/memberships.service";
import {
  createBoard,
  createColumn,
  deleteBoard,
  deleteColumn,
  listBoards,
  updateBoard,
  updateColumn,
} from "@/server/services/leads/boards.service";
import {
  createForm,
  deleteForm,
  FORM_SUBMIT_MAX,
  getPublicForm,
  listForms,
  submitPublicForm,
  updateForm,
} from "@/server/services/leads/forms.service";
import {
  addLeadsToGroup,
  createLead,
  deleteLead,
  getBoardView,
  getLead,
  getLeadOptions,
  moveLead,
  returnToLeads,
  setLeadArchived,
  updateLead,
} from "@/server/services/leads/leads.service";
import {
  createSource,
  deleteSource,
  listSources,
  updateSource,
} from "@/server/services/leads/sources.service";
import { createBranch } from "@/server/services/settings/branches.service";
import { createCourse } from "@/server/services/settings/courses.service";
import { getStudent } from "@/server/services/students/students.service";

const RUN = String(Date.now() % 100_000).padStart(5, "0");
const TAG = `l${RUN}`;
const phone = (n: number) => `+99894${RUN}${String(n).padStart(2, "0")}`;

const actor = (fullName: string, roles: string[], permissions: string[]): Actor => ({
  userId: "",
  fullName,
  roles,
  permissions,
  branchIds: [],
  activeBranchId: null,
});
const ceo = actor("CEO", ["CEO"], ["*"]);
const teacher = actor("Teacher", ["TEACHER"], [...DEFAULT_ROLE_PERMISSIONS.TEACHER]);
const watcher = actor("Watcher", ["WATCHER"], ["leads.view"]);
const outsider = actor("Outsider", ["ADMIN"], ["leads.view", "leads.create", "leads.update"]);

let branchA: string;
let branchB: string;
let groupA: string;
let boardId: string;
let newColumn: string;
let contacted: string;
let sourceId: string;

beforeAll(async () => {
  const teacherRole = await prisma.role.findUniqueOrThrow({ where: { code: "TEACHER" } });
  for (const [a, n] of [
    [ceo, 1],
    [teacher, 2],
    [watcher, 3],
    [outsider, 4],
  ] as const) {
    const user = await prisma.user.create({
      data: { phone: phone(n), fullName: `${TAG} ${a.fullName}`, passwordHash: "x" },
    });
    a.userId = user.id;
  }
  await prisma.userRole.create({ data: { userId: teacher.userId, roleId: teacherRole.id } });
  branchA = (await createBranch(ceo, { name: `${TAG} A`, isActive: true })).id;
  branchB = (await createBranch(ceo, { name: `${TAG} B`, isActive: true })).id;
  ceo.activeBranchId = branchA;
  await prisma.userBranch.createMany({
    data: [
      { userId: teacher.userId, branchId: branchA },
      { userId: watcher.userId, branchId: branchA },
      { userId: outsider.userId, branchId: branchB },
    ],
  });
  teacher.branchIds = [branchA];
  watcher.branchIds = [branchA];
  outsider.branchIds = [branchB];
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
  groupA = (
    await createGroup(ceo, {
      branchId: branchA,
      name: `${TAG} GE-A`,
      courseId: courseA,
      gradingSystemId: null,
      weekdayPattern: "EVEN",
      slots: [2, 4, 6].map((weekday) => ({
        weekday,
        startTime: "10:00",
        endTime: "11:30",
        roomId: null,
      })),
      teachers: [{ userId: teacher.userId, role: "MAIN", shareType: "PERCENT", shareValue: 40 }],
      startDate: "2026-09-01",
      endDate: null,
      status: "ACTIVE",
    })
  ).id;
});

afterAll(async () => {
  const branches = [branchA, branchB];
  const leads = await prisma.lead.findMany({ where: { branchId: { in: branches } } });
  const students = await prisma.student.findMany({ where: { branchId: { in: branches } } });
  const memberships = await prisma.groupMembership.findMany({
    where: { studentId: { in: students.map((s) => s.id) } },
  });
  const boards = await prisma.leadBoard.findMany({ where: { branchId: { in: branches } } });
  const columns = await prisma.leadColumn.findMany({
    where: { boardId: { in: boards.map((b) => b.id) } },
  });
  const forms = await prisma.leadForm.findMany({ where: { slug: { startsWith: TAG } } });
  const sources = await prisma.leadSource.findMany({ where: { name: { startsWith: TAG } } });
  await prisma.auditLog.deleteMany({
    where: {
      OR: [
        { branchId: { in: branches } },
        {
          entityId: {
            in: [
              ...leads,
              ...students,
              ...memberships,
              ...boards,
              ...columns,
              ...forms,
              ...sources,
            ].map((x) => x.id),
          },
        },
      ],
    },
  });
  await prisma.leadForm.deleteMany({ where: { slug: { startsWith: TAG } } });
  await prisma.lead.deleteMany({ where: { branchId: { in: branches } } });
  await prisma.leadBoard.deleteMany({ where: { branchId: { in: branches } } });
  await prisma.leadSource.deleteMany({ where: { name: { startsWith: TAG } } });
  await prisma.group.deleteMany({ where: { branchId: { in: branches } } });
  await prisma.student.deleteMany({ where: { branchId: { in: branches } } });
  await prisma.course.deleteMany({ where: { branchId: { in: branches } } });
  await prisma.loginAttempt.deleteMany({ where: { key: `form:ip:${TAG}` } });
  const users = await prisma.user.findMany({ where: { phone: { startsWith: `+99894${RUN}` } } });
  const ids = users.map((u) => u.id);
  await prisma.auditLog.deleteMany({ where: { actorId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.branch.deleteMany({ where: { id: { in: branches } } });
  await prisma.$disconnect();
});

const leadInput = (name: string, columnId: string, n: number) => ({
  columnId,
  fullName: `${TAG} ${name}`,
  phones: [phone(n)],
  birthDate: null,
  age: null,
  sourceId: null,
  teacherId: null,
  days: null,
  lessonTime: null,
  status: "NEW" as const,
  temperature: null,
  comment: null,
});

describe("lead boards and columns", () => {
  it("creates a board with a first column, renames it and adds columns", async () => {
    const board = await createBoard(ceo, { name: "Website", branchId: branchA });
    boardId = board.id;
    expect(board.leadCount).toBe(0);
    const boards = await listBoards(ceo);
    expect(boards.map((b) => b.id)).toContain(boardId);
    const renamed = await updateBoard(ceo, boardId, { name: `${TAG} Site` });
    expect(renamed.name).toBe(`${TAG} Site`);
    const view = await getBoardView(ceo, { boardId });
    expect(view.columns).toHaveLength(1);
    expect(view.columns[0]!.name).toBe("NEW LEADS");
    newColumn = view.columns[0]!.id;
    contacted = (await createColumn(ceo, boardId, { name: "Contacted" })).id;
    await expect(createColumn(ceo, boardId, { name: "Contacted" })).rejects.toMatchObject({
      code: "VALIDATION",
    });
    const renamedColumn = await updateColumn(ceo, contacted, { name: "Bog'lanildi" });
    expect(renamedColumn.sortOrder).toBe(1);
    await expect(createBoard(watcher, { name: "X", branchId: branchA })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    // Another branch's manager cannot touch this board.
    await expect(updateBoard(outsider, boardId, { name: "Y" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("refuses to delete the last column or a board with leads", async () => {
    const extra = await createColumn(ceo, boardId, { name: "Temp" });
    await deleteColumn(ceo, extra.id);
    const lonely = await createBoard(ceo, { name: `${TAG} Lonely`, branchId: branchA });
    const [only] = (await getBoardView(ceo, { boardId: lonely.id })).columns;
    await expect(deleteColumn(ceo, only!.id)).rejects.toMatchObject({ code: "CONFLICT" });
    await createLead(ceo, leadInput("Blocker", only!.id, 9));
    await expect(deleteBoard(ceo, lonely.id)).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("leads", () => {
  let leadA: string;
  let leadB: string;

  it("creates leads with phones and lists them per column, with filters", async () => {
    sourceId = (await createSource(ceo, { name: `${TAG} Instagram`, isActive: true })).id;
    const a = await createLead(ceo, {
      ...leadInput("Alice", newColumn, 10),
      phones: [phone(10), phone(11)],
      sourceId,
      teacherId: teacher.userId,
      days: "EVEN",
      lessonTime: "10:00",
      temperature: "HOT",
      age: 17,
      comment: "Wants the morning group",
    });
    leadA = a.id;
    expect(a.phones).toEqual([phone(10), phone(11)]);
    expect(a.sourceName).toBe(`${TAG} Instagram`);
    expect(a.teacherName).toBe(`${TAG} Teacher`);
    leadB = (await createLead(ceo, leadInput("Bob", newColumn, 12))).id;
    const view = await getBoardView(ceo, { boardId });
    const first = view.columns.find((c) => c.id === newColumn)!;
    expect(first.leads.map((l) => l.id)).toEqual([leadA, leadB]);
    expect(first.total).toBe(2);
    expect(view.board?.leadCount).toBe(2);
    const filtered = await getBoardView(ceo, { boardId, q: phone(11).slice(-6) });
    expect(filtered.columns.find((c) => c.id === newColumn)!.leads.map((l) => l.id)).toEqual([
      leadA,
    ]);
    const byTeacher = await getBoardView(ceo, { boardId, teacherId: teacher.userId, days: "EVEN" });
    expect(byTeacher.columns.find((c) => c.id === newColumn)!.leads).toHaveLength(1);
    const options = await getLeadOptions(ceo);
    expect(options.lessonTimes).toContain("10:00");
    expect(options.boards.find((b) => b.id === boardId)?.columns.length).toBe(2);
    // Outsiders (other branch) see nothing of this board.
    await expect(getLead(outsider, leadA)).rejects.toMatchObject({ code: "FORBIDDEN" });
    // A teacher-only user has no leads permission by default.
    await expect(getBoardView(teacher)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("validates a teacher outside the branch and a column of another branch", async () => {
    await expect(
      createLead(ceo, { ...leadInput("Bad", newColumn, 13), teacherId: outsider.userId }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    const other = await createBoard(ceo, { name: `${TAG} Other`, branchId: branchB });
    const otherColumn = await prisma.leadColumn.findFirstOrThrow({ where: { boardId: other.id } });
    await expect(moveLead(ceo, leadA, { columnId: otherColumn.id })).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });

  it("moves leads between and inside columns, keeping order", async () => {
    const moved = await moveLead(ceo, leadB, { columnId: contacted });
    expect(moved.columnId).toBe(contacted);
    const c = (await createLead(ceo, leadInput("Carl", newColumn, 14))).id;
    // Carl before Alice inside the first column.
    await moveLead(ceo, c, { columnId: newColumn, beforeLeadId: leadA });
    const view = await getBoardView(ceo, { boardId });
    expect(view.columns.find((x) => x.id === newColumn)!.leads.map((l) => l.id)).toEqual([
      c,
      leadA,
    ]);
    expect(view.columns.find((x) => x.id === contacted)!.leads.map((l) => l.id)).toEqual([leadB]);
    const audit = await prisma.auditLog.findFirst({
      where: { entityId: leadB, action: "lead.move" },
    });
    expect(audit).not.toBeNull();
    await deleteLead(ceo, c);
  });

  it("updates, archives, restores and replaces phones", async () => {
    const updated = await updateLead(ceo, leadA, {
      status: "CONTACTED",
      temperature: "WARM",
      phones: [phone(15)],
      teacherId: null,
    });
    expect(updated.status).toBe("CONTACTED");
    expect(updated.phones).toEqual([phone(15)]);
    expect(updated.teacherId).toBeNull();
    await setLeadArchived(ceo, leadA, true);
    const active = await getBoardView(ceo, { boardId });
    expect(active.columns.find((x) => x.id === newColumn)!.leads).toHaveLength(0);
    const archived = await getBoardView(ceo, { boardId, archived: true });
    expect(archived.columns.find((x) => x.id === newColumn)!.leads.map((l) => l.id)).toEqual([
      leadA,
    ]);
    await setLeadArchived(ceo, leadA, false);
    await expect(deleteLead(watcher, leadA)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("adds leads to a group as students and returns a member to leads", async () => {
    const result = await addLeadsToGroup(ceo, {
      leadIds: [leadA, leadB],
      groupId: groupA,
      joinedAt: "2026-10-01",
      status: "NEW",
    });
    expect(result).toEqual({ added: 2, skipped: 0 });
    const converted = await getLead(ceo, leadA);
    expect(converted.isArchived).toBe(true);
    expect(converted.studentId).not.toBeNull();
    expect(converted.convertedAt).not.toBeNull();
    const student = await getStudent(ceo, converted.studentId!);
    expect(student.fullName).toBe(`${TAG} Alice`);
    expect(student.phone).toBe(phone(15));
    expect(student.groups[0]).toMatchObject({ groupId: groupA, status: "NEW" });
    const members = await listMembers(ceo, groupA);
    expect(members).toHaveLength(2);

    // Activate from the students list (A-68): both NEW members become ACTIVE.
    expect(
      await activateStudents(
        ceo,
        members.map((m) => m.studentId),
      ),
    ).toBe(2);
    expect((await listMembers(ceo, groupA)).every((m) => m.status === "ACTIVE")).toBe(true);

    // Return Alice to leads: membership closes, a new lead appears linked to the same student.
    const alice = members.find((m) => m.studentId === converted.studentId)!;
    const lead = await returnToLeads(ceo, alice.id, { reason: "Changed her mind" });
    expect(lead.studentId).toBe(converted.studentId);
    expect(lead.boardId).toBe(boardId);
    expect(lead.comment).toBe("Changed her mind");
    expect(lead.phones).toEqual([phone(15)]);
    const closed = await listMembers(ceo, groupA, { archived: true });
    expect(closed.find((m) => m.id === alice.id)).toMatchObject({
      status: "ARCHIVED",
      leaveReason: "Changed her mind",
    });
    await expect(returnToLeads(ceo, alice.id, {})).rejects.toMatchObject({ code: "CONFLICT" });

    // Adding her back from the new lead reuses the student; adding twice skips.
    const again = await addLeadsToGroup(ceo, {
      leadIds: [lead.id],
      groupId: groupA,
      joinedAt: "2026-10-05",
      status: "ACTIVE",
    });
    expect(again).toEqual({ added: 1, skipped: 0 });
    const reopened = await listMembers(ceo, groupA);
    expect(reopened.find((m) => m.studentId === converted.studentId)).toMatchObject({
      id: alice.id,
      status: "ACTIVE",
      joinedAt: "2026-10-05",
      leftAt: null,
    });
    const twice = await createLead(ceo, { ...leadInput("Alice again", newColumn, 15) });
    await prisma.lead.update({
      where: { id: twice.id },
      data: { studentId: converted.studentId },
    });
    expect(
      await addLeadsToGroup(ceo, {
        leadIds: [twice.id],
        groupId: groupA,
        joinedAt: "2026-10-05",
        status: "ACTIVE",
      }),
    ).toEqual({ added: 0, skipped: 1 });
    expect((await prisma.student.count({ where: { branchId: branchA } })).valueOf()).toBe(2);
    await expect(
      addLeadsToGroup(watcher, {
        leadIds: [leadB],
        groupId: groupA,
        joinedAt: "2026-10-01",
        status: "NEW",
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("returns a member to leads in a branch without boards by creating one (A-67)", async () => {
    const courseB = await createCourse(ceo, {
      branchId: branchB,
      name: `${TAG} Math`,
      description: undefined,
      price: 300_000,
      durationMonths: 1,
      gradingSystemId: null,
      color: null,
    });
    await prisma.leadBoard.deleteMany({ where: { branchId: branchB } });
    const groupB = await createGroup(ceo, {
      branchId: branchB,
      name: `${TAG} M-B`,
      courseId: courseB.id,
      gradingSystemId: null,
      weekdayPattern: "ODD",
      slots: [1, 3, 5].map((weekday) => ({
        weekday,
        startTime: "12:00",
        endTime: "13:00",
        roomId: null,
      })),
      teachers: [],
      startDate: "2026-10-01",
      endDate: null,
      status: "ACTIVE",
    });
    ceo.activeBranchId = null;
    const member = await addMember(ceo, groupB.id, {
      newStudent: { fullName: `${TAG} Dana`, phone: phone(20) },
      joinedAt: "2026-10-01",
      customPrice: null,
      note: null,
      status: "ACTIVE",
    });
    const lead = await returnToLeads(ceo, member.id, {});
    const board = await prisma.leadBoard.findUniqueOrThrow({ where: { id: lead.boardId } });
    expect(board).toMatchObject({ branchId: branchB, name: "Website" });
    ceo.activeBranchId = branchA;
  });
});

describe("sources", () => {
  it("counts leads per source inside the date range and manages the catalogue", async () => {
    const list = await listSources(ceo);
    const mine = list.find((s) => s.id === sourceId)!;
    // Alice's original lead plus the one created when she returned to leads (same source).
    expect(mine.leadCount).toBe(2);
    const none = await listSources(ceo, { from: "2020-01-01", to: "2020-01-31" });
    expect(none.find((s) => s.id === sourceId)!.leadCount).toBe(0);
    const today = new Date().toISOString().slice(0, 10);
    const thisDay = await listSources(ceo, { from: today, to: today });
    expect(thisDay.find((s) => s.id === sourceId)!.leadCount).toBe(2);
    await updateSource(ceo, sourceId, { isActive: false });
    expect((await getLeadOptions(ceo)).sources.map((s) => s.id)).not.toContain(sourceId);
    await expect(
      createSource(ceo, { name: `${TAG} Instagram`, isActive: true }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(deleteSource(watcher, sourceId)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const extra = await createSource(ceo, { name: `${TAG} Flyer`, isActive: true });
    await deleteSource(ceo, extra.id);
  });
});

describe("lead forms", () => {
  let formId: string;
  const slug = `${TAG}-site`;

  it("creates a form and accepts public submissions into its column", async () => {
    const form = await createForm(ceo, {
      name: `${TAG} Landing`,
      slug,
      columnId: contacted,
      sourceId,
      integration: null,
      isActive: true,
    });
    formId = form.id;
    expect(form.columnName).toBe("Bog'lanildi");
    expect((await listForms(ceo)).map((f) => f.id)).toContain(formId);
    expect(await getPublicForm(slug)).toMatchObject({ name: `${TAG} Landing` });
    const created = await submitPublicForm(
      slug,
      { fullName: `${TAG} Visitor`, phone: phone(30), comment: "From the site" },
      TAG,
    );
    const lead = await getLead(ceo, created.id);
    expect(lead).toMatchObject({
      columnId: contacted,
      sourceId,
      formName: `${TAG} Landing`,
      phones: [phone(30)],
      comment: "From the site",
    });
    expect((await listForms(ceo)).find((f) => f.id === formId)!.leadCount).toBe(1);
    await expect(
      createForm(ceo, {
        name: "Dup",
        slug,
        columnId: contacted,
        sourceId: null,
        integration: null,
        isActive: true,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
  });

  it("rate-limits submissions per IP and refuses inactive forms", async () => {
    const taken = await prisma.loginAttempt.count({ where: { key: `form:ip:${TAG}` } });
    for (let i = taken; i < FORM_SUBMIT_MAX; i += 1) {
      await submitPublicForm(
        slug,
        { fullName: `${TAG} V${i}`, phone: phone(40 + i), comment: null },
        TAG,
      );
    }
    await expect(
      submitPublicForm(slug, { fullName: `${TAG} Late`, phone: phone(60), comment: null }, TAG),
    ).rejects.toMatchObject({ code: "RATE_LIMITED" });
    await updateForm(ceo, formId, { isActive: false });
    expect(await getPublicForm(slug)).toBeNull();
    await expect(
      submitPublicForm(slug, { fullName: "X", phone: phone(61), comment: null }, `${TAG}-other`),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await deleteForm(ceo, formId);
    expect(
      (
        await getLead(
          ceo,
          (await prisma.lead.findFirstOrThrow({ where: { fullName: `${TAG} Visitor` } })).id,
        )
      ).formName,
    ).toBeNull();
  });
});
