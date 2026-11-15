/**
 * Views (A-194): someone who teaches and also runs a branch looks at Kampus
 * from either side. The pure rule first, then against the real database: what
 * a session carries in each view, that the choice only ever narrows, that two
 * branch managers stay out of each other's branch in both views, and what the
 * teacher's desk puts on top of Today.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/rbac/default-roles";
import { resolveStaffView, TEACHING_ROLE_CODES } from "@/lib/rbac/views";
import { TEACHER_KIND_ROLE } from "@/lib/validation/staff";
import { resolveCurrentUser } from "@/server/auth/current-user";
import { createSession } from "@/server/auth/session";
import { prisma } from "@/server/db/prisma";
import type { Actor } from "@/server/rbac/authorize";
import { setStaffView } from "@/server/services/auth.service";
import { createGroup, getGroup, listGroups } from "@/server/services/groups/groups.service";
import { setHomework, submitHomework } from "@/server/services/homework/homework.service";
import { createBranch } from "@/server/services/settings/branches.service";
import { createCourse } from "@/server/services/settings/courses.service";
import { createStudent, listStudents } from "@/server/services/students/students.service";
import { getTeachingDesk } from "@/server/services/today/teaching-desk.service";
import { nowInTashkent } from "@/server/services/today/today.service";
import { listStudentLinks } from "@/server/services/video/video.service";

import { DEMO_ORG_ID, demoBranchIds } from "./support/tenant";

const RUN = String(Date.now() % 100_000).padStart(5, "0");
const TAG = `sv${RUN}`;
const page = {
  page: 1,
  pageSize: 50,
  skip: 0,
  take: 50,
  sort: { field: "createdAt", direction: "asc" },
} as const;

const role = (code: keyof typeof DEFAULT_ROLE_PERMISSIONS) => ({
  code,
  name: code,
  permissions: [...DEFAULT_ROLE_PERMISSIONS[code]] as string[],
});

describe("resolveStaffView", () => {
  it("knows the same teaching roles as the staff forms", () => {
    expect([...TEACHING_ROLE_CODES].sort()).toEqual(Object.values(TEACHER_KIND_ROLE).sort());
  });

  it("offers both sides to a teacher who is also the branch manager, everything first", () => {
    const roles = [role("TEACHER"), role("BRANCH_MANAGER")];
    const untouched = resolveStaffView(roles, null);
    expect(untouched.canSwitch).toBe(true);
    expect(untouched.current).toBe("FULL");
    expect(untouched.roles.map((r) => r.code)).toEqual(["TEACHER", "BRANCH_MANAGER"]);

    const teaching = resolveStaffView(roles, "TEACHING");
    expect(teaching.current).toBe("TEACHING");
    expect(teaching.roles.map((r) => r.code)).toEqual(["TEACHER"]);
    expect(teaching.otherRoles.map((r) => r.code)).toEqual(["BRANCH_MANAGER"]);
  });

  it("gives one view to people with one side", () => {
    const teacher = resolveStaffView([role("TEACHER")], "FULL");
    expect(teacher).toMatchObject({ current: "TEACHING", canSwitch: false });
    expect(teacher.roles).toHaveLength(1);

    // A stale choice from the days they also taught changes nothing.
    const manager = resolveStaffView([role("BRANCH_MANAGER")], "TEACHING");
    expect(manager).toMatchObject({ current: "FULL", canSwitch: false });
    expect(manager.roles).toHaveLength(1);

    expect(resolveStaffView([], "TEACHING")).toMatchObject({ current: "FULL", canSwitch: false });
  });

  it("offers no switch when the other role adds nothing to see", () => {
    const both = resolveStaffView([role("TEACHER"), role("OTHER")], "TEACHING");
    expect(both).toMatchObject({ current: "FULL", canSwitch: false });
    expect(both.roles).toHaveLength(2);
  });

  it("never adds a permission", () => {
    const roles = [role("SUPPORT_TEACHER"), role("TEACHER"), role("CEO")];
    const all = new Set(roles.flatMap((r) => r.permissions));
    for (const chosen of [null, "TEACHING", "FULL"] as const) {
      for (const r of resolveStaffView(roles, chosen).roles) {
        for (const p of r.permissions) expect(all.has(p)).toBe(true);
      }
    }
    expect(resolveStaffView(roles, "TEACHING").roles.some((r) => r.code === "CEO")).toBe(false);
  });
});

describe("views against the database", () => {
  const ceo: Actor = {
    userId: "",
    fullName: "CEO",
    roles: ["CEO"],
    permissions: ["*"],
    organizationId: DEMO_ORG_ID,
    branchIds: [],
    activeBranchId: null,
  };
  /** Two people set up like Najotbek and Asadbek: each teaches in and manages their own branch. */
  let anna: { userId: string; token: string; branchId: string; groupId: string };
  let bek: { userId: string; token: string; branchId: string; groupId: string };
  /** A group in Anna's branch that someone else teaches. */
  let colleagueGroupId: string;
  let plainTeacher: { userId: string; token: string };
  const today = nowInTashkent().date;
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const shift = (n: number) => {
    const d = new Date(`${today}T00:00:00Z`);
    d.setUTCDate(d.getUTCDate() + n);
    return iso(d);
  };

  async function person(name: string, n: number, roleCodes: string[], branchId: string) {
    const user = await prisma.user.create({
      data: {
        phone: `+99896${RUN}6${n}`,
        fullName: `${TAG} ${name}`,
        passwordHash: "x",
        organizationId: DEMO_ORG_ID,
      },
    });
    const roles = await prisma.role.findMany({ where: { code: { in: roleCodes } } });
    await prisma.userRole.createMany({
      data: roles.map((r) => ({ userId: user.id, roleId: r.id })),
    });
    await prisma.userBranch.create({ data: { userId: user.id, branchId } });
    const session = await createSession(prisma, { userId: user.id, activeBranchId: branchId });
    return { userId: user.id, token: session.token };
  }

  async function group(name: string, branchId: string, teacherId: string) {
    const courseId = (
      await createCourse(ceo, {
        branchId,
        name: `${TAG} ${name} course`,
        description: undefined,
        price: 0,
        durationMonths: 3,
        gradingSystemId: null,
        color: null,
      })
    ).id;
    return (
      await createGroup(ceo, {
        branchId,
        name: `${TAG} ${name}`,
        courseId,
        gradingSystemId: null,
        weekdayPattern: "CUSTOM",
        // Late every day, so there is always a lesson still ahead today.
        slots: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
          weekday,
          startTime: "23:30",
          endTime: "23:59",
          roomId: null,
        })),
        teachers: [{ userId: teacherId, role: "MAIN", shareType: "PERCENT", shareValue: 0 }],
        startDate: shift(-7),
        endDate: null,
        status: "ACTIVE",
      })
    ).id;
  }

  async function student(name: string, n: number, branchId: string, groupId: string) {
    const s = await createStudent(ceo, {
      branchId,
      fullName: `${TAG} ${name}`,
      phone: `+99896${RUN}7${n}`,
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
    return { id: s.id, membershipId: link.membershipId, token: link.token };
  }

  const actorOf = async (token: string) => (await resolveCurrentUser(token))!;

  beforeAll(async () => {
    const boss = await prisma.user.create({
      data: {
        phone: `+99896${RUN}60`,
        fullName: `${TAG} CEO`,
        passwordHash: "x",
        organizationId: DEMO_ORG_ID,
      },
    });
    ceo.userId = boss.id;
    const annaBranch = (await createBranch(ceo, { name: `${TAG} Deutsch`, isActive: true })).id;
    const bekBranch = (await createBranch(ceo, { name: `${TAG} SAT`, isActive: true })).id;
    ceo.branchIds = await demoBranchIds();

    const both = ["TEACHER", "BRANCH_MANAGER"];
    const a = await person("Anna", 1, both, annaBranch);
    const b = await person("Bek", 2, both, bekBranch);
    const colleague = await person("Colleague", 3, ["TEACHER"], annaBranch);
    plainTeacher = colleague;
    anna = { ...a, branchId: annaBranch, groupId: await group("Deutsch A1", annaBranch, a.userId) };
    bek = { ...b, branchId: bekBranch, groupId: await group("SAT", bekBranch, b.userId) };
    colleagueGroupId = await group("Deutsch B1", annaBranch, colleague.userId);
  });

  afterAll(async () => {
    await prisma.session.deleteMany({
      where: { userId: { in: [anna.userId, bek.userId, plainTeacher.userId] } },
    });
  });

  it("opens with everything, and the teaching view carries the teacher role alone", async () => {
    const before = await actorOf(anna.token);
    expect(before.view).toMatchObject({ current: "FULL", canSwitch: true, pristine: true });
    expect(before.actor.roles.sort()).toEqual(["BRANCH_MANAGER", "TEACHER"]);
    expect(before.actor.permissions).toContain("dashboard.view");

    await setStaffView(anna.userId, "TEACHING");
    const teaching = await actorOf(anna.token);
    expect(teaching.view).toMatchObject({ current: "TEACHING", canSwitch: true, pristine: false });
    expect(teaching.view.otherRoles.map((r) => r.code)).toEqual(["BRANCH_MANAGER"]);
    expect(teaching.actor.roles).toEqual(["TEACHER"]);
    expect([...teaching.actor.permissions].sort()).toEqual(
      [...DEFAULT_ROLE_PERMISSIONS.TEACHER].sort(),
    );
    // The account still names both roles, and the branch is the same one.
    expect(teaching.roles.map((r) => r.code).sort()).toEqual(["BRANCH_MANAGER", "TEACHER"]);
    expect(teaching.actor.branchIds).toEqual([anna.branchId]);

    // The choice lives on the account: a second device opens the same way.
    const phone = await createSession(prisma, { userId: anna.userId, activeBranchId: null });
    expect((await actorOf(phone.token)).view.current).toBe("TEACHING");

    await setStaffView(anna.userId, "FULL");
    expect((await actorOf(anna.token)).actor.permissions).toContain("dashboard.view");
  });

  it("shows a teacher-manager only the groups they teach in the teaching view", async () => {
    await setStaffView(anna.userId, "FULL");
    const full = (await actorOf(anna.token)).actor;
    const asManager = (await listGroups(full, { ...page, q: TAG })).items.map((g) => g.id);
    expect(asManager.sort()).toEqual([anna.groupId, colleagueGroupId].sort());

    await setStaffView(anna.userId, "TEACHING");
    const teaching = (await actorOf(anna.token)).actor;
    const asTeacher = (await listGroups(teaching, { ...page, q: TAG })).items.map((g) => g.id);
    expect(asTeacher).toEqual([anna.groupId]);
    await expect(getGroup(teaching, colleagueGroupId)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("keeps two branch managers out of each other's branch in both views", async () => {
    const bekStudent = await student("Bek pupil", 1, bek.branchId, bek.groupId);
    for (const view of ["FULL", "TEACHING"] as const) {
      await setStaffView(anna.userId, view);
      const actor = (await actorOf(anna.token)).actor;
      expect(actor.branchIds).toEqual([anna.branchId]);
      const groups = (await listGroups(actor, { ...page, q: TAG })).items.map((g) => g.id);
      expect(groups).not.toContain(bek.groupId);
      await expect(getGroup(actor, bek.groupId)).rejects.toMatchObject({ code: "FORBIDDEN" });
      const students = (await listStudents(actor, { ...page, q: TAG })).items.map((s) => s.id);
      expect(students).not.toContain(bekStudent.id);
      const desk = await getTeachingDesk(actor);
      expect(desk.students.map((s) => s.studentId)).not.toContain(bekStudent.id);
      expect(desk.focus?.groupId).not.toBe(bek.groupId);
    }
  });

  it("lets only people with two sides choose", async () => {
    await expect(setStaffView(plainTeacher.userId, "FULL")).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(setStaffView(ceo.userId, "TEACHING")).rejects.toMatchObject({ code: "FORBIDDEN" });
    const current = await actorOf(plainTeacher.token);
    expect(current.view).toMatchObject({ current: "TEACHING", canSwitch: false });
  });

  it("puts the next lesson, the homework waiting and the students on the teacher's desk", async () => {
    await setStaffView(anna.userId, "TEACHING");
    const actor = (await actorOf(anna.token)).actor;
    const dovud = await student("Dovud", 2, anna.branchId, anna.groupId);

    // A lesson of yesterday with homework Dovud answered, and his mark for it.
    const yesterday = await prisma.lesson.findFirstOrThrow({
      where: { groupId: anna.groupId, date: new Date(`${shift(-1)}T00:00:00Z`) },
    });
    const homework = await setHomework(actor, yesterday.id, {
      text: "Seite 12",
      dueDate: null,
      linkUrl: null,
    });
    await submitHomework(dovud.token, homework.id, { note: "fertig", attachmentUrl: null });
    await prisma.attendance.create({
      data: { lessonId: yesterday.id, membershipId: dovud.membershipId, status: "PRESENT" },
    });

    // Ten in the morning in Tashkent: the evening lesson is still ahead.
    const desk = await getTeachingDesk(actor, prisma, new Date(`${today}T05:00:00Z`));
    expect(desk.groupCount).toBe(1);
    expect(desk.focus).toMatchObject({
      groupId: anna.groupId,
      date: today,
      startTime: "23:30",
      studentCount: 1,
    });
    expect(desk.focus!.studentNames).toEqual([`${TAG} Dovud`]);
    expect(desk.focus!.video.room).toBeNull();
    expect(desk.comingUp[0]).toMatchObject({ groupId: anna.groupId, date: shift(1) });
    expect(desk.comingUp.length).toBeLessThanOrEqual(5);
    expect(desk.checking).toMatchObject({ total: 1 });
    expect(desk.checking!.items[0]).toMatchObject({ fullName: `${TAG} Dovud` });
    expect(desk.students).toEqual([
      expect.objectContaining({ studentId: dovud.id, groupId: anna.groupId, marks: ["PRESENT"] }),
    ]);
    expect(desk.canHost).toBe(true);

    // The lesson under way is the one on top until it ends.
    const during = await getTeachingDesk(actor, prisma, new Date(`${today}T18:40:00Z`));
    expect(during.focus).toMatchObject({ date: today, underWay: true });
    const after = await getTeachingDesk(actor, prisma, new Date(`${today}T18:59:30Z`));
    expect(after.focus).toMatchObject({ date: shift(1), underWay: false });
  });

  it("tells a teacher without groups that the desk is empty", async () => {
    const lonely = await person("Lonely", 4, ["TEACHER"], bek.branchId);
    const desk = await getTeachingDesk((await actorOf(lonely.token)).actor);
    expect(desk).toMatchObject({ groupCount: 0, focus: null, students: [], studentCount: 0 });
    await prisma.session.deleteMany({ where: { userId: lonely.userId } });
  });
});
