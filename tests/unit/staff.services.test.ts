/**
 * Staff, teachers and roles services against the real database (Phase 4).
 * Every row created here carries a run-specific tag and is removed at the end.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/rbac/default-roles";
import { verifyPassword } from "@/server/auth/password";
import { prisma } from "@/server/db/prisma";
import type { Actor } from "@/server/rbac/authorize";
import { createBranch } from "@/server/services/settings/branches.service";
import {
  createRole,
  deleteRole,
  listRoles,
  permissionCatalogue,
  updateRole,
} from "@/server/services/staff/roles.service";
import {
  archiveStaff,
  countStaffByRole,
  createStaff,
  getStaff,
  listStaff,
  updateStaff,
} from "@/server/services/staff/staff.service";
import {
  createTeacher,
  getTeacher,
  listTeachers,
  updateTeacher,
} from "@/server/services/staff/teachers.service";

const RUN = String(Date.now() % 100_000).padStart(5, "0");
const TAG = `t${RUN}`;
/** +998 + 9 digits: "9011" + 5 run digits leaves no room, so use "90" + run + 2 digits. */
const phone = (n: number) => `+99890${RUN}${String(n).padStart(2, "0")}`;
const PASSWORD = "Secret!2026";

let branchA: string;
let branchB: string;
const ceo: Actor = {
  userId: "",
  fullName: "CEO",
  roles: ["CEO"],
  permissions: ["*"],
  branchIds: [],
  activeBranchId: null,
};
/** A real admin's default grants plus role management, so the subset rule (A-44) behaves as in production. */
const adminA: Actor = {
  userId: "",
  fullName: "Admin A",
  roles: ["ADMIN"],
  permissions: [...DEFAULT_ROLE_PERMISSIONS.ADMIN, "settings.roles"],
  branchIds: [],
  activeBranchId: null,
};
const cashier: Actor = {
  userId: "",
  fullName: "Cashier",
  roles: ["CASHIER"],
  permissions: ["payments.create"],
  branchIds: [],
  activeBranchId: null,
};

const list = {
  page: 1,
  pageSize: 100,
  skip: 0,
  take: 100,
  sort: { field: "fullName" as const, direction: "asc" as const },
};

beforeAll(async () => {
  expect(await prisma.organization.findFirst({ where: { id: "org_demo" } })).not.toBeNull();
  // Audit rows reference real users, so each actor is backed by a row.
  for (const [actor, n] of [
    [ceo, 1],
    [adminA, 2],
    [cashier, 3],
  ] as const) {
    const user = await prisma.user.create({
      data: { phone: phone(n), fullName: `${TAG} ${actor.fullName}`, passwordHash: "x" },
    });
    actor.userId = user.id;
  }
  branchA = (await createBranch(ceo, { name: `${TAG} A`, isActive: true })).id;
  branchB = (await createBranch(ceo, { name: `${TAG} B`, isActive: true })).id;
  adminA.branchIds = [branchA];
});

afterAll(async () => {
  const users = await prisma.user.findMany({
    where: { phone: { startsWith: `+99890${RUN}` } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  await prisma.auditLog.deleteMany({
    where: { OR: [{ actorId: { in: ids } }, { entityId: { in: ids } }] },
  });
  await prisma.user.deleteMany({ where: { id: { in: ids } } });
  const roles = await prisma.role.findMany({ where: { name: { startsWith: TAG } } });
  await prisma.auditLog.deleteMany({ where: { entityId: { in: roles.map((r) => r.id) } } });
  await prisma.role.deleteMany({ where: { name: { startsWith: TAG } } });
  const branchIds = [branchA, branchB].filter(Boolean);
  await prisma.auditLog.deleteMany({ where: { branchId: { in: branchIds } } });
  await prisma.branch.deleteMany({ where: { id: { in: branchIds } } });
  await prisma.$disconnect();
});

const teacherInput = (n: number, branchIds: string[]) => ({
  fullName: `${TAG} Teacher ${n}`,
  phone: phone(n),
  gender: "FEMALE" as const,
  birthDate: "1991-03-04",
  hireDate: "2026-02-01",
  photoUrl: null,
  roleCodes: ["TEACHER"],
  branchIds,
  salaryMethod: "PERCENT" as const,
  percentShare: 45,
  fixedSalary: 1,
  password: PASSWORD,
});

describe("authorization", () => {
  it("refuses staff, teacher and role calls to a role without the permission", async () => {
    await expect(listStaff(cashier, "staff", list)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(listTeachers(cashier, list, { kind: "teachers" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(listRoles(cashier)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      createRole(cashier, { name: `${TAG} nope`, isActive: true, permissions: [] }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

describe("teachers", () => {
  let teacherId: string;

  it("creates a teacher with a hashed password, keeps only the chosen salary amount, audits without the hash", async () => {
    const dto = await createTeacher(ceo, teacherInput(10, [branchA]));
    teacherId = dto.id;
    expect(dto).toMatchObject({
      fullName: `${TAG} Teacher 10`,
      gender: "FEMALE",
      birthDate: "1991-03-04",
      hireDate: "2026-02-01",
      salaryMethod: "PERCENT",
      percentShare: 45,
      fixedSalary: null,
      perLessonFee: null,
      roles: [{ code: "TEACHER", name: "Teacher" }],
    });
    expect(dto.branches.map((b) => b.id)).toEqual([branchA]);
    expect("passwordHash" in dto).toBe(false);

    const row = await prisma.user.findUniqueOrThrow({ where: { id: dto.id } });
    expect(row.passwordHash).not.toBe(PASSWORD);
    expect(await verifyPassword(row.passwordHash, PASSWORD)).toBe(true);

    const audit = await prisma.auditLog.findFirst({
      where: { entityId: dto.id, action: "teacher.create" },
    });
    expect(audit?.actorId).toBe(ceo.userId);
    expect(JSON.stringify(audit?.after)).not.toContain("passwordHash");
  });

  it("lists by tab and only inside the actor's branches", async () => {
    const away = await createTeacher(ceo, {
      ...teacherInput(11, [branchB]),
      roleCodes: ["SUPPORT_TEACHER"],
    });

    const teachers = await listTeachers(ceo, list, { kind: "teachers" });
    const support = await listTeachers(ceo, list, { kind: "support" });
    expect(teachers.items.some((t) => t.id === teacherId)).toBe(true);
    expect(teachers.items.some((t) => t.id === away.id)).toBe(false);
    expect(support.items.some((t) => t.id === away.id)).toBe(true);

    const scoped = await listTeachers(adminA, list, { kind: "support" });
    expect(scoped.items.some((t) => t.id === away.id)).toBe(false);
    await expect(getTeacher(adminA, away.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "errors.branchForbidden",
    });
    const detail = await getTeacher(adminA, teacherId);
    expect(detail.stats).toEqual({ courses: 0, activeGroups: 0, activeStudents: 0 });
  });

  it("rejects a duplicate phone, a non-teacher role and a branch outside the actor's scope", async () => {
    await expect(createTeacher(ceo, teacherInput(10, [branchA]))).rejects.toMatchObject({
      code: "VALIDATION",
      fields: { phone: ["validation.duplicate"] },
    });
    await expect(
      createTeacher(ceo, { ...teacherInput(12, [branchA]), roleCodes: ["CASHIER"] }),
    ).rejects.toMatchObject({
      code: "VALIDATION",
      fields: { roleCodes: ["validation.teacherRole"] },
    });
    await expect(createTeacher(adminA, teacherInput(12, [branchB]))).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "errors.branchForbidden",
    });
  });

  it("switching the salary method clears the other amounts and changing the password re-hashes it", async () => {
    const updated = await updateTeacher(adminA, teacherId, {
      salaryMethod: "PER_LESSON",
      perLessonFee: 150000,
      password: "Another!2026",
    });
    expect(updated).toMatchObject({
      salaryMethod: "PER_LESSON",
      perLessonFee: 150000,
      percentShare: null,
    });
    const row = await prisma.user.findUniqueOrThrow({ where: { id: teacherId } });
    expect(await verifyPassword(row.passwordHash, "Another!2026")).toBe(true);
    const audit = await prisma.auditLog.findFirst({
      where: { entityId: teacherId, action: "teacher.update" },
      orderBy: { createdAt: "desc" },
    });
    expect(audit?.after).toMatchObject({ passwordChanged: true });
    expect(JSON.stringify(audit)).not.toContain("Another!2026");
  });

  it("archives instead of deleting, ends sessions and hides the row from the default list", async () => {
    await prisma.session.create({
      data: {
        tokenHash: `${TAG}-token`,
        userId: teacherId,
        csrfSecret: "c",
        expiresAt: new Date(Date.now() + 60_000),
      },
    });
    // The default ADMIN grants edit but not delete on teachers (A-05).
    await expect(archiveStaff(adminA, "teachers", teacherId)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await archiveStaff(ceo, "teachers", teacherId);
    expect(await prisma.session.count({ where: { userId: teacherId } })).toBe(0);
    expect(await prisma.user.count({ where: { id: teacherId } })).toBe(1);
    const visible = await listTeachers(ceo, list, { kind: "teachers" });
    const archived = await listTeachers(ceo, list, { kind: "teachers", archived: true });
    expect(visible.items.some((t) => t.id === teacherId)).toBe(false);
    expect(archived.items.some((t) => t.id === teacherId)).toBe(true);
  });
});

describe("staff and roles", () => {
  it("counts users per role within the actor's branches", async () => {
    await createStaff(ceo, "staff", {
      ...teacherInput(20, [branchA]),
      roleCodes: ["CASHIER", "MARKETER"],
      salaryMethod: "MONTHLY",
      fixedSalary: 3000000,
    });
    await createStaff(ceo, "staff", {
      ...teacherInput(21, [branchB]),
      roleCodes: ["CASHIER"],
    });
    const counts = Object.fromEntries(
      (await countStaffByRole(adminA)).map((c) => [c.code, c.count]),
    );
    const all = Object.fromEntries((await countStaffByRole(ceo)).map((c) => [c.code, c.count]));
    expect(counts.MARKETER).toBe(1);
    expect(all.CASHIER).toBeGreaterThanOrEqual((counts.CASHIER ?? 0) + 1);

    const marketers = await listStaff(ceo, "staff", list, { roleCode: "MARKETER" });
    expect(marketers.items.every((p) => p.roles.some((r) => r.code === "MARKETER"))).toBe(true);
    const search = await listStaff(ceo, "staff", { ...list, q: phone(20) });
    expect(search.items.map((p) => p.phone)).toEqual([phone(20)]);
  });

  it("stops anyone granting more than they hold, or editing themselves out", async () => {
    await expect(
      createStaff(adminA, "staff", { ...teacherInput(22, [branchA]), roleCodes: ["CEO"] }),
    ).rejects.toMatchObject({ code: "FORBIDDEN", message: "errors.roleBeyondOwn" });
    await expect(
      createRole(adminA, {
        name: `${TAG} too much`,
        isActive: true,
        permissions: ["finance.view"],
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN", message: "errors.roleBeyondOwn" });
    await expect(updateStaff(ceo, "staff", ceo.userId, { isArchived: true })).rejects.toMatchObject(
      { code: "FORBIDDEN", message: "errors.selfEdit" },
    );
    await expect(
      updateStaff(ceo, "staff", ceo.userId, { roleCodes: ["ADMIN"] }),
    ).rejects.toMatchObject({ code: "FORBIDDEN", message: "errors.selfEdit" });
    // Renaming yourself is fine.
    const me = await updateStaff(ceo, "staff", ceo.userId, { fullName: `${TAG} CEO renamed` });
    expect(me.fullName).toBe(`${TAG} CEO renamed`);
  });

  it("creates, edits and deletes a custom role, protecting system roles and roles in use", async () => {
    const role = await createRole(adminA, {
      name: `${TAG} Reception`,
      isActive: true,
      permissions: ["teachers.view", "staff.view"],
    });
    expect(role.code).toMatch(new RegExp(`^T${RUN}_RECEPTION_[0-9A-F]{4}$`));
    expect(role.isSystem).toBe(false);

    const edited = await updateRole(ceo, role.id, {
      permissions: ["teachers.view"],
      isActive: false,
    });
    expect(edited.permissions).toEqual(["teachers.view"]);
    expect(edited.isActive).toBe(false);

    const ceoRole = await prisma.role.findUniqueOrThrow({ where: { code: "CEO" } });
    await expect(updateRole(ceo, ceoRole.id, { isActive: false })).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "errors.systemRole",
    });
    await expect(deleteRole(ceo, ceoRole.id)).rejects.toMatchObject({ code: "FORBIDDEN" });

    await updateRole(ceo, role.id, { isActive: true });
    const holder = await createStaff(ceo, "staff", {
      ...teacherInput(23, [branchA]),
      roleCodes: [role.code],
    });
    await expect(deleteRole(ceo, role.id)).rejects.toMatchObject({
      code: "CONFLICT",
      message: "errors.inUse",
    });
    await updateStaff(ceo, "staff", holder.id, { roleCodes: ["OTHER"] });
    await deleteRole(ceo, role.id);
    expect((await listRoles(ceo)).some((r) => r.id === role.id)).toBe(false);
  });

  it("groups every permission by module", () => {
    const catalogue = permissionCatalogue();
    const flat = catalogue.flatMap((g) => g.permissions);
    expect(new Set(flat).size).toBe(flat.length);
    expect(catalogue.find((g) => g.module === "teachers")?.permissions).toEqual([
      "teachers.view",
      "teachers.create",
      "teachers.update",
      "teachers.delete",
    ]);
  });

  it("lets a staff viewer read a colleague but not one in another branch", async () => {
    const other = (await listStaff(ceo, "staff", { ...list, q: phone(21) })).items[0]!;
    await expect(getStaff(adminA, "staff", other.id)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    const mine = (await listStaff(ceo, "staff", { ...list, q: phone(20) })).items[0]!;
    expect((await getStaff(adminA, "staff", mine.id)).id).toBe(mine.id);
  });
});
