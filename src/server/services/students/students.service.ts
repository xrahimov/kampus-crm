import type { Prisma } from "@/generated/prisma/client";
import type { Page } from "@/lib/validation/common";
import type { MembershipStatus } from "@/lib/validation/groups";
import type {
  CustomFieldInput,
  ParentInput,
  StudentCommentInput,
  StudentCreateInput,
  StudentFilters,
  StudentSortField,
  StudentUpdateInput,
} from "@/lib/validation/students";
import { recordAudit } from "@/server/audit/audit";
import { hashPassword } from "@/server/auth/password";
import { prisma, type DbClient } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";
import type { ParsedList } from "@/server/http/list-query";
import { authorize, authorizeBranch, branchScope, type Actor } from "@/server/rbac/authorize";
import { findGroupInScope, ownGroupsOnly, today } from "@/server/services/groups/shared";
import {
  dateToIso,
  decimalToNumber,
  isoToDate,
  mustFind,
  rethrowAsAppError,
} from "@/server/services/settings/shared";

import { membershipBalances, type MembershipBalance } from "./balances";
import { addMonthsIso, monthStart } from "./fees";

/* Students (EXP §6). The group side of a membership lives in groups/memberships.service. */

export interface StudentGroupDto {
  membershipId: string;
  groupId: string;
  groupName: string;
  courseName: string;
  status: MembershipStatus;
  joinedAt: string;
  leftAt: string | null;
  groupStartDate: string;
  groupEndDate: string;
  groupStatus: "ACTIVE" | "ARCHIVED" | "TRIAL" | "FROZEN";
  teacherName: string | null;
  teacherId: string | null;
  time: string | null;
  weekdays: number[];
  customPrice: number | null;
  note: string | null;
  balance: number;
  nextPaymentDate: string | null;
  monthlyPrice: number;
  discount: MembershipBalance["discount"];
  gradeAverage: number | null;
}

export interface StudentRowDto {
  id: string;
  fullName: string;
  phone: string | null;
  photoUrl: string | null;
  gender: "MALE" | "FEMALE";
  note: string | null;
  isArchived: boolean;
  isBlacklisted: boolean;
  createdAt: string;
  gradeAverage: number | null;
  balance: number;
  nextPaymentDate: string | null;
  groups: StudentGroupDto[];
}

export interface StudentDetailDto extends StudentRowDto {
  branchId: string;
  birthDate: string | null;
  schoolId: string | null;
  schoolName: string | null;
  sourceId: string | null;
  sourceName: string | null;
  hasAppPassword: boolean;
  parents: ParentDto[];
  customFields: CustomFieldDto[];
}

export interface ParentDto {
  id: string;
  fullName: string;
  phone: string;
}
export interface CustomFieldDto {
  id: string;
  name: string;
  value: string | null;
}
export interface StudentCommentDto {
  id: string;
  studentId: string;
  studentName: string;
  groupId: string | null;
  groupName: string | null;
  text: string;
  authorName: string | null;
  createdAt: string;
}
export interface StudentHistoryDto {
  id: string;
  action: string;
  actorName: string | null;
  at: string;
  details: Record<string, unknown>;
}

export interface StudentOptions {
  schools: Array<{ id: string; name: string }>;
  sources: Array<{ id: string; name: string }>;
  courses: Array<{ id: string; name: string; branchId: string }>;
  groups: Array<{
    id: string;
    name: string;
    branchId: string;
    courseId: string;
    teacherId: string | null;
    teacherName: string | null;
    time: string | null;
    status: "ACTIVE" | "ARCHIVED" | "TRIAL" | "FROZEN";
  }>;
  teachers: Array<{ id: string; fullName: string }>;
  paymentMethods: Array<{ id: string; name: string }>;
}

const membershipInclude = {
  group: {
    select: {
      id: true,
      name: true,
      status: true,
      startDate: true,
      endDate: true,
      course: { select: { name: true } },
      slots: {
        select: { weekday: true, startTime: true, endTime: true },
        orderBy: { weekday: "asc" },
      },
      teachers: {
        where: { role: "MAIN" },
        take: 1,
        select: { userId: true, user: { select: { fullName: true } } },
      },
    },
  },
  grades: { select: { score: true } },
} satisfies Prisma.GroupMembershipInclude;

const studentInclude = {
  memberships: { include: membershipInclude, orderBy: { joinedAt: "desc" } },
} satisfies Prisma.StudentInclude;
type StudentRow = Prisma.StudentGetPayload<{ include: typeof studentInclude }>;

const detailInclude = {
  ...studentInclude,
  school: { select: { name: true } },
  source: { select: { name: true } },
  parents: { orderBy: { createdAt: "asc" } },
  customFields: { orderBy: { createdAt: "asc" } },
} satisfies Prisma.StudentInclude;
type DetailRow = Prisma.StudentGetPayload<{ include: typeof detailInclude }>;

const LEFT: MembershipStatus[] = ["ARCHIVED", "GRADUATED"];

function average(scores: Array<{ score: unknown }>): number | null {
  if (scores.length === 0) return null;
  const sum = scores.reduce((s, g) => s + decimalToNumber(g.score as { toString(): string }), 0);
  return Math.round((sum / scores.length) * 10) / 10;
}

function toGroupDto(
  m: StudentRow["memberships"][number],
  balance: MembershipBalance | undefined,
): StudentGroupDto {
  const first = m.group.slots[0];
  const teacher = m.group.teachers[0];
  return {
    membershipId: m.id,
    groupId: m.group.id,
    groupName: m.group.name,
    courseName: m.group.course.name,
    status: m.status,
    joinedAt: dateToIso(m.joinedAt),
    leftAt: m.leftAt ? dateToIso(m.leftAt) : null,
    groupStartDate: dateToIso(m.group.startDate),
    groupEndDate: dateToIso(m.group.endDate),
    groupStatus: m.group.status,
    teacherName: teacher?.user.fullName ?? null,
    teacherId: teacher?.userId ?? null,
    time: first ? `${first.startTime} – ${first.endTime}` : null,
    weekdays: m.group.slots.map((s) => s.weekday),
    customPrice: m.customPrice ? decimalToNumber(m.customPrice) : null,
    note: m.note,
    balance: balance?.balance ?? 0,
    nextPaymentDate: balance?.nextPaymentDate ?? null,
    monthlyPrice: balance?.monthlyPrice ?? 0,
    discount: balance?.discount ?? null,
    gradeAverage: average(m.grades),
  };
}

function toRowDto(row: StudentRow, balances: Map<string, MembershipBalance>): StudentRowDto {
  const groups = row.memberships.map((m) => toGroupDto(m, balances.get(m.id)));
  const open = groups.filter((g) => !LEFT.includes(g.status));
  const next = open
    .map((g) => g.nextPaymentDate)
    .filter((d): d is string => d !== null)
    .sort()[0];
  const grades = row.memberships.flatMap((m) => m.grades);
  return {
    id: row.id,
    fullName: row.fullName,
    phone: row.phone,
    photoUrl: row.photoUrl,
    gender: row.gender,
    note: row.note,
    isArchived: row.isArchived,
    isBlacklisted: row.isBlacklisted,
    createdAt: row.createdAt.toISOString(),
    gradeAverage: average(grades),
    balance: groups.reduce((s, g) => s + g.balance, 0),
    nextPaymentDate: next ?? null,
    groups,
  };
}

function toDetailDto(row: DetailRow, balances: Map<string, MembershipBalance>): StudentDetailDto {
  return {
    ...toRowDto(row, balances),
    branchId: row.branchId,
    birthDate: row.birthDate ? dateToIso(row.birthDate) : null,
    schoolId: row.schoolId,
    schoolName: row.school?.name ?? null,
    sourceId: row.sourceId,
    sourceName: row.source?.name ?? null,
    hasAppPassword: row.passwordHash !== null,
    parents: row.parents.map((p) => ({ id: p.id, fullName: p.fullName, phone: p.phone })),
    customFields: row.customFields.map((f) => ({ id: f.id, name: f.name, value: f.value })),
  };
}

/** What goes into audit rows: the profile without relations. */
function auditShape(row: {
  fullName: string;
  phone: string | null;
  birthDate: Date | null;
  gender: string;
  photoUrl: string | null;
  sourceId: string | null;
  schoolId: string | null;
  note: string | null;
  isArchived: boolean;
  isBlacklisted: boolean;
  branchId: string;
}) {
  return {
    fullName: row.fullName,
    phone: row.phone,
    birthDate: row.birthDate ? dateToIso(row.birthDate) : null,
    gender: row.gender,
    photoUrl: row.photoUrl,
    sourceId: row.sourceId,
    schoolId: row.schoolId,
    note: row.note,
    isArchived: row.isArchived,
    isBlacklisted: row.isBlacklisted,
    branchId: row.branchId,
  };
}

/** Branch scope, narrowed to the students of the actor's own groups for teacher-only users (A-52). */
export function studentScope(actor: Actor): Prisma.StudentWhereInput {
  const where: Prisma.StudentWhereInput = { ...branchScope(actor) };
  if (ownGroupsOnly(actor)) {
    where.memberships = {
      some: {
        status: { notIn: LEFT },
        group: {
          OR: [
            { teachers: { some: { userId: actor.userId } } },
            { supportTeachers: { some: { userId: actor.userId } } },
          ],
        },
      },
    };
  }
  return where;
}

async function findStudentInScope<T extends Prisma.StudentInclude>(
  db: DbClient,
  actor: Actor,
  id: string,
  include: T,
): Promise<Prisma.StudentGetPayload<{ include: T }>> {
  const row = await db.student.findUnique({ where: { id }, include });
  if (!row) throw AppError.notFound("errors.studentNotFound");
  if (!actor.branchIds.includes(row.branchId)) {
    throw AppError.forbidden("errors.branchForbidden");
  }
  if (ownGroupsOnly(actor)) {
    const mine = await db.student.count({ where: { id, ...studentScope(actor) } });
    if (mine === 0) throw AppError.forbidden();
  }
  return row as Prisma.StudentGetPayload<{ include: T }>;
}

function groupStatusWhere(filter: StudentFilters["groupStatus"]): Prisma.StudentWhereInput {
  switch (filter) {
    case "ACTIVE":
      return { memberships: { some: { status: "ACTIVE" } } };
    case "NEW":
      return { memberships: { some: { status: { in: ["NEW", "TRIAL"] } } } };
    case "FROZEN":
      return { memberships: { some: { status: "FROZEN" } } };
    case "LEFT_AFTER_TRIAL":
      // Left without ever being charged: archived and never activated.
      return {
        memberships: { some: { status: "ARCHIVED", activatedAt: null } },
        NOT: { memberships: { some: { status: { notIn: LEFT } } } },
      };
    case "NO_GROUP":
      return { memberships: { none: { status: { notIn: LEFT } } } };
    default:
      return {};
  }
}

export async function listStudents(
  actor: Actor,
  query: ParsedList<StudentSortField>,
  filters: StudentFilters = {},
  db: DbClient = prisma,
): Promise<Page<StudentRowDto>> {
  authorize(actor, "students.view");
  const where: Prisma.StudentWhereInput = {
    ...studentScope(actor),
    isArchived: filters.archived ?? false,
    ...groupStatusWhere(filters.groupStatus),
    ...(query.q
      ? {
          OR: [
            { fullName: { contains: query.q, mode: "insensitive" } },
            { phone: { contains: query.q } },
          ],
        }
      : {}),
    ...(filters.schoolId ? { schoolId: filters.schoolId } : {}),
  };
  const membershipFilter: Prisma.GroupMembershipWhereInput = {};
  const groupFilter: Prisma.GroupWhereInput = {};
  if (filters.groupId) membershipFilter.groupId = filters.groupId;
  if (filters.courseId) groupFilter.courseId = filters.courseId;
  if (filters.teacherId) groupFilter.teachers = { some: { userId: filters.teacherId } };
  if (Object.keys(groupFilter).length > 0) membershipFilter.group = groupFilter;
  if (Object.keys(membershipFilter).length > 0) {
    where.AND = [{ memberships: { some: { ...membershipFilter, status: { notIn: LEFT } } } }];
  }

  // Balance-based filters and sorts need every candidate's balance, so those
  // lists are computed in memory and paginated by id (A-60).
  const byBalance =
    query.sort.field === "balance" ||
    query.sort.field === "grade" ||
    (filters.paymentStatus !== undefined && filters.paymentStatus !== "ALL");

  if (!byBalance) {
    const orderBy: Prisma.StudentOrderByWithRelationInput =
      query.sort.field === "fullName"
        ? { fullName: query.sort.direction }
        : { createdAt: query.sort.direction };
    const [total, rows] = await Promise.all([
      db.student.count({ where }),
      db.student.findMany({
        where,
        include: studentInclude,
        orderBy: [orderBy, { id: "asc" }],
        skip: query.skip,
        take: query.take,
      }),
    ]);
    const balances = await membershipBalances(
      db,
      rows.flatMap((r) => r.memberships.map((m) => m.id)),
    );
    return {
      items: rows.map((r) => toRowDto(r, balances)),
      page: query.page,
      pageSize: query.pageSize,
      total,
    };
  }

  const rows = await db.student.findMany({
    where,
    include: studentInclude,
    orderBy: { id: "asc" },
  });
  const balances = await membershipBalances(
    db,
    rows.flatMap((r) => r.memberships.map((m) => m.id)),
  );
  const soon = addDays(today(), 3);
  let items = rows.map((r) => toRowDto(r, balances));
  switch (filters.paymentStatus) {
    case "DEBTOR":
      items = items.filter((s) => s.balance < 0);
      break;
    case "NOT_DEBTOR":
      items = items.filter((s) => s.balance >= 0);
      break;
    case "OVERPAID":
      items = items.filter((s) => s.balance > 0);
      break;
    case "DUE_SOON":
      items = items.filter(
        (s) => s.balance >= 0 && s.nextPaymentDate !== null && s.nextPaymentDate <= soon,
      );
      break;
  }
  const dir = query.sort.direction === "asc" ? 1 : -1;
  items.sort((a, b) => {
    if (query.sort.field === "balance") return (a.balance - b.balance) * dir;
    if (query.sort.field === "grade")
      return ((a.gradeAverage ?? -1) - (b.gradeAverage ?? -1)) * dir;
    return a.fullName.localeCompare(b.fullName) * dir;
  });
  return {
    items: items.slice(query.skip, query.skip + query.take),
    page: query.page,
    pageSize: query.pageSize,
    total: items.length,
  };
}

function addDays(iso: string, days: number): string {
  const d = isoToDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return dateToIso(d);
}

export async function getStudent(
  actor: Actor,
  id: string,
  db: DbClient = prisma,
): Promise<StudentDetailDto> {
  authorize(actor, "students.view");
  const row = await findStudentInScope(db, actor, id, detailInclude);
  const balances = await membershipBalances(
    db,
    row.memberships.map((m) => m.id),
  );
  return toDetailDto(row, balances);
}

/** The detail of a row the caller has just written (no scope check: a teacher's new student has no group yet). */
async function loadDetail(db: DbClient, id: string): Promise<StudentDetailDto> {
  const row = await db.student.findUniqueOrThrow({ where: { id }, include: detailInclude });
  const balances = await membershipBalances(
    db,
    row.memberships.map((m) => m.id),
  );
  return toDetailDto(row, balances);
}

/** Lists for the student form and filters, inside the actor's branches. */
export async function getStudentOptions(
  actor: Actor,
  db: DbClient = prisma,
): Promise<StudentOptions> {
  authorize(actor, "students.view");
  const organizationId = actor.organizationId;
  const scope = branchScope(actor);
  const [schools, sources, courses, groups, teachers, paymentMethods] = await Promise.all([
    db.school.findMany({
      where: { organizationId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.leadSource.findMany({
      where: { organizationId, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.course.findMany({
      where: { ...scope, isArchived: false },
      select: { id: true, name: true, branchId: true },
      orderBy: { name: "asc" },
    }),
    db.group.findMany({
      where: { ...scope, status: { not: "ARCHIVED" } },
      select: {
        id: true,
        name: true,
        branchId: true,
        courseId: true,
        status: true,
        slots: { select: { startTime: true, endTime: true }, take: 1, orderBy: { weekday: "asc" } },
        teachers: {
          where: { role: "MAIN" },
          take: 1,
          select: { userId: true, user: { select: { fullName: true } } },
        },
      },
      orderBy: { name: "asc" },
    }),
    db.user.findMany({
      where: {
        isArchived: false,
        roles: { some: { role: { code: { in: ["TEACHER", "SUPPORT_TEACHER"] } } } },
        organizationId: actor.organizationId,
        branches: { some: scope },
      },
      select: { id: true, fullName: true },
      orderBy: { fullName: "asc" },
    }),
    db.paymentMethod.findMany({
      where: { organizationId, isActive: true },
      select: { id: true, name: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
    }),
  ]);
  return {
    schools,
    sources,
    courses,
    groups: groups.map((g) => ({
      id: g.id,
      name: g.name,
      branchId: g.branchId,
      courseId: g.courseId,
      status: g.status,
      teacherId: g.teachers[0]?.userId ?? null,
      teacherName: g.teachers[0]?.user.fullName ?? null,
      time: g.slots[0] ? `${g.slots[0].startTime} – ${g.slots[0].endTime}` : null,
    })),
    teachers,
    paymentMethods,
  };
}

async function studentData(input: StudentUpdateInput) {
  return {
    ...(input.fullName !== undefined ? { fullName: input.fullName } : {}),
    ...(input.phone !== undefined ? { phone: input.phone } : {}),
    ...(input.birthDate !== undefined
      ? { birthDate: input.birthDate ? isoToDate(input.birthDate) : null }
      : {}),
    ...(input.gender !== undefined ? { gender: input.gender } : {}),
    ...(input.photoUrl !== undefined ? { photoUrl: input.photoUrl } : {}),
    ...(input.sourceId !== undefined ? { sourceId: input.sourceId } : {}),
    ...(input.schoolId !== undefined ? { schoolId: input.schoolId } : {}),
    ...(input.note !== undefined ? { note: input.note } : {}),
    ...(input.password ? { passwordHash: await hashPassword(input.password) } : {}),
  };
}

/** Teachers may create students only when the org switch allows it (EXP §8, A-61). */
async function authorizeCreate(actor: Actor, db: DbClient) {
  if (ownGroupsOnly(actor)) {
    const settings = await db.orgSettings.findFirst({
      where: { organizationId: actor.organizationId },
      select: { teacherCanAddStudents: true },
    });
    if (!settings?.teacherCanAddStudents) throw AppError.forbidden();
    return;
  }
  authorize(actor, "students.create");
}

export async function createStudent(
  actor: Actor,
  input: StudentCreateInput,
  db: DbClient = prisma,
): Promise<StudentDetailDto> {
  await authorizeCreate(actor, db);
  authorizeBranch(actor, input.branchId);
  let group: { id: string; branchId: string; status: string } | null = null;
  if (input.membership) {
    group = await findGroupInScope(db, actor, input.membership.groupId, {});
    if (group.status === "ARCHIVED") throw AppError.conflict("errors.groupArchived");
    if (group.branchId !== input.branchId) {
      throw AppError.validation({ "membership.groupId": ["validation.groupBranch"] });
    }
  }
  try {
    const id = await db.$transaction(async (tx) => {
      const data = await studentData(input);
      const row = await tx.student.create({
        data: { ...data, branchId: input.branchId, fullName: input.fullName },
      });
      await recordAudit(tx, actor, {
        action: "student.create",
        entity: "Student",
        entityId: row.id,
        after: auditShape(row),
        branchId: row.branchId,
      });
      if (input.parent) {
        await tx.parent.create({ data: { studentId: row.id, ...input.parent } });
      }
      if (input.membership && group) {
        const m = input.membership;
        const membership = await tx.groupMembership.create({
          data: {
            groupId: group.id,
            studentId: row.id,
            status: m.status,
            joinedAt: isoToDate(m.joinedAt),
            activatedAt: m.status === "ACTIVE" ? isoToDate(m.joinedAt) : null,
            customPrice: m.customPrice ?? null,
            note: m.note ?? null,
          },
        });
        await recordAudit(tx, actor, {
          action: "membership.create",
          entity: "GroupMembership",
          entityId: membership.id,
          after: { studentId: row.id, groupId: group.id, status: m.status, joinedAt: m.joinedAt },
          branchId: group.branchId,
        });
      }
      return row.id;
    });
    return loadDetail(db, id);
  } catch (error) {
    rethrowAsAppError(error, "phone");
  }
}

export async function updateStudent(
  actor: Actor,
  id: string,
  input: StudentUpdateInput,
  db: DbClient = prisma,
): Promise<StudentDetailDto> {
  authorize(actor, "students.update");
  const row = await findStudentInScope(db, actor, id, {});
  try {
    await db.$transaction(async (tx) => {
      const data = await studentData(input);
      const updated = await tx.student.update({ where: { id }, data });
      await recordAudit(tx, actor, {
        action: "student.update",
        entity: "Student",
        entityId: id,
        before: auditShape(row),
        after: auditShape(updated),
        branchId: row.branchId,
      });
    });
  } catch (error) {
    rethrowAsAppError(error, "phone");
  }
  return getStudent(actor, id, db);
}

/** Ends every open membership with today's date (used by archive and blacklist). */
async function closeMemberships(
  tx: DbClient,
  actor: Actor,
  studentId: string,
  branchId: string,
  reason: string,
) {
  const open = await tx.groupMembership.findMany({
    where: { studentId, status: { notIn: LEFT } },
    select: { id: true, status: true },
  });
  for (const m of open) {
    await tx.groupMembership.update({
      where: { id: m.id },
      data: { status: "ARCHIVED", leftAt: isoToDate(today()), leaveReason: reason },
    });
    await recordAudit(tx, actor, {
      action: "membership.update",
      entity: "GroupMembership",
      entityId: m.id,
      before: { status: m.status },
      after: { status: "ARCHIVED", leaveReason: reason },
      branchId,
    });
  }
}

/** "O'chirish" archives (A-38); the row, its payments and history stay. */
export async function archiveStudent(
  actor: Actor,
  id: string,
  db: DbClient = prisma,
): Promise<void> {
  authorize(actor, "students.delete");
  const row = await findStudentInScope(db, actor, id, {});
  await db.$transaction(async (tx) => {
    await closeMemberships(tx, actor, id, row.branchId, "archived");
    const updated = await tx.student.update({ where: { id }, data: { isArchived: true } });
    await recordAudit(tx, actor, {
      action: "student.archive",
      entity: "Student",
      entityId: id,
      before: auditShape(row),
      after: auditShape(updated),
      branchId: row.branchId,
    });
  });
}

/** "Faollashtirish" on the archive list brings the profile back (without its old groups). */
export async function restoreStudent(
  actor: Actor,
  id: string,
  db: DbClient = prisma,
): Promise<void> {
  authorize(actor, "students.update");
  const row = await findStudentInScope(db, actor, id, {});
  await db.$transaction(async (tx) => {
    const updated = await tx.student.update({ where: { id }, data: { isArchived: false } });
    await recordAudit(tx, actor, {
      action: "student.restore",
      entity: "Student",
      entityId: id,
      before: auditShape(row),
      after: auditShape(updated),
      branchId: row.branchId,
    });
  });
}

/** "Qora ro'yxatga olish": flagged, taken out of every group, and cannot be added again (A-62). */
export async function setBlacklisted(
  actor: Actor,
  id: string,
  value: boolean,
  db: DbClient = prisma,
): Promise<void> {
  authorize(actor, "students.blacklist");
  const row = await findStudentInScope(db, actor, id, {});
  await db.$transaction(async (tx) => {
    if (value) await closeMemberships(tx, actor, id, row.branchId, "blacklisted");
    const updated = await tx.student.update({ where: { id }, data: { isBlacklisted: value } });
    await recordAudit(tx, actor, {
      action: value ? "student.blacklist" : "student.unblacklist",
      entity: "Student",
      entityId: id,
      before: auditShape(row),
      after: auditShape(updated),
      branchId: row.branchId,
    });
  });
}

// --- Parents -----------------------------------------------------------------

export async function addParent(
  actor: Actor,
  studentId: string,
  input: ParentInput,
  db: DbClient = prisma,
): Promise<ParentDto> {
  authorize(actor, "students.update");
  const row = await findStudentInScope(db, actor, studentId, {});
  return db.$transaction(async (tx) => {
    const parent = await tx.parent.create({ data: { studentId, ...input } });
    await recordAudit(tx, actor, {
      action: "student.parentAdd",
      entity: "Student",
      entityId: studentId,
      after: { fullName: parent.fullName, phone: parent.phone },
      branchId: row.branchId,
    });
    return { id: parent.id, fullName: parent.fullName, phone: parent.phone };
  });
}

export async function deleteParent(
  actor: Actor,
  parentId: string,
  db: DbClient = prisma,
): Promise<void> {
  authorize(actor, "students.update");
  const parent = await mustFind(db.parent.findUnique({ where: { id: parentId } }));
  const row = await findStudentInScope(db, actor, parent.studentId, {});
  await db.$transaction(async (tx) => {
    await tx.parent.delete({ where: { id: parentId } });
    await recordAudit(tx, actor, {
      action: "student.parentRemove",
      entity: "Student",
      entityId: parent.studentId,
      before: { fullName: parent.fullName, phone: parent.phone },
      branchId: row.branchId,
    });
  });
}

// --- Custom fields -----------------------------------------------------------

export async function setCustomField(
  actor: Actor,
  studentId: string,
  input: CustomFieldInput,
  db: DbClient = prisma,
): Promise<CustomFieldDto> {
  authorize(actor, "students.update");
  const row = await findStudentInScope(db, actor, studentId, {});
  return db.$transaction(async (tx) => {
    const field = await tx.studentCustomField.upsert({
      where: { studentId_name: { studentId, name: input.name } },
      create: { studentId, name: input.name, value: input.value ?? null },
      update: { value: input.value ?? null },
    });
    await recordAudit(tx, actor, {
      action: "student.fieldSet",
      entity: "Student",
      entityId: studentId,
      after: { name: field.name, value: field.value },
      branchId: row.branchId,
    });
    return { id: field.id, name: field.name, value: field.value };
  });
}

export async function deleteCustomField(
  actor: Actor,
  fieldId: string,
  db: DbClient = prisma,
): Promise<void> {
  authorize(actor, "students.update");
  const field = await mustFind(db.studentCustomField.findUnique({ where: { id: fieldId } }));
  const row = await findStudentInScope(db, actor, field.studentId, {});
  await db.$transaction(async (tx) => {
    await tx.studentCustomField.delete({ where: { id: fieldId } });
    await recordAudit(tx, actor, {
      action: "student.fieldRemove",
      entity: "Student",
      entityId: field.studentId,
      before: { name: field.name, value: field.value },
      branchId: row.branchId,
    });
  });
}

// --- Comments ("Izoh va eslatmalar", "O'quvchiga izoh") ---------------------

const commentInclude = {
  student: { select: { fullName: true } },
  group: { select: { name: true } },
  createdBy: { select: { fullName: true } },
} satisfies Prisma.StudentCommentInclude;

function toCommentDto(
  c: Prisma.StudentCommentGetPayload<{ include: typeof commentInclude }>,
): StudentCommentDto {
  return {
    id: c.id,
    studentId: c.studentId,
    studentName: c.student.fullName,
    groupId: c.groupId,
    groupName: c.group?.name ?? null,
    text: c.text,
    authorName: c.createdBy?.fullName ?? null,
    createdAt: c.createdAt.toISOString(),
  };
}

export async function listStudentComments(
  actor: Actor,
  studentId: string,
  db: DbClient = prisma,
): Promise<StudentCommentDto[]> {
  authorize(actor, "students.view");
  await findStudentInScope(db, actor, studentId, {});
  const rows = await db.studentComment.findMany({
    where: { studentId },
    include: commentInclude,
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toCommentDto);
}

export async function listGroupComments(
  actor: Actor,
  groupId: string,
  db: DbClient = prisma,
): Promise<StudentCommentDto[]> {
  authorize(actor, "groups.view");
  await findGroupInScope(db, actor, groupId, {});
  const rows = await db.studentComment.findMany({
    where: { groupId },
    include: commentInclude,
    orderBy: { createdAt: "desc" },
  });
  return rows.map(toCommentDto);
}

export async function addStudentComment(
  actor: Actor,
  studentId: string,
  input: StudentCommentInput,
  db: DbClient = prisma,
): Promise<StudentCommentDto> {
  authorize(actor, "students.view");
  const row = await findStudentInScope(db, actor, studentId, {});
  if (input.groupId) await findGroupInScope(db, actor, input.groupId, {});
  return db.$transaction(async (tx) => {
    const c = await tx.studentComment.create({
      data: {
        studentId,
        groupId: input.groupId ?? null,
        text: input.text,
        createdById: actor.userId || null,
      },
      include: commentInclude,
    });
    await recordAudit(tx, actor, {
      action: "student.comment",
      entity: "Student",
      entityId: studentId,
      after: { text: c.text, groupId: c.groupId },
      branchId: row.branchId,
    });
    return toCommentDto(c);
  });
}

// --- History ("O'quvchi tarixi") ---------------------------------------------

export async function listStudentHistory(
  actor: Actor,
  studentId: string,
  query: { page: number; pageSize: number; skip: number; take: number },
  db: DbClient = prisma,
): Promise<Page<StudentHistoryDto>> {
  authorize(actor, "students.view");
  await findStudentInScope(db, actor, studentId, {});
  const [memberships, payments, adjustments] = await Promise.all([
    db.groupMembership.findMany({ where: { studentId }, select: { id: true } }),
    db.payment.findMany({ where: { studentId }, select: { id: true } }),
    db.balanceAdjustment.findMany({ where: { studentId }, select: { id: true } }),
  ]);
  const where: Prisma.AuditLogWhereInput = {
    OR: [
      { entity: "Student", entityId: studentId },
      { entity: "GroupMembership", entityId: { in: memberships.map((m) => m.id) } },
      { entity: "Payment", entityId: { in: payments.map((p) => p.id) } },
      { entity: "BalanceAdjustment", entityId: { in: adjustments.map((a) => a.id) } },
    ],
  };
  const [total, rows] = await Promise.all([
    db.auditLog.count({ where }),
    db.auditLog.findMany({
      where,
      include: { actor: { select: { fullName: true } } },
      orderBy: { createdAt: "desc" },
      skip: query.skip,
      take: query.take,
    }),
  ]);
  return {
    items: rows.map((r) => ({
      id: r.id,
      action: r.action,
      actorName: r.actor?.fullName ?? null,
      at: r.createdAt.toISOString(),
      details: historyDetails(r.action, r.before, r.after),
    })),
    page: query.page,
    pageSize: query.pageSize,
    total,
  };
}

const DETAIL_KEYS = [
  "status",
  "amount",
  "bonus",
  "effectiveMonth",
  "groupId",
  "text",
  "name",
  "value",
  "fullName",
  "phone",
  "leaveReason",
  "reason",
  "discountedPrice",
  "months",
  "note",
  "customPrice",
  "joinedAt",
  "isArchived",
  "isBlacklisted",
  "kind",
  "date",
  "comment",
];

/** The few values worth showing on the timeline, old → new where both exist. */
function historyDetails(action: string, before: unknown, after: unknown): Record<string, unknown> {
  const b = (before ?? {}) as Record<string, unknown>;
  const a = (after ?? {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const key of DETAIL_KEYS) {
    if (key in a && key in b && JSON.stringify(a[key]) !== JSON.stringify(b[key])) {
      out[key] = { from: b[key], to: a[key] };
    } else if (key in a && (action.endsWith(".create") || !(key in b))) {
      out[key] = a[key];
    } else if (key in b && !(key in a)) {
      out[key] = b[key];
    }
  }
  return out;
}

// --- Lesson calendar for one membership (EXP §6 "Darslar taqvimi") -----------

export interface CalendarDayDto {
  date: string;
  status: "PRESENT" | "ABSENT" | "EXCUSED" | "NOT_MARKED" | "UPCOMING";
  paid: boolean;
}

export interface MembershipCalendarDto {
  month: string;
  months: string[];
  days: CalendarDayDto[];
  counts: { present: number; absent: number; excused: number; notMarked: number };
}

export async function getMembershipCalendar(
  actor: Actor,
  membershipId: string,
  month: string | null,
  db: DbClient = prisma,
): Promise<MembershipCalendarDto> {
  authorize(actor, "students.view");
  const m = await mustFind(
    db.groupMembership.findUnique({
      where: { id: membershipId },
      select: {
        studentId: true,
        groupId: true,
        group: { select: { startDate: true, endDate: true } },
      },
    }),
  );
  await findStudentInScope(db, actor, m.studentId, {});
  const start = monthStart(dateToIso(m.group.startDate));
  const end = monthStart(dateToIso(m.group.endDate));
  const months: string[] = [];
  for (let x = start; x <= end; x = addMonthsIso(x, 1)) months.push(x);
  const current = monthStart(today());
  const chosen =
    month && months.includes(month)
      ? month
      : months.includes(current)
        ? current
        : (months[0] ?? current);
  const [lessons, charge] = await Promise.all([
    db.lesson.findMany({
      where: {
        groupId: m.groupId,
        date: { gte: isoToDate(chosen), lt: isoToDate(addMonthsIso(chosen, 1)) },
      },
      select: { date: true, attendances: { where: { membershipId }, select: { status: true } } },
      orderBy: { date: "asc" },
    }),
    db.charge.findUnique({
      where: { membershipId_month: { membershipId, month: isoToDate(chosen) } },
    }),
  ]);
  const balances = await membershipBalances(db, [membershipId]);
  const b = balances.get(membershipId);
  // A month is "paid" when the money covers every charge through it.
  const unpaidFrom = b && b.balance < 0 ? b.nextPaymentDate : null;
  const paid = charge !== null && (unpaidFrom === null || chosen < monthStart(unpaidFrom));
  const t = today();
  const counts = { present: 0, absent: 0, excused: 0, notMarked: 0 };
  const days = lessons.map((l) => {
    const date = dateToIso(l.date);
    const mark = l.attendances[0]?.status ?? "NOT_MARKED";
    const status: CalendarDayDto["status"] = mark === "NOT_MARKED" && date > t ? "UPCOMING" : mark;
    if (status === "PRESENT") counts.present += 1;
    else if (status === "ABSENT") counts.absent += 1;
    else if (status === "EXCUSED") counts.excused += 1;
    else if (status === "NOT_MARKED") counts.notMarked += 1;
    return { date, status, paid };
  });
  return { month: chosen, months, days, counts };
}
