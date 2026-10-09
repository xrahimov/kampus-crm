import type { Permission } from "@/lib/rbac/permissions";
import type { Page } from "@/lib/validation/common";
import {
  SALARY_AMOUNT_FIELD,
  TEACHER_KIND_ROLE,
  type StaffCreateInput,
  type StaffSortField,
  type StaffUpdateInput,
  type TeacherKind,
} from "@/lib/validation/staff";
import type { Prisma } from "@/generated/prisma/client";
import { recordAudit } from "@/server/audit/audit";
import { requireTelegramChat } from "@/server/services/account.service";
import { hashPassword } from "@/server/auth/password";
import { prisma, type DbClient } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";
import type { ParsedList } from "@/server/http/list-query";
import {
  authorize,
  authorizeBranch,
  branchScope,
  canAccessAllBranches,
  type Actor,
} from "@/server/rbac/authorize";

import {
  dateToIso,
  decimalToNumber,
  isoToDate,
  mustFind,
  rethrowAsAppError,
} from "../settings/shared";
import { assertCanGrantRole, roleOrganizationFilter } from "./roles.service";

/**
 * Staff (EXP §8 "Xodimlar") and teachers (EXP §4) are the same User rows seen
 * through two permission sets (A-43). `scope` picks the permission module; the
 * teachers scope only ever sees users holding a teacher role.
 */
export type StaffScope = "staff" | "teachers";

export const TEACHER_ROLE_CODES: string[] = Object.values(TEACHER_KIND_ROLE);

export interface StaffDto {
  id: string;
  fullName: string;
  phone: string;
  gender: "MALE" | "FEMALE";
  birthDate: string | null;
  hireDate: string | null;
  photoUrl: string | null;
  salaryMethod: "PERCENT" | "MONTHLY" | "PER_LESSON" | "PER_STUDENT" | null;
  fixedSalary: number | null;
  percentShare: number | null;
  perLessonFee: number | null;
  perStudentFee: number | null;
  isArchived: boolean;
  createdAt: string;
  roles: Array<{ code: string; name: string }>;
  branches: Array<{ id: string; name: string }>;
  /** Account safety (A-124). */
  signInCode: "OFF" | "TELEGRAM";
  /** The bot knows the person's chat (Settings → Bot notifications): the code and the alerts can reach them. */
  telegramLinked: boolean;
  /** The person still signs in with a password someone else chose. */
  mustChangePassword: boolean;
}

export interface StaffFilters {
  archived?: boolean;
  /** Only users holding this role (EXP §8 role chips). */
  roleCode?: string;
  /** Teachers scope: which tab (EXP §4 O'QITUVCHILAR / SUPPORT O'QITUVCHILAR). */
  kind?: TeacherKind;
}

export interface RoleCount {
  code: string;
  name: string;
  count: number;
}

const include = {
  roles: { include: { role: { select: { code: true, name: true } } } },
  branches: { include: { branch: { select: { id: true, name: true } } } },
  botRecipient: { select: { id: true } },
};

type Row = NonNullable<
  Awaited<ReturnType<typeof prisma.user.findFirst<{ include: typeof include }>>>
>;

/** Never includes `passwordHash`: this is what lists, responses and audit rows carry. */
export function toStaffDto(row: Row): StaffDto {
  return {
    id: row.id,
    fullName: row.fullName,
    phone: row.phone,
    gender: row.gender,
    birthDate: row.birthDate ? dateToIso(row.birthDate) : null,
    hireDate: row.hireDate ? dateToIso(row.hireDate) : null,
    photoUrl: row.photoUrl,
    salaryMethod: row.salaryMethod,
    fixedSalary: row.fixedSalary ? decimalToNumber(row.fixedSalary) : null,
    percentShare: row.percentShare ? decimalToNumber(row.percentShare) : null,
    perLessonFee: row.perLessonFee ? decimalToNumber(row.perLessonFee) : null,
    perStudentFee: row.perStudentFee ? decimalToNumber(row.perStudentFee) : null,
    isArchived: row.isArchived,
    createdAt: row.createdAt.toISOString(),
    roles: row.roles.map((r) => r.role),
    branches: row.branches.map((b) => b.branch),
    signInCode: row.signInCode,
    telegramLinked: row.botRecipient !== null,
    mustChangePassword: row.mustChangePassword,
  };
}

function perm(scope: StaffScope, action: "view" | "create" | "update" | "delete"): Permission {
  return `${scope}.${action}` as Permission;
}

/**
 * Users the actor may see: the centre's accounts, narrowed to a branch in
 * common unless the actor sees every branch and has none selected (A-108).
 */
function userBranchScope(actor: Actor): Prisma.UserWhereInput {
  if (canAccessAllBranches(actor) && !actor.activeBranchId) {
    return { organizationId: actor.organizationId };
  }
  return { organizationId: actor.organizationId, branches: { some: branchScope(actor) } };
}

function scopeRoleFilter(scope: StaffScope, filters: StaffFilters): Prisma.UserWhereInput {
  if (scope === "teachers") {
    const code = filters.kind ? TEACHER_KIND_ROLE[filters.kind] : undefined;
    return { roles: { some: { role: code ? { code } : { code: { in: TEACHER_ROLE_CODES } } } } };
  }
  return filters.roleCode ? { roles: { some: { role: { code: filters.roleCode } } } } : {};
}

function whereFor(
  actor: Actor,
  scope: StaffScope,
  filters: StaffFilters,
  q?: string,
): Prisma.UserWhereInput {
  return {
    isArchived: filters.archived ?? false,
    ...userBranchScope(actor),
    ...scopeRoleFilter(scope, filters),
    ...(q
      ? {
          OR: [
            { fullName: { contains: q, mode: "insensitive" as const } },
            { phone: { contains: q } },
          ],
        }
      : {}),
  };
}

export async function listStaff(
  actor: Actor,
  scope: StaffScope,
  query: ParsedList<StaffSortField>,
  filters: StaffFilters = {},
  db: DbClient = prisma,
): Promise<Page<StaffDto>> {
  authorize(actor, perm(scope, "view"));
  const where = whereFor(actor, scope, filters, query.q);
  const [total, rows] = await Promise.all([
    db.user.count({ where }),
    db.user.findMany({
      where,
      include,
      orderBy: [{ [query.sort.field]: query.sort.direction }, { id: "asc" }],
      skip: query.skip,
      take: query.take,
    }),
  ]);
  return { items: rows.map(toStaffDto), page: query.page, pageSize: query.pageSize, total };
}

/** Role chips with counts (EXP §8 Staff), within the actor's branch scope. */
export async function countStaffByRole(
  actor: Actor,
  archived = false,
  db: DbClient = prisma,
): Promise<RoleCount[]> {
  authorize(actor, "staff.view");
  const user = whereFor(actor, "staff", { archived });
  const roles = await db.role.findMany({
    orderBy: { name: "asc" },
    select: { code: true, name: true, _count: { select: { users: { where: { user } } } } },
  });
  return roles.map((r) => ({ code: r.code, name: r.name, count: r._count.users }));
}

async function findInScope(
  db: DbClient,
  actor: Actor,
  scope: StaffScope,
  id: string,
): Promise<Row> {
  const row = await mustFind(db.user.findUnique({ where: { id }, include }));
  const codes = row.roles.map((r) => r.role.code);
  if (scope === "teachers" && !codes.some((c) => TEACHER_ROLE_CODES.includes(c))) {
    throw AppError.notFound();
  }
  if (row.organizationId !== actor.organizationId) throw AppError.notFound();
  if (
    !canAccessAllBranches(actor) &&
    !row.branches.some((b) => actor.branchIds.includes(b.branchId))
  ) {
    throw AppError.forbidden("errors.branchForbidden");
  }
  return row;
}

export async function getStaff(
  actor: Actor,
  scope: StaffScope,
  id: string,
  db: DbClient = prisma,
): Promise<StaffDto> {
  authorize(actor, perm(scope, "view"));
  return toStaffDto(await findInScope(db, actor, scope, id));
}

/** Resolves role codes to ids, checking existence and that the actor may grant each (A-44). */
async function resolveRoles(db: DbClient, actor: Actor, scope: StaffScope, codes: string[]) {
  if (scope === "teachers" && codes.some((c) => !TEACHER_ROLE_CODES.includes(c))) {
    throw AppError.validation({ roleCodes: ["validation.teacherRole"] });
  }
  const roles = await db.role.findMany({
    where: { code: { in: codes }, isActive: true, ...roleOrganizationFilter(actor) },
  });
  if (roles.length !== new Set(codes).size) {
    throw AppError.validation({ roleCodes: ["validation.roleUnknown"] });
  }
  for (const role of roles) assertCanGrantRole(actor, role);
  return roles.map((r) => r.id);
}

async function resolveBranches(db: DbClient, actor: Actor, branchIds: string[]) {
  for (const id of branchIds) authorizeBranch(actor, id);
  const found = await db.branch.count({
    where: { id: { in: branchIds }, isActive: true, organizationId: actor.organizationId },
  });
  if (found !== new Set(branchIds).size) throw AppError.notFound("errors.branchNotFound");
  return Array.from(new Set(branchIds));
}

/** Keeps only the amount that belongs to the chosen method; the others reset to null. */
function salaryColumns(
  input: StaffCreateInput | StaffUpdateInput,
  method: StaffDto["salaryMethod"],
) {
  const keep = method ? SALARY_AMOUNT_FIELD[method] : null;
  const pick = (field: (typeof SALARY_AMOUNT_FIELD)[keyof typeof SALARY_AMOUNT_FIELD]) =>
    keep === field ? (input[field] ?? null) : null;
  return {
    salaryMethod: method,
    fixedSalary: pick("fixedSalary"),
    percentShare: pick("percentShare"),
    perLessonFee: pick("perLessonFee"),
    perStudentFee: pick("perStudentFee"),
  };
}

export async function createStaff(
  actor: Actor,
  scope: StaffScope,
  input: StaffCreateInput,
  db: DbClient = prisma,
): Promise<StaffDto> {
  authorize(actor, perm(scope, "create"));
  const [roleIds, branchIds, passwordHash] = await Promise.all([
    resolveRoles(db, actor, scope, input.roleCodes),
    resolveBranches(db, actor, input.branchIds),
    hashPassword(input.password),
  ]);
  try {
    return await db.$transaction(async (tx) => {
      const row = await tx.user.create({
        data: {
          organizationId: actor.organizationId,
          fullName: input.fullName,
          phone: input.phone,
          passwordHash,
          // The creator chose this password: the person picks their own at the first sign-in (A-124).
          mustChangePassword: true,
          gender: input.gender,
          birthDate: input.birthDate ? isoToDate(input.birthDate) : null,
          hireDate: input.hireDate ? isoToDate(input.hireDate) : null,
          photoUrl: input.photoUrl ?? null,
          ...salaryColumns(input, input.salaryMethod ?? null),
          roles: { create: roleIds.map((roleId) => ({ roleId })) },
          branches: { create: branchIds.map((branchId) => ({ branchId })) },
        },
        include,
      });
      const dto = toStaffDto(row);
      await recordAudit(tx, actor, {
        action: `${scope === "teachers" ? "teacher" : "staff"}.create`,
        entity: "User",
        entityId: row.id,
        after: dto,
        branchId: branchIds[0],
      });
      return dto;
    });
  } catch (error) {
    rethrowAsAppError(error, "phone");
  }
}

export async function updateStaff(
  actor: Actor,
  scope: StaffScope,
  id: string,
  input: StaffUpdateInput,
  db: DbClient = prisma,
): Promise<StaffDto> {
  authorize(actor, perm(scope, "update"));
  const existing = await findInScope(db, actor, scope, id);
  const before = toStaffDto(existing);
  const self = actor.userId === id;

  // Nobody can lock themselves out or promote themselves (A-44).
  if (self && (input.isArchived || input.roleCodes !== undefined)) {
    throw AppError.forbidden("errors.selfEdit");
  }
  // Editing a user whose roles you could not grant (an admin editing the CEO) is off limits.
  const existingRoles = await db.role.findMany({
    where: { code: { in: existing.roles.map((r) => r.role.code) } },
  });
  if (!self) for (const role of existingRoles) assertCanGrantRole(actor, role);

  const [roleIds, branchIds, passwordHash] = await Promise.all([
    input.roleCodes !== undefined ? resolveRoles(db, actor, scope, input.roleCodes) : undefined,
    input.branchIds !== undefined ? resolveBranches(db, actor, input.branchIds) : undefined,
    input.password ? hashPassword(input.password) : undefined,
  ]);
  if (input.signInCode === "TELEGRAM") await requireTelegramChat(db, id);
  const method =
    input.salaryMethod !== undefined ? (input.salaryMethod ?? null) : before.salaryMethod;
  const salary =
    input.salaryMethod !== undefined ||
    input.fixedSalary !== undefined ||
    input.percentShare !== undefined ||
    input.perLessonFee !== undefined ||
    input.perStudentFee !== undefined
      ? salaryColumns({ ...before, ...input }, method)
      : {};

  try {
    return await db.$transaction(async (tx) => {
      if (roleIds) {
        await tx.userRole.deleteMany({ where: { userId: id } });
        await tx.userRole.createMany({ data: roleIds.map((roleId) => ({ userId: id, roleId })) });
      }
      if (branchIds) {
        await tx.userBranch.deleteMany({ where: { userId: id } });
        await tx.userBranch.createMany({
          data: branchIds.map((branchId) => ({ userId: id, branchId })),
        });
      }
      const row = await tx.user.update({
        where: { id },
        data: {
          ...(input.fullName !== undefined ? { fullName: input.fullName } : {}),
          ...(input.phone !== undefined ? { phone: input.phone } : {}),
          ...(input.gender !== undefined ? { gender: input.gender } : {}),
          ...(input.birthDate !== undefined
            ? { birthDate: input.birthDate ? isoToDate(input.birthDate) : null }
            : {}),
          ...(input.hireDate !== undefined
            ? { hireDate: input.hireDate ? isoToDate(input.hireDate) : null }
            : {}),
          ...(input.photoUrl !== undefined ? { photoUrl: input.photoUrl ?? null } : {}),
          ...(input.isArchived !== undefined ? { isArchived: input.isArchived } : {}),
          // A password set by someone else is temporary (A-124); your own is final.
          ...(passwordHash
            ? self
              ? { passwordHash, mustChangePassword: false, passwordChangedAt: new Date() }
              : { passwordHash, mustChangePassword: true }
            : {}),
          ...(input.signInCode !== undefined ? { signInCode: input.signInCode } : {}),
          ...salary,
        },
        include,
      });
      // Archiving ends every session so the user is signed out at once; so does a
      // password reset by someone else, since whoever held the old password is out.
      if (input.isArchived || (passwordHash && !self)) {
        await tx.session.deleteMany({ where: { userId: id } });
      }
      const after = toStaffDto(row);
      await recordAudit(tx, actor, {
        action: `${scope === "teachers" ? "teacher" : "staff"}.${input.isArchived ? "archive" : "update"}`,
        entity: "User",
        entityId: id,
        before,
        after: { ...after, ...(passwordHash ? { passwordChanged: true } : {}) },
        branchId: row.branches[0]?.branchId ?? null,
      });
      return after;
    });
  } catch (error) {
    rethrowAsAppError(error, "phone");
  }
}

/** "Delete" in the reference is archive here (A-38): payroll and groups will reference users. */
export async function archiveStaff(
  actor: Actor,
  scope: StaffScope,
  id: string,
  db: DbClient = prisma,
): Promise<void> {
  authorize(actor, perm(scope, "delete"));
  await updateStaff(actor, scope, id, { isArchived: true }, db);
}

/** "Sign out of all devices" on the staff form (A-124): every session of the person ends. */
export async function signOutEverywhere(
  actor: Actor,
  scope: StaffScope,
  id: string,
  db: DbClient = prisma,
): Promise<number> {
  authorize(actor, perm(scope, "update"));
  const existing = await findInScope(db, actor, scope, id);
  return db.$transaction(async (tx) => {
    const { count } = await tx.session.deleteMany({ where: { userId: id } });
    await recordAudit(tx, actor, {
      action: `${scope === "teachers" ? "teacher" : "staff"}.signOutAll`,
      entity: "User",
      entityId: id,
      after: { sessions: count },
      branchId: existing.branches[0]?.branchId ?? null,
    });
    return count;
  });
}
