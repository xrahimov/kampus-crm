/**
 * Group, lesson and membership services against the real database (Phase 5).
 * Rows created here carry a run-specific tag and are removed at the end.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/rbac/default-roles";
import { prisma } from "@/server/db/prisma";
import type { Actor } from "@/server/rbac/authorize";
import {
  addGroupDayOff,
  addGroupNote,
  changeGroupTeacher,
  createGroup,
  finishGroup,
  getGroup,
  listGroupHistory,
  listGroups,
  setSupportTeachers,
  updateGroup,
} from "@/server/services/groups/groups.service";
import {
  addExtraLesson,
  getMonthGrid,
  markAttendance,
  setGrades,
  updateLesson,
} from "@/server/services/groups/lessons.service";
import {
  addMember,
  listMembers,
  removeMember,
  searchStudents,
  updateMembership,
} from "@/server/services/groups/memberships.service";
import { getGroupFormOptions } from "@/server/services/groups/options.service";
import { createBranch } from "@/server/services/settings/branches.service";
import { createCourse } from "@/server/services/settings/courses.service";
import { createRoom } from "@/server/services/settings/rooms.service";
import { getTeacher, listTeachers } from "@/server/services/staff/teachers.service";
import { DEMO_ORG_ID, demoBranchIds } from "./support/tenant";

const RUN = String(Date.now() % 100_000).padStart(5, "0");
const TAG = `g${RUN}`;
const phone = (n: number) => `+99891${RUN}${String(n).padStart(2, "0")}`;

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
const teacherA = actor("Teacher A", ["TEACHER"], [...DEFAULT_ROLE_PERMISSIONS.TEACHER]);
const teacherB = actor("Teacher B", ["TEACHER"], [...DEFAULT_ROLE_PERMISSIONS.TEACHER]);
const cashier = actor("Cashier", ["CASHIER"], ["payments.create"]);

let branchA: string;
let branchB: string;
let courseA: string;
let courseB: string;
let roomA: string;
let roomB: string;

const list = {
  page: 1,
  pageSize: 100,
  skip: 0,
  take: 100,
  sort: { field: "name" as const, direction: "asc" as const },
};

beforeAll(async () => {
  const teacherRole = await prisma.role.findUniqueOrThrow({ where: { code: "TEACHER" } });
  for (const [a, n] of [
    [ceo, 1],
    [teacherA, 2],
    [teacherB, 3],
    [cashier, 4],
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
  await prisma.userRole.createMany({
    data: [teacherA, teacherB].map((t) => ({ userId: t.userId, roleId: teacherRole.id })),
  });
  branchA = (await createBranch(ceo, { name: `${TAG} A`, isActive: true })).id;
  branchB = (await createBranch(ceo, { name: `${TAG} B`, isActive: true })).id;
  ceo.branchIds = await demoBranchIds();
  await prisma.userBranch.createMany({
    data: [teacherA, teacherB].map((t) => ({ userId: t.userId, branchId: branchA })),
  });
  teacherA.branchIds = [branchA];
  teacherB.branchIds = [branchA];
  const course = (branchId: string) =>
    createCourse(ceo, {
      branchId,
      name: `${TAG} English`,
      description: undefined,
      price: 500_000,
      durationMonths: 2,
      gradingSystemId: null,
      color: null,
    });
  courseA = (await course(branchA)).id;
  courseB = (await course(branchB)).id;
  roomA = (await createRoom(ceo, { branchId: branchA, name: `${TAG} R1`, capacity: 10 })).id;
  roomB = (await createRoom(ceo, { branchId: branchB, name: `${TAG} R2`, capacity: 10 })).id;
});

afterAll(async () => {
  const branchIds = [branchA, branchB].filter(Boolean);
  const groups = await prisma.group.findMany({ where: { branchId: { in: branchIds } } });
  await prisma.auditLog.deleteMany({
    where: { OR: [{ branchId: { in: branchIds } }, { entityId: { in: groups.map((g) => g.id) } }] },
  });
  await prisma.group.deleteMany({ where: { branchId: { in: branchIds } } });
  const students = await prisma.student.findMany({ where: { branchId: { in: branchIds } } });
  await prisma.auditLog.deleteMany({ where: { entityId: { in: students.map((s) => s.id) } } });
  await prisma.student.deleteMany({ where: { branchId: { in: branchIds } } });
  await prisma.room.deleteMany({ where: { branchId: { in: branchIds } } });
  await prisma.course.deleteMany({ where: { branchId: { in: branchIds } } });
  const users = await prisma.user.findMany({ where: { phone: { startsWith: `+99891${RUN}` } } });
  const ids = users.map((u) => u.id);
  await prisma.auditLog.deleteMany({ where: { actorId: { in: ids } } });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  await prisma.branch.deleteMany({ where: { id: { in: branchIds } } });
  await prisma.$disconnect();
});

const slotsEven = [
  { weekday: 2, startTime: "09:00", endTime: "10:30", roomId: null },
  { weekday: 4, startTime: "09:00", endTime: "10:30", roomId: null },
  { weekday: 6, startTime: "09:00", endTime: "10:30", roomId: null },
];
const groupInput = () => ({
  branchId: branchA,
  name: `${TAG} GE-1`,
  courseId: courseA,
  gradingSystemId: null,
  weekdayPattern: "EVEN" as const,
  slots: slotsEven,
  teachers: [
    {
      userId: teacherA.userId,
      role: "MAIN" as const,
      shareType: "PERCENT" as const,
      shareValue: 40,
    },
  ],
  startDate: "2026-09-01",
  endDate: null,
  status: "ACTIVE" as const,
});

describe("authorization", () => {
  it("refuses a cashier to read and a teacher to create", async () => {
    await expect(listGroups(cashier, list)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(createGroup(teacherA, groupInput())).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(getGroupFormOptions(cashier)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("groups", () => {
  let groupId: string;

  it("creates a group, defaults the end date (A-51) and generates lessons from the schedule", async () => {
    const dto = await createGroup(ceo, groupInput());
    groupId = dto.id;
    expect(dto).toMatchObject({
      name: `${TAG} GE-1`,
      courseName: `${TAG} English`,
      weekdayPattern: "EVEN",
      startDate: "2026-09-01",
      endDate: "2026-11-01",
      status: "ACTIVE",
      activeStudents: 0,
      months: ["2026-09", "2026-10", "2026-11"],
    });
    expect(dto.teachers).toEqual([
      expect.objectContaining({
        userId: teacherA.userId,
        role: "MAIN",
        shareValue: 40,
        since: "2026-09-01",
      }),
    ]);
    // 2026-09-01 (Tue) … 2026-11-01 (Sun): 9 Tuesdays, 9 Thursdays, 9 Saturdays.
    expect(await prisma.lesson.count({ where: { groupId } })).toBe(27);
    const audit = await prisma.auditLog.findFirst({
      where: { entityId: groupId, action: "group.create" },
    });
    expect(audit?.actorId).toBe(ceo.userId);
  });

  it("validates slots against the pattern, rooms and teachers against the branch, and the course", async () => {
    await expect(
      createGroup(ceo, {
        ...groupInput(),
        slots: [{ weekday: 1, startTime: "09:00", endTime: "10:00", roomId: null }],
      }),
    ).rejects.toMatchObject({ code: "VALIDATION", fields: { slots: ["validation.slotsPattern"] } });
    await expect(
      createGroup(ceo, { ...groupInput(), slots: [{ ...slotsEven[0]!, roomId: roomB }] }),
    ).rejects.toMatchObject({ code: "VALIDATION", fields: { slots: ["validation.roomBranch"] } });
    await expect(
      createGroup(ceo, {
        ...groupInput(),
        teachers: [{ userId: cashier.userId, role: "MAIN", shareType: "PERCENT", shareValue: 1 }],
      }),
    ).rejects.toMatchObject({
      code: "VALIDATION",
      fields: { teachers: ["validation.teacherUnknown"] },
    });
    await expect(createGroup(ceo, { ...groupInput(), courseId: courseB })).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "errors.courseNotFound",
    });
    const ok = await createGroup(ceo, {
      ...groupInput(),
      name: `${TAG} Room`,
      slots: [{ ...slotsEven[0]!, roomId: roomA }],
      weekdayPattern: "CUSTOM",
      // Teacher A already teaches GE-1 at this hour; the clash check (A-116) has its own suite.
      ignoreClashes: true,
    });
    expect(ok.slots[0]?.roomName).toBe(`${TAG} R1`);
    expect(ok.months).toEqual(["2026-09", "2026-10", "2026-11"]);
  });

  it("shows a teacher only their own groups (A-52) and the full list to the CEO", async () => {
    const mine = await listGroups(teacherA, list, { status: "ALL" });
    expect(mine.items.map((g) => g.name)).toEqual([`${TAG} GE-1`, `${TAG} Room`]);
    const none = await listGroups(teacherB, list, { status: "ALL" });
    expect(none.items).toHaveLength(0);
    await expect(getGroup(teacherB, groupId)).rejects.toMatchObject({ code: "FORBIDDEN" });
    const all = await listGroups(ceo, list, { teacherId: teacherA.userId });
    expect(all.items.length).toBeGreaterThanOrEqual(2);

    // The teacher's profile now counts these groups (Phase 4 left them at zero).
    const detail = await getTeacher(ceo, teacherA.userId);
    expect(detail.stats).toEqual({ courses: 1, activeGroups: 2, activeStudents: 0 });
    expect(detail.groups.map((g) => g.name).sort()).toEqual([`${TAG} GE-1`, `${TAG} Room`]);
    const rows = await listTeachers(
      ceo,
      { ...list, sort: { field: "fullName", direction: "asc" } },
      { kind: "teachers" },
    );
    expect(rows.items.find((r) => r.id === teacherA.userId)?.groupNames).toContain(`${TAG} GE-1`);
  });

  it("supports support teachers, teacher change and notes", async () => {
    const withSupport = await setSupportTeachers(ceo, groupId, [teacherB.userId]);
    expect(withSupport.supportTeachers).toEqual([
      { userId: teacherB.userId, fullName: `${TAG} Teacher B` },
    ]);
    // teacherB now sees the group as its support teacher.
    expect((await listGroups(teacherB, list)).items.map((g) => g.id)).toEqual([groupId]);
    await setSupportTeachers(ceo, groupId, []);

    const swapped = await changeGroupTeacher(ceo, groupId, teacherA.userId, {
      userId: teacherB.userId,
      role: "MAIN",
      shareType: "PER_LESSON",
      shareValue: 100_000,
    });
    expect(swapped.teachers).toEqual([
      expect.objectContaining({
        userId: teacherB.userId,
        shareType: "PER_LESSON",
        // The newcomer is dated from the day of the change.
        since: new Date().toISOString().slice(0, 10),
      }),
    ]);
    await changeGroupTeacher(ceo, groupId, teacherB.userId, {
      userId: teacherA.userId,
      role: "MAIN",
      shareType: "PERCENT",
      shareValue: 40,
    });

    const note = await addGroupNote(ceo, groupId, "Needs a projector");
    expect(note).toMatchObject({ text: "Needs a projector", authorName: ceo.fullName });
  });

  describe("members, attendance and grades", () => {
    let membershipId: string;
    let secondId: string;
    let firstLessonId: string;

    it("adds a new minimal student and an existing one, and refuses the same student twice", async () => {
      const first = await addMember(ceo, groupId, {
        newStudent: { fullName: `${TAG} Student One`, phone: "+998900000099" },
        joinedAt: "2026-09-01",
        customPrice: 450_000,
        note: null,
        status: "ACTIVE",
      });
      membershipId = first.id;
      expect(first).toMatchObject({
        fullName: `${TAG} Student One`,
        status: "ACTIVE",
        customPrice: 450000,
      });

      const found = await searchStudents(ceo, `${TAG} Student`);
      expect(found.map((s) => s.id)).toEqual([first.studentId]);
      expect(await searchStudents(ceo, "x")).toEqual([]);

      await expect(
        addMember(ceo, groupId, {
          studentId: first.studentId,
          joinedAt: "2026-09-01",
          status: "ACTIVE",
        }),
      ).rejects.toMatchObject({
        code: "VALIDATION",
        fields: { studentId: ["validation.duplicate"] },
      });

      const second = await addMember(ceo, groupId, {
        newStudent: { fullName: `${TAG} Student Two` },
        joinedAt: "2026-09-08",
        status: "TRIAL",
      });
      secondId = second.id;
      expect((await getGroup(ceo, groupId)).activeStudents).toBe(2);
      // A teacher without students.create cannot invent students.
      await expect(
        addMember(teacherA, groupId, {
          newStudent: { fullName: "Nope" },
          joinedAt: "2026-09-01",
          status: "ACTIVE",
        }),
      ).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("builds the month grid and lets the teacher mark attendance and grades", async () => {
      const grid = await getMonthGrid(teacherA, groupId, "2026-09");
      expect(grid.lessons.map((l) => l.date).slice(0, 3)).toEqual([
        "2026-09-01",
        "2026-09-03",
        "2026-09-05",
      ]);
      expect(grid.lessons).toHaveLength(13);
      expect(grid.members.map((m) => m.fullName)).toEqual([
        `${TAG} Student One`,
        `${TAG} Student Two`,
      ]);
      firstLessonId = grid.lessons[0]!.id;

      await markAttendance(teacherA, firstLessonId, [
        { membershipId, status: "PRESENT" },
        { membershipId: secondId, status: "ABSENT", comment: "ill" },
      ]);
      await setGrades(teacherA, firstLessonId, [{ membershipId, score: 4 }]);
      await setGrades(teacherA, grid.lessons[1]!.id, [{ membershipId, score: 5 }]);
      await updateLesson(teacherA, firstLessonId, { topic: "Greetings" });

      const after = await getMonthGrid(ceo, groupId, "2026-09");
      expect(after.lessons[0]).toMatchObject({
        topic: "Greetings",
        attendance: {
          [membershipId]: { status: "PRESENT", comment: null },
          [secondId]: { status: "ABSENT", comment: "ill" },
        },
        grades: { [membershipId]: { score: 4, comment: null } },
      });
      expect(after.members[0]?.average).toBe(4.5);
      // "Lessons held" counts the lessons whose date has passed, marked or not.
      const held = await prisma.lesson.count({
        where: {
          groupId,
          date: { lte: new Date(`${new Date().toISOString().slice(0, 10)}T00:00:00.000Z`) },
        },
      });
      expect((await getGroup(ceo, groupId)).lessonsHeld).toBe(held);

      await expect(
        markAttendance(teacherA, firstLessonId, [{ membershipId: "nope", status: "PRESENT" }]),
      ).rejects.toMatchObject({
        code: "VALIDATION",
        fields: { membershipId: ["validation.memberUnknown"] },
      });
      await expect(
        markAttendance(cashier, firstLessonId, [{ membershipId, status: "PRESENT" }]),
      ).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
      // Clearing a grade deletes it.
      await setGrades(teacherA, grid.lessons[1]!.id, [{ membershipId, score: null }]);
      expect((await getMonthGrid(ceo, groupId, "2026-09")).members[0]?.average).toBe(4);
    });

    it("adds an extra lesson and keeps it through a schedule change (A-54)", async () => {
      const extra = await addExtraLesson(ceo, groupId, {
        date: "2026-09-02",
        startTime: "11:00",
        endTime: "12:00",
      });
      expect(extra.isExtra).toBe(true);
      await expect(
        addExtraLesson(ceo, groupId, { date: "2026-09-02", startTime: "11:00", endTime: "12:00" }),
      ).rejects.toMatchObject({ code: "VALIDATION" });

      // EVEN → ODD: unmarked Tue/Thu/Sat lessons go, Mon/Wed/Fri arrive, the marked lesson and the extra stay.
      const updated = await updateGroup(ceo, groupId, {
        weekdayPattern: "ODD",
        slots: [1, 3, 5].map((weekday) => ({
          weekday,
          startTime: "10:00",
          endTime: "11:30",
          roomId: roomA,
        })),
      });
      expect(updated.weekdayPattern).toBe("ODD");
      const lessons = await prisma.lesson.findMany({
        where: { groupId },
        orderBy: { date: "asc" },
      });
      const dates = lessons.map((l) => l.date.toISOString().slice(0, 10));
      expect(dates).toContain("2026-09-01"); // marked Tuesday kept
      expect(dates).toContain("2026-09-02"); // extra lesson kept
      expect(dates).not.toContain("2026-09-03"); // unmarked Thursday removed
      expect(dates).toContain("2026-09-07"); // first Monday added
      expect(
        lessons.filter((l) => !l.isExtra && l.date.toISOString().slice(0, 10) !== "2026-09-01"),
      ).toHaveLength(26);
    });

    it("records a group day off and drops that day's unmarked lesson (A-53)", async () => {
      await addGroupDayOff(ceo, groupId, { date: "2026-09-07", reason: "Open day" });
      expect(
        await prisma.lesson.count({
          where: { groupId, date: new Date("2026-09-07T00:00:00.000Z") },
        }),
      ).toBe(0);
      await expect(
        addGroupDayOff(ceo, groupId, { date: "2026-09-07", reason: "Again" }),
      ).rejects.toMatchObject({
        code: "VALIDATION",
      });
    });

    it("enforces membership transitions (A-08) and removal", async () => {
      const frozen = await updateMembership(ceo, membershipId, { status: "FROZEN" });
      expect(frozen.status).toBe("FROZEN");
      await expect(
        updateMembership(ceo, membershipId, { status: "GRADUATED" }),
      ).rejects.toMatchObject({
        code: "VALIDATION",
        fields: { status: ["validation.statusTransition"] },
      });
      await updateMembership(ceo, membershipId, { status: "ACTIVE" });
      const removed = await removeMember(ceo, secondId);
      expect(removed.status).toBe("ARCHIVED");
      expect(removed.leftAt).not.toBeNull();
      expect((await listMembers(ceo, groupId)).map((m) => m.id)).toEqual([membershipId]);
      expect((await listMembers(ceo, groupId, { archived: true })).map((m) => m.id)).toEqual([
        secondId,
      ]);
      await expect(updateMembership(ceo, secondId, { status: "ACTIVE" })).rejects.toMatchObject({
        code: "VALIDATION",
      });
      // Teachers can read members but not change them.
      expect(await listMembers(teacherA, groupId)).toHaveLength(1);
      await expect(removeMember(teacherA, membershipId)).rejects.toMatchObject({
        code: "FORBIDDEN",
      });
    });

    it("finishes the group: archived, members graduated, future lessons gone, history readable", async () => {
      const done = await finishGroup(ceo, groupId);
      expect(done.status).toBe("ARCHIVED");
      const members = await listMembers(ceo, groupId, { archived: true });
      expect(members.find((m) => m.id === membershipId)?.status).toBe("GRADUATED");
      const today = new Date().toISOString().slice(0, 10);
      const future = await prisma.lesson.count({
        where: { groupId, date: { gt: new Date(`${today}T00:00:00.000Z`) } },
      });
      expect(future).toBe(0);
      await expect(
        addMember(ceo, groupId, {
          newStudent: { fullName: "Late" },
          joinedAt: today,
          status: "ACTIVE",
        }),
      ).rejects.toMatchObject({ code: "CONFLICT", message: "errors.groupArchived" });

      const history = await listGroupHistory(ceo, groupId, {
        page: 1,
        pageSize: 100,
        skip: 0,
        take: 100,
      });
      const fields = history.items.map((h) => `${h.action}:${h.field}`);
      expect(fields).toContain("group.update:weekdayPattern");
      expect(fields).toContain("group.finish:status");
      expect(fields).toContain("group.changeTeacher:teachers");
      const pattern = history.items.find((h) => h.field === "weekdayPattern");
      expect(pattern).toMatchObject({ before: "EVEN", after: "ODD", actorName: `${TAG} CEO` });
      // Hidden from the active list, back with status=ALL.
      expect((await listGroups(ceo, list)).items.some((g) => g.id === groupId)).toBe(false);
      expect(
        (await listGroups(ceo, list, { status: "ALL" })).items.some((g) => g.id === groupId),
      ).toBe(true);
    });
  });
});
