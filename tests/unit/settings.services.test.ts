/**
 * Settings services against the real database. Every test uses its own
 * organisation-scoped names so runs do not interfere with the seed.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";
import type { Actor } from "@/server/rbac/authorize";
import { createBranch, listBranches } from "@/server/services/settings/branches.service";
import {
  archiveCourse,
  createCourse,
  listCourses,
  updateCourse,
} from "@/server/services/settings/courses.service";
import { createDayOff, listDaysOff } from "@/server/services/settings/days-off.service";
import {
  createGradingSystem,
  deleteGradingSystem,
  updateGradingSystem,
} from "@/server/services/settings/grading-systems.service";
import { getOrgSettings, updateOrgSettings } from "@/server/services/settings/org-settings.service";
import { createRoom, deleteRoom } from "@/server/services/settings/rooms.service";
import { createSchool, listSchools } from "@/server/services/settings/schools.service";
import { DEMO_ORG_ID, demoBranchIds } from "./support/tenant";

const TAG = `t${Date.now()}`;
let branchA: string;
let branchB: string;

// Audit rows reference real users, so each actor is backed by a row created below.
const PHONES = { ceo: "+998901120001", admin: "+998901120002", teacher: "+998901120003" };
const ceo: Actor = {
  userId: "",
  fullName: "CEO",
  roles: ["CEO"],
  permissions: ["*"],
  organizationId: DEMO_ORG_ID,
  branchIds: [],
  activeBranchId: null,
};
const adminA = (): Actor => ({
  userId: adminUserId,
  fullName: "Admin A",
  organizationId: DEMO_ORG_ID,
  roles: ["ADMIN"],
  permissions: ["settings.catalog"],
  branchIds: [branchA],
  activeBranchId: branchA,
});
const teacher: Actor = {
  userId: "",
  fullName: "Teacher",
  roles: ["TEACHER"],
  permissions: ["groups.view"],
  organizationId: DEMO_ORG_ID,
  branchIds: [],
  activeBranchId: null,
};
let adminUserId = "";

async function ensureUser(phone: string, fullName: string): Promise<string> {
  const user = await prisma.user.upsert({
    where: { phone },
    update: {},
    create: { phone, fullName, passwordHash: "x", organizationId: DEMO_ORG_ID },
  });
  return user.id;
}

const list = <F extends string>(field: F) => ({
  page: 1,
  pageSize: 50,
  skip: 0,
  take: 50,
  sort: { field, direction: "asc" as const },
});

beforeAll(async () => {
  // The seed (run by tests/unit/global-setup.ts) provides the deployment's single org (A-37).
  expect(await prisma.organization.findFirst({ where: { id: "org_demo" } })).not.toBeNull();
  ceo.userId = await ensureUser(PHONES.ceo, "Test CEO");
  adminUserId = await ensureUser(PHONES.admin, "Test Admin");
  teacher.userId = await ensureUser(PHONES.teacher, "Test Teacher");
  branchA = (await createBranch(ceo, { name: `${TAG} A`, isActive: true })).id;
  branchB = (await createBranch(ceo, { name: `${TAG} B`, isActive: true })).id;
  ceo.branchIds = await demoBranchIds();
});

afterAll(async () => {
  const branchIds = [branchA, branchB].filter(Boolean);
  await prisma.course.deleteMany({ where: { branchId: { in: branchIds } } });
  await prisma.room.deleteMany({ where: { branchId: { in: branchIds } } });
  await prisma.dayOff.deleteMany({ where: { branchId: { in: branchIds } } });
  await prisma.auditLog.deleteMany({ where: { branchId: { in: branchIds } } });
  await prisma.branch.deleteMany({ where: { id: { in: branchIds } } });
  await prisma.user.deleteMany({ where: { phone: { in: Object.values(PHONES) } } });
  await prisma.gradingSystem.deleteMany({ where: { name: { startsWith: TAG } } });
  await prisma.school.deleteMany({ where: { name: { startsWith: TAG } } });
  await prisma.$disconnect();
});

describe("authorization", () => {
  it("refuses every settings call to a role without the permission", async () => {
    await expect(getOrgSettings(teacher)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(listBranches(teacher)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      createRoom(teacher, { branchId: branchA, name: "x", capacity: 1 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(createSchool(teacher, { name: `${TAG} school` })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("lets a catalog user read branches but not create them", async () => {
    const branches = await listBranches(adminA());
    expect(branches.some((b) => b.id === branchA)).toBe(true);
    await expect(
      createBranch(adminA(), { name: `${TAG} C`, isActive: true }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("keeps a catalog user inside their own branches", async () => {
    await expect(
      createRoom(adminA(), { branchId: branchB, name: "Other", capacity: 5 }),
    ).rejects.toMatchObject({ code: "FORBIDDEN", message: "errors.branchForbidden" });
  });
});

describe("org settings", () => {
  it("round-trips switches and writes an audit row with before/after", async () => {
    const before = await getOrgSettings(ceo);
    const after = await updateOrgSettings(ceo, {
      ...before,
      attendanceComments: !before.attendanceComments,
      scheduleStepMinutes: 15,
    });
    expect(after.attendanceComments).toBe(!before.attendanceComments);
    expect(after.scheduleStepMinutes).toBe(15);
    // Other test files toggle their own switches concurrently, so compare only ours.
    expect(await getOrgSettings(ceo)).toMatchObject({
      attendanceComments: after.attendanceComments,
      scheduleStepMinutes: 15,
    });

    const audit = await prisma.auditLog.findFirst({
      where: { action: "settings.org.update", entityId: before.organizationId },
      orderBy: { createdAt: "desc" },
    });
    expect(audit).not.toBeNull();
    expect((audit?.before as { attendanceComments: boolean }).attendanceComments).toBe(
      before.attendanceComments,
    );
    expect((audit?.after as { scheduleStepMinutes: number }).scheduleStepMinutes).toBe(15);

    // restore so other suites see the seed defaults
    await updateOrgSettings(ceo, before);
  });
});

describe("courses", () => {
  it("creates, lists per branch scope, updates and archives, auditing each step", async () => {
    const created = await createCourse(adminA(), {
      branchId: branchA,
      name: `${TAG} English`,
      price: 450_000,
      durationMonths: 6,
    });
    expect(created).toMatchObject({ branchName: `${TAG} A`, price: 450_000, isArchived: false });

    await createCourse(ceo, {
      branchId: branchB,
      name: `${TAG} Math`,
      price: 1,
      durationMonths: 1,
    });

    // Admin A sees only branch A; the CEO with no active branch sees both.
    const forAdmin = await listCourses(adminA(), list("name"), {});
    expect(forAdmin.items.map((c) => c.name)).toEqual([`${TAG} English`]);
    const forCeo = await listCourses(ceo, { ...list("name"), q: TAG }, {});
    expect(forCeo.total).toBe(2);

    const updated = await updateCourse(adminA(), created.id, { price: 500_000, description: "x" });
    expect(updated.price).toBe(500_000);
    expect(updated.description).toBe("x");

    await archiveCourse(adminA(), created.id);
    expect((await listCourses(adminA(), list("name"), {})).total).toBe(0);
    expect((await listCourses(adminA(), list("name"), { archived: true })).total).toBe(1);

    const actions = await prisma.auditLog.findMany({
      where: { entity: "Course", entityId: created.id },
      orderBy: { createdAt: "asc" },
      select: { action: true, branchId: true },
    });
    expect(actions.map((a) => a.action)).toEqual([
      "course.create",
      "course.update",
      "course.update",
    ]);
    expect(actions.every((a) => a.branchId === branchA)).toBe(true);
  });

  it("rejects a course in a deactivated branch", async () => {
    const dead = await createBranch(ceo, { name: `${TAG} dead`, isActive: false });
    ceo.branchIds = await demoBranchIds();
    await expect(
      createCourse(ceo, { branchId: dead.id, name: "x", price: 1, durationMonths: 1 }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    await prisma.branch.delete({ where: { id: dead.id } });
  });
});

describe("rooms, days off, schools", () => {
  it("maps a duplicate room name to a field validation error", async () => {
    const room = await createRoom(adminA(), {
      branchId: branchA,
      name: `${TAG} 101`,
      capacity: 10,
    });
    let caught: unknown;
    try {
      await createRoom(adminA(), { branchId: branchA, name: `${TAG} 101`, capacity: 12 });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(AppError);
    expect((caught as AppError).code).toBe("VALIDATION");
    expect((caught as AppError).fields).toEqual({ name: ["validation.duplicate"] });
    await deleteRoom(adminA(), room.id);
  });

  it("stores a day off as a calendar date and returns it unchanged", async () => {
    const created = await createDayOff(ceo, {
      branchId: branchA,
      date: "2026-03-08",
      reason: "Holiday",
    });
    expect(created.date).toBe("2026-03-08");
    const page = await listDaysOff(adminA(), list("date"));
    expect(page.items.map((d) => d.date)).toContain("2026-03-08");
  });

  it("schools are organisation-wide and searchable", async () => {
    await createSchool(adminA(), { name: `${TAG} Lyceum` });
    const page = await listSchools(ceo, { ...list("name"), q: `${TAG} Lyc` });
    expect(page.total).toBe(1);
    expect(page.items[0]).toMatchObject({ name: `${TAG} Lyceum`, studentsCount: 0 });
  });
});

describe("grading systems", () => {
  it("creates with ordered levels, replaces levels on update, and deletes", async () => {
    const created = await createGradingSystem(ceo, {
      name: `${TAG} CEFR`,
      rounding: "STANDARD",
      levels: [
        { name: "A1", minScore: 0, maxScore: 20 },
        { name: "A2", minScore: 21, maxScore: 40 },
      ],
    });
    expect(created.levels.map((l) => l.name)).toEqual(["A1", "A2"]);

    const updated = await updateGradingSystem(ceo, created.id, {
      name: `${TAG} CEFR`,
      rounding: "IELTS",
      levels: [{ name: "B1", minScore: 0, maxScore: 100 }],
    });
    expect(updated.rounding).toBe("IELTS");
    expect(updated.levels).toHaveLength(1);
    expect(await prisma.gradingLevel.count({ where: { gradingSystemId: created.id } })).toBe(1);

    await deleteGradingSystem(ceo, created.id);
    expect(await prisma.gradingSystem.findUnique({ where: { id: created.id } })).toBeNull();
  });

  it("is refused to catalog-only users", async () => {
    await expect(
      createGradingSystem(adminA(), {
        name: `${TAG} nope`,
        rounding: "STANDARD",
        levels: [{ name: "x", minScore: 0, maxScore: 1 }],
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
