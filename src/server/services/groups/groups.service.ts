import type { Prisma } from "@/generated/prisma/client";
import type { Page } from "@/lib/validation/common";
import type {
  GroupInput,
  GroupSortField,
  GroupStatus,
  GroupTeacherInput,
  GroupUpdateInput,
  ScheduleSlotInput,
  Weekday,
  WeekdayPattern,
} from "@/lib/validation/groups";
import { diffFields, recordAudit } from "@/server/audit/audit";
import { prisma, type DbClient } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";
import type { ParsedList } from "@/server/http/list-query";
import { authorize, authorizeBranch, type Actor } from "@/server/rbac/authorize";
import {
  dateToIso,
  decimalToNumber,
  isoToDate,
  mustFind,
  rethrowAsAppError,
} from "@/server/services/settings/shared";
import { TEACHER_ROLE_CODES } from "@/server/services/staff/staff.service";

import { addMonths, courseMonths, PATTERN_WEEKDAYS, planLessons } from "./schedule";
import { findGroupInScope, groupScope, today } from "./shared";

/* Groups (EXP §5): list, drawer form, detail card, actions. */

export interface SlotDto {
  weekday: Weekday;
  startTime: string;
  endTime: string;
  roomId: string | null;
  roomName: string | null;
}

export interface GroupTeacherDto {
  userId: string;
  fullName: string;
  role: "MAIN" | "ASSISTANT" | "CO_TEACHER";
  shareType: "PERCENT" | "PER_LESSON" | "PER_STUDENT";
  shareValue: number;
  since: string;
}

export interface GroupDto {
  id: string;
  branchId: string;
  branchName: string;
  name: string;
  courseId: string;
  courseName: string;
  courseColor: string | null;
  coursePrice: number;
  courseDurationMonths: number;
  gradingSystemId: string | null;
  gradingSystemName: string;
  weekdayPattern: WeekdayPattern;
  slots: SlotDto[];
  teachers: GroupTeacherDto[];
  supportTeachers: Array<{ userId: string; fullName: string }>;
  startDate: string;
  endDate: string;
  status: GroupStatus;
  activeStudents: number;
  lessonsHeld: number;
  months: string[];
}

export interface GroupFilters {
  status?: GroupStatus | "ALL";
  teacherId?: string;
  courseId?: string;
  weekdayPattern?: WeekdayPattern;
}

const include = {
  branch: { select: { name: true } },
  course: {
    select: {
      name: true,
      color: true,
      price: true,
      durationMonths: true,
      gradingSystem: { select: { name: true } },
    },
  },
  gradingSystem: { select: { name: true } },
  slots: { include: { room: { select: { name: true } } }, orderBy: { weekday: "asc" as const } },
  teachers: {
    include: { user: { select: { fullName: true } } },
    orderBy: { since: "asc" as const },
  },
  supportTeachers: { include: { user: { select: { fullName: true } } } },
  _count: { select: { memberships: { where: { status: { in: ["ACTIVE", "TRIAL"] } } } } },
} satisfies Prisma.GroupInclude;

type Row = Prisma.GroupGetPayload<{ include: typeof include }> & { lessonsHeld?: number };

export function toGroupDto(row: Row): GroupDto {
  return {
    id: row.id,
    branchId: row.branchId,
    branchName: row.branch.name,
    name: row.name,
    courseId: row.courseId,
    courseName: row.course.name,
    courseColor: row.course.color,
    coursePrice: decimalToNumber(row.course.price),
    courseDurationMonths: row.course.durationMonths,
    gradingSystemId: row.gradingSystemId,
    gradingSystemName: row.gradingSystem?.name ?? row.course.gradingSystem?.name ?? "",
    weekdayPattern: row.weekdayPattern,
    slots: row.slots.map((s) => ({
      weekday: s.weekday as Weekday,
      startTime: s.startTime,
      endTime: s.endTime,
      roomId: s.roomId,
      roomName: s.room?.name ?? null,
    })),
    teachers: row.teachers.map((t) => ({
      userId: t.userId,
      fullName: t.user.fullName,
      role: t.role,
      shareType: t.shareType,
      shareValue: decimalToNumber(t.shareValue),
      since: dateToIso(t.since),
    })),
    supportTeachers: row.supportTeachers.map((s) => ({
      userId: s.userId,
      fullName: s.user.fullName,
    })),
    startDate: dateToIso(row.startDate),
    endDate: dateToIso(row.endDate),
    status: row.status,
    activeStudents: row._count.memberships,
    lessonsHeld: row.lessonsHeld ?? 0,
    months: courseMonths(dateToIso(row.startDate), dateToIso(row.endDate)),
  };
}

/** The fields the history tab shows (EXP §5 "Guruh tarixi"); ids and counters are noise there. */
const HISTORY_FIELDS = new Set([
  "name",
  "courseName",
  "gradingSystemName",
  "weekdayPattern",
  "slots",
  "teachers",
  "supportTeachers",
  "startDate",
  "endDate",
  "status",
  "branchName",
]);

async function withLessonsHeld(db: DbClient, rows: Row[]): Promise<Row[]> {
  if (rows.length === 0) return rows;
  const counts = await db.lesson.groupBy({
    by: ["groupId"],
    where: { groupId: { in: rows.map((r) => r.id) }, date: { lte: isoToDate(today()) } },
    _count: { _all: true },
  });
  const byGroup = new Map(counts.map((c) => [c.groupId, c._count._all]));
  return rows.map((r) => ({ ...r, lessonsHeld: byGroup.get(r.id) ?? 0 }));
}

export async function listGroups(
  actor: Actor,
  query: ParsedList<GroupSortField>,
  filters: GroupFilters = {},
  db: DbClient = prisma,
): Promise<Page<GroupDto>> {
  authorize(actor, "groups.view");
  const status = filters.status ?? "ACTIVE";
  const where: Prisma.GroupWhereInput = {
    ...groupScope(actor),
    ...(status === "ALL" ? {} : { status }),
    ...(filters.courseId ? { courseId: filters.courseId } : {}),
    ...(filters.weekdayPattern ? { weekdayPattern: filters.weekdayPattern } : {}),
    ...(filters.teacherId ? { teachers: { some: { userId: filters.teacherId } } } : {}),
    ...(query.q ? { name: { contains: query.q, mode: "insensitive" as const } } : {}),
  };
  const [total, rows] = await Promise.all([
    db.group.count({ where }),
    db.group.findMany({
      where,
      include,
      orderBy: [{ [query.sort.field]: query.sort.direction }, { id: "asc" }],
      skip: query.skip,
      take: query.take,
    }),
  ]);
  const items = (await withLessonsHeld(db, rows)).map(toGroupDto);
  return { items, page: query.page, pageSize: query.pageSize, total };
}

export async function getGroup(actor: Actor, id: string, db: DbClient = prisma): Promise<GroupDto> {
  authorize(actor, "groups.view");
  const row = await findGroupInScope(db, actor, id, include);
  return toGroupDto((await withLessonsHeld(db, [row]))[0]!);
}

/** Teachers the group form can pick: users with a teacher role in the branch (EXP §5). */
export async function listTeacherOptions(
  actor: Actor,
  branchId: string,
  db: DbClient = prisma,
): Promise<Array<{ id: string; fullName: string; roles: string[] }>> {
  authorize(actor, "groups.view");
  const rows = await db.user.findMany({
    where: {
      isArchived: false,
      branches: { some: { branchId } },
      roles: { some: { role: { code: { in: TEACHER_ROLE_CODES } } } },
    },
    select: { id: true, fullName: true, roles: { select: { role: { select: { code: true } } } } },
    orderBy: { fullName: "asc" },
  });
  return rows.map((r) => ({
    id: r.id,
    fullName: r.fullName,
    roles: r.roles.map((x) => x.role.code),
  }));
}

// --- validation of references ------------------------------------------------

async function checkCourse(db: DbClient, branchId: string, courseId: string) {
  const course = await mustFind(
    db.course.findFirst({ where: { id: courseId, branchId, isArchived: false } }),
    "errors.courseNotFound",
  );
  return course;
}

async function checkGradingSystem(db: DbClient, id: string | null | undefined) {
  if (!id) return;
  await mustFind(db.gradingSystem.findUnique({ where: { id } }), "errors.notFound");
}

function checkSlots(pattern: WeekdayPattern, slots: ScheduleSlotInput[]) {
  if (pattern === "CUSTOM") return;
  const allowed = new Set<number>(PATTERN_WEEKDAYS[pattern]);
  if (slots.some((s) => !allowed.has(s.weekday))) {
    throw AppError.validation({ slots: ["validation.slotsPattern"] });
  }
}

async function checkRooms(db: DbClient, branchId: string, slots: ScheduleSlotInput[]) {
  const roomIds = [...new Set(slots.map((s) => s.roomId).filter((r): r is string => !!r))];
  if (roomIds.length === 0) return;
  const found = await db.room.count({ where: { id: { in: roomIds }, branchId } });
  if (found !== roomIds.length) throw AppError.validation({ slots: ["validation.roomBranch"] });
}

async function checkTeachers(db: DbClient, userIds: string[]) {
  if (userIds.length === 0) return;
  const found = await db.user.count({
    where: {
      id: { in: [...new Set(userIds)] },
      isArchived: false,
      roles: { some: { role: { code: { in: TEACHER_ROLE_CODES } } } },
    },
  });
  if (found !== new Set(userIds).size) {
    throw AppError.validation({ teachers: ["validation.teacherUnknown"] });
  }
}

// --- lessons plan ------------------------------------------------------------

async function daysOffFor(
  db: DbClient,
  branchId: string,
  groupId: string | null,
): Promise<string[]> {
  const [branchDays, groupDays] = await Promise.all([
    db.dayOff.findMany({ where: { branchId }, select: { date: true } }),
    groupId
      ? db.groupDayOff.findMany({ where: { groupId }, select: { date: true } })
      : Promise.resolve([]),
  ]);
  return [...branchDays, ...groupDays].map((d) => dateToIso(d.date));
}

/**
 * Brings the generated lessons in line with the schedule (A-54): planned
 * lessons that do not exist yet are created; existing non-extra lessons that
 * fall outside the plan and carry no attendance or grade are removed.
 */
export async function syncLessons(
  tx: DbClient,
  group: { id: string; branchId: string; startDate: Date; endDate: Date },
  slots: Array<{ weekday: number; startTime: string; endTime: string }>,
) {
  const plan = planLessons(
    dateToIso(group.startDate),
    dateToIso(group.endDate),
    slots,
    await daysOffFor(tx, group.branchId, group.id),
  );
  const existing = await tx.lesson.findMany({
    where: { groupId: group.id },
    select: {
      id: true,
      date: true,
      startTime: true,
      isExtra: true,
      _count: { select: { attendances: true, grades: true } },
    },
  });
  const key = (date: string, start: string) => `${date}|${start}`;
  const planned = new Set(plan.map((p) => key(p.date, p.startTime)));
  const have = new Set(existing.map((l) => key(dateToIso(l.date), l.startTime)));

  const stale = existing.filter(
    (l) =>
      !l.isExtra &&
      !planned.has(key(dateToIso(l.date), l.startTime)) &&
      l._count.attendances === 0 &&
      l._count.grades === 0,
  );
  if (stale.length) await tx.lesson.deleteMany({ where: { id: { in: stale.map((l) => l.id) } } });
  const missing = plan.filter((p) => !have.has(key(p.date, p.startTime)));
  if (missing.length) {
    await tx.lesson.createMany({
      data: missing.map((p) => ({
        groupId: group.id,
        date: isoToDate(p.date),
        startTime: p.startTime,
        endTime: p.endTime,
      })),
      skipDuplicates: true,
    });
  }
  return { created: missing.length, removed: stale.length };
}

// --- create / update -----------------------------------------------------------

export async function createGroup(
  actor: Actor,
  input: GroupInput,
  db: DbClient = prisma,
): Promise<GroupDto> {
  authorize(actor, "groups.create");
  authorizeBranch(actor, input.branchId);
  const course = await checkCourse(db, input.branchId, input.courseId);
  checkSlots(input.weekdayPattern, input.slots);
  await Promise.all([
    checkGradingSystem(db, input.gradingSystemId),
    checkRooms(db, input.branchId, input.slots),
    checkTeachers(
      db,
      input.teachers.map((t) => t.userId),
    ),
  ]);
  const endDate = input.endDate ?? addMonths(input.startDate, course.durationMonths);
  try {
    return await db.$transaction(async (tx) => {
      const created = await tx.group.create({
        data: {
          branchId: input.branchId,
          name: input.name,
          courseId: input.courseId,
          gradingSystemId: input.gradingSystemId ?? null,
          weekdayPattern: input.weekdayPattern,
          startDate: isoToDate(input.startDate),
          endDate: isoToDate(endDate),
          status: input.status,
          slots: {
            create: input.slots.map((s) => ({
              weekday: s.weekday,
              startTime: s.startTime,
              endTime: s.endTime,
              roomId: s.roomId ?? null,
            })),
          },
          teachers: {
            create: input.teachers.map((t) => ({
              userId: t.userId,
              role: t.role,
              shareType: t.shareType,
              shareValue: t.shareValue,
              since: isoToDate(input.startDate),
            })),
          },
        },
        select: { id: true, branchId: true, startDate: true, endDate: true },
      });
      await syncLessons(tx, created, input.slots);
      const row = await tx.group.findUniqueOrThrow({ where: { id: created.id }, include });
      const dto = toGroupDto(row);
      await recordAudit(tx, actor, {
        action: "group.create",
        entity: "Group",
        entityId: row.id,
        after: dto,
        branchId: row.branchId,
      });
      return dto;
    });
  } catch (error) {
    rethrowAsAppError(error, "name");
  }
}

export async function updateGroup(
  actor: Actor,
  id: string,
  input: GroupUpdateInput,
  db: DbClient = prisma,
): Promise<GroupDto> {
  authorize(actor, "groups.update");
  const existing = await findGroupInScope(db, actor, id, include);
  const before = toGroupDto(existing);
  const courseId = input.courseId ?? existing.courseId;
  const course = await checkCourse(db, existing.branchId, courseId);
  const pattern = input.weekdayPattern ?? existing.weekdayPattern;
  const slots: ScheduleSlotInput[] =
    input.slots ??
    existing.slots.map((s) => ({
      weekday: s.weekday,
      startTime: s.startTime,
      endTime: s.endTime,
      roomId: s.roomId,
    }));
  checkSlots(pattern, slots);
  if ("gradingSystemId" in input) await checkGradingSystem(db, input.gradingSystemId);
  if (input.slots) await checkRooms(db, existing.branchId, input.slots);
  if (input.teachers)
    await checkTeachers(
      db,
      input.teachers.map((t) => t.userId),
    );
  const startDate = input.startDate ?? before.startDate;
  const endDate =
    input.endDate ??
    (input.startDate &&
    !input.endDate &&
    before.endDate === addMonths(before.startDate, existing.course.durationMonths)
      ? addMonths(startDate, course.durationMonths)
      : before.endDate);
  if (endDate < startDate) throw AppError.validation({ endDate: ["validation.endAfterStart"] });

  try {
    return await db.$transaction(async (tx) => {
      if (input.slots) {
        await tx.groupScheduleSlot.deleteMany({ where: { groupId: id } });
        await tx.groupScheduleSlot.createMany({
          data: input.slots.map((s) => ({
            groupId: id,
            weekday: s.weekday,
            startTime: s.startTime,
            endTime: s.endTime,
            roomId: s.roomId ?? null,
          })),
        });
      }
      if (input.teachers) await replaceTeachers(tx, id, input.teachers, existing.teachers);
      const updated = await tx.group.update({
        where: { id },
        data: {
          ...(input.name !== undefined ? { name: input.name } : {}),
          courseId,
          ...("gradingSystemId" in input ? { gradingSystemId: input.gradingSystemId ?? null } : {}),
          weekdayPattern: pattern,
          startDate: isoToDate(startDate),
          endDate: isoToDate(endDate),
          ...(input.status !== undefined ? { status: input.status } : {}),
        },
        select: { id: true, branchId: true, startDate: true, endDate: true },
      });
      await syncLessons(tx, updated, slots);
      const row = await tx.group.findUniqueOrThrow({ where: { id }, include });
      const after = toGroupDto(row);
      await recordAudit(tx, actor, {
        action: "group.update",
        entity: "Group",
        entityId: id,
        before,
        after,
        branchId: row.branchId,
      });
      return after;
    });
  } catch (error) {
    rethrowAsAppError(error, "name");
  }
}

/** Keeps `since` for teachers who stay; newcomers start today. */
async function replaceTeachers(
  tx: DbClient,
  groupId: string,
  next: GroupTeacherInput[],
  current: Array<{ userId: string; since: Date }>,
) {
  const sinceBy = new Map(current.map((t) => [t.userId, t.since]));
  await tx.groupTeacher.deleteMany({ where: { groupId } });
  if (next.length) {
    await tx.groupTeacher.createMany({
      data: next.map((t) => ({
        groupId,
        userId: t.userId,
        role: t.role,
        shareType: t.shareType,
        shareValue: t.shareValue,
        since: sinceBy.get(t.userId) ?? isoToDate(today()),
      })),
    });
  }
}

// --- row actions -------------------------------------------------------------

/** "Guruhni yakunlash": the group ends today, active students graduate (A-55). */
export async function finishGroup(
  actor: Actor,
  id: string,
  db: DbClient = prisma,
): Promise<GroupDto> {
  authorize(actor, "groups.update");
  const existing = await findGroupInScope(db, actor, id, include);
  const before = toGroupDto(existing);
  const end = today() < before.endDate ? today() : before.endDate;
  return db.$transaction(async (tx) => {
    await tx.groupMembership.updateMany({
      where: { groupId: id, status: { in: ["ACTIVE", "TRIAL", "FROZEN", "NEW"] } },
      data: { status: "GRADUATED", leftAt: isoToDate(today()) },
    });
    await tx.lesson.deleteMany({
      where: {
        groupId: id,
        date: { gt: isoToDate(end) },
        attendances: { none: {} },
        grades: { none: {} },
      },
    });
    const row = await tx.group.update({
      where: { id },
      data: { status: "ARCHIVED", finishedAt: new Date(), endDate: isoToDate(end) },
      include,
    });
    const after = toGroupDto(row);
    await recordAudit(tx, actor, {
      action: "group.finish",
      entity: "Group",
      entityId: id,
      before,
      after,
      branchId: row.branchId,
    });
    return after;
  });
}

/** "O'chirish" archives (A-38); nothing about the group is lost. */
export async function archiveGroup(actor: Actor, id: string, db: DbClient = prisma): Promise<void> {
  authorize(actor, "groups.delete");
  const existing = await findGroupInScope(db, actor, id, include);
  const before = toGroupDto(existing);
  await db.$transaction(async (tx) => {
    const row = await tx.group.update({ where: { id }, data: { status: "ARCHIVED" }, include });
    await recordAudit(tx, actor, {
      action: "group.archive",
      entity: "Group",
      entityId: id,
      before,
      after: toGroupDto(row),
      branchId: row.branchId,
    });
  });
}

/** "Boshqa filialga o'tkazish": rooms belong to the old branch, so slots lose their room (A-56). */
export async function moveGroupBranch(
  actor: Actor,
  id: string,
  branchId: string,
  db: DbClient = prisma,
): Promise<GroupDto> {
  authorize(actor, "groups.update");
  authorizeBranch(actor, branchId);
  const existing = await findGroupInScope(db, actor, id, include);
  if (existing.branchId === branchId) return toGroupDto(existing);
  await mustFind(
    db.branch.findFirst({ where: { id: branchId, isActive: true } }),
    "errors.branchNotFound",
  );
  const before = toGroupDto(existing);
  return db.$transaction(async (tx) => {
    await tx.groupScheduleSlot.updateMany({ where: { groupId: id }, data: { roomId: null } });
    const row = await tx.group.update({ where: { id }, data: { branchId }, include });
    const after = toGroupDto(row);
    await recordAudit(tx, actor, {
      action: "group.moveBranch",
      entity: "Group",
      entityId: id,
      before,
      after,
      branchId,
    });
    return after;
  });
}

/** "O'qituvchini almashtirish": one teacher row is swapped for another, from today. */
export async function changeGroupTeacher(
  actor: Actor,
  id: string,
  fromUserId: string,
  to: GroupTeacherInput,
  db: DbClient = prisma,
): Promise<GroupDto> {
  authorize(actor, "groups.update");
  const existing = await findGroupInScope(db, actor, id, include);
  const before = toGroupDto(existing);
  const next = existing.teachers.map((t) =>
    t.userId === fromUserId
      ? to
      : {
          userId: t.userId,
          role: t.role,
          shareType: t.shareType,
          shareValue: decimalToNumber(t.shareValue),
        },
  );
  if (!existing.teachers.some((t) => t.userId === fromUserId)) throw AppError.notFound();
  if (new Set(next.map((t) => t.userId)).size !== next.length) {
    throw AppError.validation({ teachers: ["validation.teachersUnique"] });
  }
  await checkTeachers(db, [to.userId]);
  return db.$transaction(async (tx) => {
    await replaceTeachers(
      tx,
      id,
      next,
      existing.teachers.filter((t) => t.userId !== fromUserId),
    );
    const row = await tx.group.findUniqueOrThrow({ where: { id }, include });
    const after = toGroupDto(row);
    await recordAudit(tx, actor, {
      action: "group.changeTeacher",
      entity: "Group",
      entityId: id,
      before,
      after,
      branchId: row.branchId,
    });
    return after;
  });
}

export async function setSupportTeachers(
  actor: Actor,
  id: string,
  userIds: string[],
  db: DbClient = prisma,
): Promise<GroupDto> {
  authorize(actor, "groups.update");
  const existing = await findGroupInScope(db, actor, id, include);
  const before = toGroupDto(existing);
  const unique = [...new Set(userIds)];
  await checkTeachers(db, unique);
  return db.$transaction(async (tx) => {
    await tx.groupSupportTeacher.deleteMany({ where: { groupId: id } });
    if (unique.length) {
      await tx.groupSupportTeacher.createMany({
        data: unique.map((userId) => ({ groupId: id, userId })),
      });
    }
    const row = await tx.group.findUniqueOrThrow({ where: { id }, include });
    const after = toGroupDto(row);
    await recordAudit(tx, actor, {
      action: "group.supportTeachers",
      entity: "Group",
      entityId: id,
      before,
      after,
      branchId: row.branchId,
    });
    return after;
  });
}

export interface GroupDayOffDto {
  id: string;
  date: string;
  reason: string;
}

export async function listGroupDaysOff(
  actor: Actor,
  id: string,
  db: DbClient = prisma,
): Promise<GroupDayOffDto[]> {
  authorize(actor, "groups.view");
  await findGroupInScope(db, actor, id, {});
  const rows = await db.groupDayOff.findMany({ where: { groupId: id }, orderBy: { date: "asc" } });
  return rows.map((r) => ({ id: r.id, date: dateToIso(r.date), reason: r.reason }));
}

/** "Dam berish": the group skips that day; an unmarked lesson on it is removed (A-53). */
export async function addGroupDayOff(
  actor: Actor,
  id: string,
  input: { date: string; reason: string },
  db: DbClient = prisma,
): Promise<GroupDayOffDto> {
  authorize(actor, "groups.update");
  const group = await findGroupInScope(db, actor, id, {});
  try {
    return await db.$transaction(async (tx) => {
      const row = await tx.groupDayOff.create({
        data: { groupId: id, date: isoToDate(input.date), reason: input.reason },
      });
      await tx.lesson.deleteMany({
        where: {
          groupId: id,
          date: isoToDate(input.date),
          isExtra: false,
          attendances: { none: {} },
          grades: { none: {} },
        },
      });
      const dto = { id: row.id, date: input.date, reason: input.reason };
      await recordAudit(tx, actor, {
        action: "group.dayOff",
        entity: "Group",
        entityId: id,
        after: dto,
        branchId: group.branchId,
      });
      return dto;
    });
  } catch (error) {
    rethrowAsAppError(error, "date");
  }
}

// --- notes and history ---------------------------------------------------------

export interface GroupNoteDto {
  id: string;
  text: string;
  authorName: string | null;
  createdAt: string;
}

export async function listGroupNotes(
  actor: Actor,
  id: string,
  db: DbClient = prisma,
): Promise<GroupNoteDto[]> {
  authorize(actor, "groups.view");
  await findGroupInScope(db, actor, id, {});
  const rows = await db.groupNote.findMany({
    where: { groupId: id },
    include: { author: { select: { fullName: true } } },
    orderBy: { createdAt: "desc" },
  });
  return rows.map((r) => ({
    id: r.id,
    text: r.text,
    authorName: r.author?.fullName ?? null,
    createdAt: r.createdAt.toISOString(),
  }));
}

export async function addGroupNote(
  actor: Actor,
  id: string,
  text: string,
  db: DbClient = prisma,
): Promise<GroupNoteDto> {
  authorize(actor, "groups.update");
  const group = await findGroupInScope(db, actor, id, {});
  return db.$transaction(async (tx) => {
    const row = await tx.groupNote.create({ data: { groupId: id, authorId: actor.userId, text } });
    await recordAudit(tx, actor, {
      action: "group.note",
      entity: "Group",
      entityId: id,
      after: { noteId: row.id, text },
      branchId: group.branchId,
    });
    return { id: row.id, text, authorName: actor.fullName, createdAt: row.createdAt.toISOString() };
  });
}

export interface GroupHistoryDto {
  id: string;
  action: string;
  field: string;
  before: unknown;
  after: unknown;
  actorName: string | null;
  at: string;
}

/** "Guruh tarixi": field-level changes read back from the audit log (EXP §5). */
export async function listGroupHistory(
  actor: Actor,
  id: string,
  query: { page: number; pageSize: number; skip: number; take: number },
  db: DbClient = prisma,
): Promise<Page<GroupHistoryDto>> {
  authorize(actor, "groups.view");
  await findGroupInScope(db, actor, id, {});
  const where = { entity: "Group", entityId: id };
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
  const items: GroupHistoryDto[] = [];
  for (const row of rows) {
    const base = {
      action: row.action,
      actorName: row.actor?.fullName ?? null,
      at: row.createdAt.toISOString(),
    };
    const before = (row.before ?? {}) as Record<string, unknown>;
    const after = (row.after ?? {}) as Record<string, unknown>;
    const changes =
      row.action === "group.create"
        ? [] // creation is one line, not a diff against nothing
        : diffFields(before, after).filter((c) => HISTORY_FIELDS.has(c.field));
    if (changes.length === 0) {
      items.push({ id: row.id, field: "", before: null, after: null, ...base });
      continue;
    }
    for (const change of changes) {
      items.push({
        id: `${row.id}:${change.field}`,
        field: change.field,
        before: change.before,
        after: change.after,
        ...base,
      });
    }
  }
  return { items, page: query.page, pageSize: query.pageSize, total };
}
