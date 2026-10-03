import type { Prisma } from "@/generated/prisma/client";
import type {
  ExamFilters,
  ExamInput,
  ExamResultsInput,
  ExamStatus,
  ExamType,
} from "@/lib/validation/exams";
import { recordAudit } from "@/server/audit/audit";
import { prisma, type DbClient } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";
import { authorize, branchScope, canAccessAllBranches, type Actor } from "@/server/rbac/authorize";
import { findGroupInScope, ownGroupsOnly } from "@/server/services/groups/shared";
import {
  dateToIso,
  decimalToNumber,
  isoToDate,
  mustFind,
  rethrowAsAppError,
} from "@/server/services/settings/shared";
import { TEACHER_ROLE_CODES } from "@/server/services/staff/staff.service";

/* Exams (EXP §7): group exams and mock exams, results and registrations. */

export interface ExamDto {
  id: string;
  branchId: string;
  branchName: string;
  type: ExamType;
  name: string;
  groupId: string | null;
  groupName: string | null;
  /** Mock exams: the target groups. */
  groups: Array<{ id: string; name: string }>;
  isRetake: boolean;
  date: string;
  startTime: string;
  endTime: string;
  examinerId: string | null;
  examinerName: string | null;
  roomId: string | null;
  roomName: string | null;
  gradingSystemId: string | null;
  gradingSystemName: string | null;
  passScore: number;
  maxScore: number;
  price: number;
  capacity: number | null;
  status: ExamStatus;
  finishedAt: string | null;
  /** Group exam: students of the group; mock: registrations ("Arizalar"). */
  studentCount: number;
  gradedCount: number;
}

export interface ExamListDto {
  items: ExamDto[];
  /** Tab counters, under the same status and date filters. */
  counts: { GROUP: number; MOCK: number };
}

export interface ExamResultRowDto {
  studentId: string;
  fullName: string;
  phone: string | null;
  groupName: string | null;
  score: number | null;
  isPresent: boolean;
  comment: string | null;
  /** Name of the grading level the score falls in, or null on a custom scale. */
  level: string | null;
  passed: boolean | null;
  registeredAt: string | null;
}

export interface ExamOptions {
  groups: Array<{
    id: string;
    name: string;
    branchId: string;
    courseId: string;
    courseName: string;
    startDate: string;
    status: string;
  }>;
  courses: Array<{ id: string; name: string; branchId: string }>;
  rooms: Array<{ id: string; name: string; branchId: string }>;
  gradingSystems: Array<{ id: string; name: string }>;
  examiners: Array<{ id: string; fullName: string }>;
}

const include = {
  branch: { select: { name: true } },
  group: { select: { name: true } },
  examiner: { select: { fullName: true } },
  room: { select: { name: true } },
  gradingSystem: { select: { name: true } },
  targets: { include: { group: { select: { id: true, name: true } } } },
  _count: { select: { results: true } },
  results: { where: { score: { not: null } }, select: { id: true } },
} satisfies Prisma.ExamInclude;
type Row = Prisma.ExamGetPayload<{ include: typeof include }>;

function toDto(row: Row, groupMembers?: number): ExamDto {
  return {
    id: row.id,
    branchId: row.branchId,
    branchName: row.branch.name,
    type: row.type,
    name: row.name,
    groupId: row.groupId,
    groupName: row.group?.name ?? null,
    groups: row.targets.map((t) => t.group),
    isRetake: row.isRetake,
    date: dateToIso(row.date),
    startTime: row.startTime,
    endTime: row.endTime,
    examinerId: row.examinerId,
    examinerName: row.examiner?.fullName ?? null,
    roomId: row.roomId,
    roomName: row.room?.name ?? null,
    gradingSystemId: row.gradingSystemId,
    gradingSystemName: row.gradingSystem?.name ?? null,
    passScore: decimalToNumber(row.passScore),
    maxScore: decimalToNumber(row.maxScore),
    price: row.price ? decimalToNumber(row.price) : 0,
    capacity: row.capacity,
    status: row.status,
    finishedAt: row.finishedAt?.toISOString() ?? null,
    studentCount: row.type === "GROUP" ? (groupMembers ?? row._count.results) : row._count.results,
    gradedCount: row.results.length,
  };
}

const OPEN_MEMBER: Prisma.GroupMembershipWhereInput = {
  status: { notIn: ["ARCHIVED", "GRADUATED"] },
};

/** Teachers see exams only when the general-settings switch allows it (EXP §8), and only for their groups. */
async function examScope(actor: Actor, db: DbClient): Promise<Prisma.ExamWhereInput> {
  const where: Prisma.ExamWhereInput = { ...(branchScope(actor) ?? {}) };
  if (ownGroupsOnly(actor)) {
    const settings = await db.orgSettings.findFirst({ select: { teachersSeeExamSchedule: true } });
    if (!settings?.teachersSeeExamSchedule) throw AppError.forbidden("errors.examsHidden");
    const mine: Prisma.GroupWhereInput = {
      OR: [
        { teachers: { some: { userId: actor.userId } } },
        { supportTeachers: { some: { userId: actor.userId } } },
      ],
    };
    where.OR = [{ group: mine }, { targets: { some: { group: mine } } }];
  }
  return where;
}

async function groupMemberCounts(db: DbClient, groupIds: string[]): Promise<Map<string, number>> {
  if (groupIds.length === 0) return new Map();
  const rows = await db.groupMembership.groupBy({
    by: ["groupId"],
    where: { groupId: { in: groupIds }, ...OPEN_MEMBER },
    _count: { _all: true },
  });
  return new Map(rows.map((r) => [r.groupId, r._count._all]));
}

export async function listExams(
  actor: Actor,
  filters: ExamFilters,
  db: DbClient = prisma,
): Promise<ExamListDto> {
  authorize(actor, "exams.view");
  const scope = await examScope(actor, db);
  const common: Prisma.ExamWhereInput = {
    ...scope,
    ...(filters.status ? { status: filters.status } : {}),
    ...(filters.groupId
      ? { OR: [{ groupId: filters.groupId }, { targets: { some: { groupId: filters.groupId } } }] }
      : {}),
    ...(filters.from || filters.to
      ? {
          date: {
            ...(filters.from ? { gte: isoToDate(filters.from) } : {}),
            ...(filters.to ? { lte: isoToDate(filters.to) } : {}),
          },
        }
      : {}),
  };
  // The teacher scope and the group filter both use OR; combine them with AND.
  const where = (type: ExamType): Prisma.ExamWhereInput => {
    const { OR: scopeOr, ...rest } = scope;
    const { OR: filterOr, ...restFilters } = common;
    void rest;
    const and: Prisma.ExamWhereInput[] = [];
    if (scopeOr) and.push({ OR: scopeOr });
    if (filterOr && filterOr !== scopeOr) and.push({ OR: filterOr });
    return { ...restFilters, type, ...(and.length ? { AND: and } : {}) };
  };
  const [rows, groupCount, mockCount] = await Promise.all([
    db.exam.findMany({
      where: where(filters.type),
      include,
      orderBy: [{ date: "asc" }, { startTime: "asc" }, { createdAt: "asc" }],
    }),
    db.exam.count({ where: where("GROUP") }),
    db.exam.count({ where: where("MOCK") }),
  ]);
  const members = await groupMemberCounts(
    db,
    rows.map((r) => r.groupId).filter((id): id is string => !!id),
  );
  return {
    items: rows.map((r) => toDto(r, r.groupId ? (members.get(r.groupId) ?? 0) : undefined)),
    counts: { GROUP: groupCount, MOCK: mockCount },
  };
}

async function findExamInScope(db: DbClient, actor: Actor, id: string): Promise<Row> {
  const scope = await examScope(actor, db);
  const row = await mustFind(
    db.exam.findFirst({ where: { id, ...scope }, include }),
    "errors.examNotFound",
  );
  if (!canAccessAllBranches(actor) && !actor.branchIds.includes(row.branchId)) {
    throw AppError.forbidden("errors.branchForbidden");
  }
  return row;
}

export async function getExam(actor: Actor, id: string, db: DbClient = prisma): Promise<ExamDto> {
  authorize(actor, "exams.view");
  const row = await findExamInScope(db, actor, id);
  const members = row.groupId ? await groupMemberCounts(db, [row.groupId]) : new Map();
  return toDto(row, row.groupId ? (members.get(row.groupId) ?? 0) : undefined);
}

export async function getExamOptions(actor: Actor, db: DbClient = prisma): Promise<ExamOptions> {
  authorize(actor, "exams.view");
  const scope = branchScope(actor) ?? {};
  const [groups, courses, rooms, gradingSystems, examiners] = await Promise.all([
    db.group.findMany({
      where: { ...scope, status: { not: "ARCHIVED" } },
      select: {
        id: true,
        name: true,
        branchId: true,
        courseId: true,
        startDate: true,
        status: true,
        course: { select: { name: true } },
      },
      orderBy: { name: "asc" },
    }),
    db.course.findMany({
      where: { ...scope, isArchived: false },
      select: { id: true, name: true, branchId: true },
      orderBy: { name: "asc" },
    }),
    db.room.findMany({
      where: scope,
      select: { id: true, name: true, branchId: true },
      orderBy: { name: "asc" },
    }),
    db.gradingSystem.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    db.user.findMany({
      where: {
        isArchived: false,
        roles: { some: { role: { code: { in: [...TEACHER_ROLE_CODES] } } } },
        ...(Object.keys(scope).length ? { branches: { some: scope } } : {}),
      },
      select: { id: true, fullName: true },
      orderBy: { fullName: "asc" },
    }),
  ]);
  return {
    groups: groups.map((g) => ({
      id: g.id,
      name: g.name,
      branchId: g.branchId,
      courseId: g.courseId,
      courseName: g.course.name,
      startDate: dateToIso(g.startDate),
      status: g.status,
    })),
    courses,
    rooms,
    gradingSystems,
    examiners,
  };
}

/** Resolves the branch and checks every referenced group, room and examiner. */
async function resolveInput(db: DbClient, actor: Actor, input: ExamInput) {
  let branchId: string;
  let groupId: string | null = null;
  let targetIds: string[] = [];
  if (input.type === "GROUP") {
    const group = await findGroupInScope(db, actor, input.groupId!, {});
    branchId = group.branchId;
    groupId = group.id;
  } else {
    const groups = await db.group.findMany({
      where: { id: { in: input.groupIds }, ...(branchScope(actor) ?? {}) },
      select: { id: true, branchId: true },
    });
    if (groups.length !== input.groupIds.length) {
      throw AppError.validation({ groupIds: ["validation.groupUnknown"] });
    }
    // A mock exam lives in the branch of its first target group (A-70); other branches may join.
    branchId = groups[0]!.branchId;
    targetIds = groups.map((g) => g.id);
  }
  if (input.roomId) {
    const room = await db.room.count({ where: { id: input.roomId, branchId } });
    if (room === 0) throw AppError.validation({ roomId: ["validation.roomBranch"] });
  }
  if (input.examinerId) {
    const user = await db.user.count({ where: { id: input.examinerId, isArchived: false } });
    if (user === 0) throw AppError.validation({ examinerId: ["validation.teacherUnknown"] });
  }
  if (input.gradingSystemId) {
    await mustFind(
      db.gradingSystem.findUnique({ where: { id: input.gradingSystemId } }),
      "errors.notFound",
    );
  }
  return { branchId, groupId, targetIds };
}

function examData(input: ExamInput, branchId: string, groupId: string | null) {
  return {
    branchId,
    type: input.type,
    name: input.name,
    groupId,
    isRetake: input.type === "GROUP" ? input.isRetake : false,
    date: isoToDate(input.date),
    startTime: input.startTime,
    endTime: input.endTime,
    examinerId: input.examinerId ?? null,
    roomId: input.roomId ?? null,
    gradingSystemId: input.gradingSystemId ?? null,
    passScore: input.passScore,
    maxScore: input.maxScore,
    price: input.type === "MOCK" ? input.price : null,
    capacity: input.type === "MOCK" ? (input.capacity ?? null) : null,
  };
}

export async function createExam(
  actor: Actor,
  input: ExamInput,
  db: DbClient = prisma,
): Promise<ExamDto> {
  authorize(actor, "exams.create");
  const { branchId, groupId, targetIds } = await resolveInput(db, actor, input);
  let created: string;
  try {
    created = await db.$transaction(async (tx) => {
      const row = await tx.exam.create({
        data: {
          ...examData(input, branchId, groupId),
          targets: { create: targetIds.map((id) => ({ groupId: id })) },
        },
        include,
      });
      await recordAudit(tx, actor, {
        action: "exam.create",
        entity: "Exam",
        entityId: row.id,
        after: toDto(row, 0),
        branchId,
      });
      return row.id;
    });
  } catch (error) {
    rethrowAsAppError(error, "name");
  }
  return getExam(actor, created, db);
}

export async function updateExam(
  actor: Actor,
  id: string,
  input: ExamInput,
  db: DbClient = prisma,
): Promise<ExamDto> {
  authorize(actor, "exams.update");
  const row = await findExamInScope(db, actor, id);
  if (input.type !== row.type) throw AppError.validation({ type: ["validation.examType"] });
  const { branchId, groupId, targetIds } = await resolveInput(db, actor, input);
  const before = toDto(row);
  try {
    await db.$transaction(async (tx) => {
      if (input.type === "MOCK") {
        await tx.examGroup.deleteMany({ where: { examId: id } });
        await tx.examGroup.createMany({ data: targetIds.map((g) => ({ examId: id, groupId: g })) });
      }
      const updated = await tx.exam.update({
        where: { id },
        data: examData(input, branchId, groupId),
        include,
      });
      await recordAudit(tx, actor, {
        action: "exam.update",
        entity: "Exam",
        entityId: id,
        before,
        after: toDto(updated),
        branchId,
      });
    });
  } catch (error) {
    rethrowAsAppError(error, "name");
  }
  return getExam(actor, id, db);
}

/** "Yakunlangan": finishing locks nothing but moves the exam to the other tab; it can be reopened. */
export async function setExamStatus(
  actor: Actor,
  id: string,
  status: ExamStatus,
  db: DbClient = prisma,
): Promise<ExamDto> {
  authorize(actor, "exams.update");
  const row = await findExamInScope(db, actor, id);
  await db.$transaction(async (tx) => {
    await tx.exam.update({
      where: { id },
      data: { status, finishedAt: status === "FINISHED" ? new Date() : null },
    });
    await recordAudit(tx, actor, {
      action: status === "FINISHED" ? "exam.finish" : "exam.reopen",
      entity: "Exam",
      entityId: id,
      before: { status: row.status },
      after: { status },
      branchId: row.branchId,
    });
  });
  return getExam(actor, id, db);
}

/** An exam with entered scores stays; delete its results first. */
export async function deleteExam(actor: Actor, id: string, db: DbClient = prisma): Promise<void> {
  authorize(actor, "exams.delete");
  const row = await findExamInScope(db, actor, id);
  if (row.results.length > 0) throw AppError.conflict("errors.examHasResults");
  await db.$transaction(async (tx) => {
    await tx.exam.delete({ where: { id } });
    await recordAudit(tx, actor, {
      action: "exam.delete",
      entity: "Exam",
      entityId: id,
      before: toDto(row),
      branchId: row.branchId,
    });
  });
}

/** Levels of the scale an exam grades against: its own, else the group's, else the course's. */
async function levelsFor(db: DbClient, row: Row) {
  let systemId = row.gradingSystemId;
  if (!systemId && row.groupId) {
    const group = await db.group.findUnique({
      where: { id: row.groupId },
      select: { gradingSystemId: true, course: { select: { gradingSystemId: true } } },
    });
    systemId = group?.gradingSystemId ?? group?.course.gradingSystemId ?? null;
  }
  if (!systemId) return [];
  return db.gradingLevel.findMany({
    where: { gradingSystemId: systemId },
    orderBy: { sortOrder: "asc" },
  });
}

export function levelName(
  levels: Array<{
    name: string;
    minScore: { toString(): string };
    maxScore: { toString(): string };
  }>,
  score: number | null,
): string | null {
  if (score === null || levels.length === 0) return null;
  const hit = levels.find(
    (l) => score >= decimalToNumber(l.minScore) && score <= decimalToNumber(l.maxScore),
  );
  return hit?.name ?? null;
}

/**
 * Rows to grade: every open member of a group exam's group (plus anyone who
 * already has a result), or the registered students of a mock exam.
 */
export async function getExamResults(
  actor: Actor,
  id: string,
  db: DbClient = prisma,
): Promise<{ exam: ExamDto; rows: ExamResultRowDto[] }> {
  authorize(actor, "exams.view");
  const row = await findExamInScope(db, actor, id);
  const exam = await getExam(actor, id, db);
  const [results, levels] = await Promise.all([
    db.examResult.findMany({
      where: { examId: id },
      include: { student: { select: { fullName: true, phone: true } } },
    }),
    levelsFor(db, row),
  ]);
  const byStudent = new Map(results.map((r) => [r.studentId, r]));
  const groupIds =
    row.type === "GROUP" && row.groupId ? [row.groupId] : row.targets.map((t) => t.groupId);
  const memberships = await db.groupMembership.findMany({
    where: {
      groupId: { in: groupIds },
      ...(row.type === "GROUP" ? OPEN_MEMBER : { studentId: { in: [...byStudent.keys()] } }),
    },
    include: {
      student: { select: { fullName: true, phone: true } },
      group: { select: { name: true } },
    },
    orderBy: { student: { fullName: "asc" } },
  });
  const groupOf = new Map<string, string>();
  for (const m of memberships)
    if (!groupOf.has(m.studentId)) groupOf.set(m.studentId, m.group.name);
  const students = new Map<string, { fullName: string; phone: string | null }>();
  if (row.type === "GROUP") for (const m of memberships) students.set(m.studentId, m.student);
  for (const r of results) students.set(r.studentId, r.student);
  const pass = decimalToNumber(row.passScore);
  const rows: ExamResultRowDto[] = [...students.entries()]
    .map(([studentId, student]) => {
      const r = byStudent.get(studentId);
      const score = r?.score ? decimalToNumber(r.score) : r?.score === null || !r ? null : 0;
      return {
        studentId,
        fullName: student.fullName,
        phone: student.phone,
        groupName: groupOf.get(studentId) ?? null,
        score,
        isPresent: r?.isPresent ?? true,
        comment: r?.comment ?? null,
        level: levelName(levels, score),
        passed: score === null ? null : score >= pass,
        registeredAt: r?.registeredAt.toISOString() ?? null,
      };
    })
    .sort((a, b) => a.fullName.localeCompare(b.fullName));
  return { exam, rows };
}

export async function setExamResults(
  actor: Actor,
  id: string,
  input: ExamResultsInput,
  db: DbClient = prisma,
): Promise<ExamResultRowDto[]> {
  authorize(actor, "exams.update");
  const row = await findExamInScope(db, actor, id);
  const max = decimalToNumber(row.maxScore);
  for (const r of input.results) {
    if (r.score !== null && r.score !== undefined && r.score > max) {
      throw AppError.validation({ score: ["validation.scoreMax"] });
    }
  }
  const groupIds =
    row.type === "GROUP" && row.groupId ? [row.groupId] : row.targets.map((t) => t.groupId);
  const allowed = new Set(
    (
      await db.groupMembership.findMany({
        where: {
          groupId: { in: groupIds },
          studentId: { in: input.results.map((r) => r.studentId) },
        },
        select: { studentId: true },
      })
    ).map((m) => m.studentId),
  );
  const registered = new Set(
    (await db.examResult.findMany({ where: { examId: id }, select: { studentId: true } })).map(
      (r) => r.studentId,
    ),
  );
  for (const r of input.results) {
    if (!allowed.has(r.studentId) && !registered.has(r.studentId)) {
      throw AppError.validation({ studentId: ["validation.memberUnknown"] });
    }
  }
  await db.$transaction(async (tx) => {
    for (const r of input.results) {
      const graded = r.score !== null && r.score !== undefined;
      await tx.examResult.upsert({
        where: { examId_studentId: { examId: id, studentId: r.studentId } },
        create: {
          examId: id,
          studentId: r.studentId,
          score: r.score ?? null,
          isPresent: r.isPresent,
          comment: r.comment ?? null,
          gradedById: graded ? actor.userId || null : null,
          gradedAt: graded ? new Date() : null,
        },
        update: {
          score: r.score ?? null,
          isPresent: r.isPresent,
          comment: r.comment ?? null,
          gradedById: graded ? actor.userId || null : null,
          gradedAt: graded ? new Date() : null,
        },
      });
    }
    await recordAudit(tx, actor, {
      action: "exam.results",
      entity: "Exam",
      entityId: id,
      after: { results: input.results },
      branchId: row.branchId,
    });
  });
  return (await getExamResults(actor, id, db)).rows;
}

/** Students a mock exam may register: open members of its target groups, by name or phone. */
export async function searchCandidates(
  actor: Actor,
  id: string,
  q: string,
  db: DbClient = prisma,
): Promise<Array<{ id: string; fullName: string; phone: string | null; groupName: string }>> {
  authorize(actor, "exams.update");
  const row = await findExamInScope(db, actor, id);
  if (q.trim().length < 2) return [];
  const registered = (
    await db.examResult.findMany({ where: { examId: id }, select: { studentId: true } })
  ).map((r) => r.studentId);
  const rows = await db.groupMembership.findMany({
    where: {
      groupId: { in: row.targets.map((t) => t.groupId) },
      ...OPEN_MEMBER,
      studentId: { notIn: registered },
      student: {
        isArchived: false,
        OR: [{ fullName: { contains: q, mode: "insensitive" } }, { phone: { contains: q } }],
      },
    },
    include: {
      student: { select: { id: true, fullName: true, phone: true } },
      group: { select: { name: true } },
    },
    orderBy: { student: { fullName: "asc" } },
    take: 10,
  });
  const seen = new Set<string>();
  return rows
    .filter((m) => (seen.has(m.studentId) ? false : (seen.add(m.studentId), true)))
    .map((m) => ({ ...m.student, groupName: m.group.name }));
}

/** "Ariza": registers a student for a mock exam while there is capacity. */
export async function registerStudent(
  actor: Actor,
  id: string,
  studentId: string,
  db: DbClient = prisma,
): Promise<ExamResultRowDto[]> {
  authorize(actor, "exams.update");
  const row = await findExamInScope(db, actor, id);
  if (row.type !== "MOCK") throw AppError.conflict("errors.notMockExam");
  const member = await db.groupMembership.count({
    where: { studentId, groupId: { in: row.targets.map((t) => t.groupId) }, ...OPEN_MEMBER },
  });
  if (member === 0) throw AppError.validation({ studentId: ["validation.memberUnknown"] });
  if (row.capacity !== null && row._count.results >= row.capacity) {
    throw AppError.conflict("errors.examFull");
  }
  try {
    await db.$transaction(async (tx) => {
      const result = await tx.examResult.create({ data: { examId: id, studentId } });
      await recordAudit(tx, actor, {
        action: "exam.register",
        entity: "Exam",
        entityId: id,
        after: { studentId, resultId: result.id },
        branchId: row.branchId,
      });
    });
  } catch (error) {
    rethrowAsAppError(error, "studentId");
  }
  return (await getExamResults(actor, id, db)).rows;
}

export async function unregisterStudent(
  actor: Actor,
  id: string,
  studentId: string,
  db: DbClient = prisma,
): Promise<void> {
  authorize(actor, "exams.update");
  const row = await findExamInScope(db, actor, id);
  await db.$transaction(async (tx) => {
    await tx.examResult.deleteMany({ where: { examId: id, studentId } });
    await recordAudit(tx, actor, {
      action: "exam.unregister",
      entity: "Exam",
      entityId: id,
      before: { studentId },
      branchId: row.branchId,
    });
  });
}

/* Student progress (EXP §6 "O'quvchi progressi"). */

export interface StudentProgressDto {
  gradeAverage: number | null;
  attendancePercent: number | null;
  examAverage: number | null;
  months: Array<{
    month: string;
    gradeAverage: number | null;
    attendancePercent: number | null;
    lessons: number;
  }>;
  exams: Array<{
    examId: string;
    name: string;
    type: ExamType;
    date: string;
    groupName: string | null;
    score: number | null;
    maxScore: number;
    passScore: number;
    passed: boolean | null;
    level: string | null;
    isPresent: boolean;
  }>;
}

const round1 = (n: number) => Math.round(n * 10) / 10;

export async function getStudentProgress(
  actor: Actor,
  studentId: string,
  db: DbClient = prisma,
): Promise<StudentProgressDto> {
  authorize(actor, "students.view");
  const student = await mustFind(
    db.student.findUnique({ where: { id: studentId }, select: { branchId: true } }),
    "errors.studentNotFound",
  );
  if (!canAccessAllBranches(actor) && !actor.branchIds.includes(student.branchId)) {
    throw AppError.forbidden("errors.branchForbidden");
  }
  const memberships = await db.groupMembership.findMany({
    where: { studentId },
    select: { id: true },
  });
  const ids = memberships.map((m) => m.id);
  const [grades, attendance, results] = await Promise.all([
    db.grade.findMany({
      where: { membershipId: { in: ids } },
      select: { score: true, lesson: { select: { date: true } } },
    }),
    db.attendance.findMany({
      where: { membershipId: { in: ids }, status: { in: ["PRESENT", "ABSENT"] } },
      select: { status: true, lesson: { select: { date: true } } },
    }),
    db.examResult.findMany({
      where: { studentId },
      include: {
        exam: {
          include: { group: { select: { name: true } }, gradingSystem: { select: { id: true } } },
        },
      },
      orderBy: { exam: { date: "desc" } },
    }),
  ]);
  const months = new Map<
    string,
    { scores: number[]; present: number; marked: number; lessons: Set<string> }
  >();
  const bucket = (date: Date) => {
    const key = dateToIso(date).slice(0, 7);
    let b = months.get(key);
    if (!b) months.set(key, (b = { scores: [], present: 0, marked: 0, lessons: new Set() }));
    return b;
  };
  for (const g of grades) {
    const b = bucket(g.lesson.date);
    b.scores.push(decimalToNumber(g.score));
    b.lessons.add(dateToIso(g.lesson.date));
  }
  for (const a of attendance) {
    const b = bucket(a.lesson.date);
    b.marked += 1;
    if (a.status === "PRESENT") b.present += 1;
    b.lessons.add(dateToIso(a.lesson.date));
  }
  const avg = (xs: number[]) =>
    xs.length ? round1(xs.reduce((s, x) => s + x, 0) / xs.length) : null;
  const allScores = grades.map((g) => decimalToNumber(g.score));
  const present = attendance.filter((a) => a.status === "PRESENT").length;
  const levelCache = new Map<string, Awaited<ReturnType<typeof levelsFor>>>();
  const exams: StudentProgressDto["exams"] = [];
  for (const r of results) {
    const examRow = await db.exam.findUniqueOrThrow({ where: { id: r.examId }, include });
    let levels = levelCache.get(r.examId);
    if (!levels) levelCache.set(r.examId, (levels = await levelsFor(db, examRow)));
    const score = r.score ? decimalToNumber(r.score) : null;
    const max = decimalToNumber(r.exam.maxScore);
    exams.push({
      examId: r.examId,
      name: r.exam.name,
      type: r.exam.type,
      date: dateToIso(r.exam.date),
      groupName: r.exam.group?.name ?? null,
      score,
      maxScore: max,
      passScore: decimalToNumber(r.exam.passScore),
      passed: score === null ? null : score >= decimalToNumber(r.exam.passScore),
      level: levelName(levels, score),
      isPresent: r.isPresent,
    });
  }
  const examPercents = exams
    .filter((e) => e.score !== null && e.maxScore > 0)
    .map((e) => (e.score! / e.maxScore) * 100);
  return {
    gradeAverage: avg(allScores),
    attendancePercent: attendance.length ? round1((present / attendance.length) * 100) : null,
    examAverage: avg(examPercents),
    months: [...months.entries()]
      .sort(([a], [b]) => b.localeCompare(a))
      .map(([month, b]) => ({
        month,
        gradeAverage: avg(b.scores),
        attendancePercent: b.marked ? round1((b.present / b.marked) * 100) : null,
        lessons: b.lessons.size,
      })),
    exams,
  };
}

/** Group detail → IMTIHON tab: the group's own exams and the mocks it takes part in. */
export async function listGroupExams(
  actor: Actor,
  groupId: string,
  db: DbClient = prisma,
): Promise<ExamDto[]> {
  authorize(actor, "exams.view");
  const scope = await examScope(actor, db);
  const { OR: scopeOr, ...rest } = scope;
  const rows = await db.exam.findMany({
    where: {
      ...rest,
      AND: [
        { OR: [{ groupId }, { targets: { some: { groupId } } }] },
        ...(scopeOr ? [{ OR: scopeOr }] : []),
      ],
    },
    include,
    orderBy: [{ date: "desc" }, { startTime: "asc" }],
  });
  const members = await groupMemberCounts(db, [groupId]);
  return rows.map((r) => toDto(r, r.groupId ? (members.get(groupId) ?? 0) : undefined));
}
