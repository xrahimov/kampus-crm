import type { Prisma } from "@/generated/prisma/client";
import type { ScheduleSlotInput } from "@/lib/validation/groups";
import { prisma, type DbClient } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";
import { authorize, type Actor } from "@/server/rbac/authorize";
import { isoToDate } from "@/server/services/settings/shared";
import { TEACHER_ROLE_CODES } from "@/server/services/staff/staff.service";

import { groupScope, ownGroupsOnly } from "./shared";

/*
 * Room and teacher clashes (A-116). When a group's schedule is saved, the other
 * current groups of the centre are checked for the same room or the same teacher
 * at an overlapping time on the same weekday; the save is refused with the list
 * of clashes unless the user chose to save anyway. The same data draws the
 * weekly timetable of one room or one teacher.
 */

const CURRENT_STATUSES = ["ACTIVE", "FROZEN", "TRIAL"] as const;

export interface ClashDto {
  kind: "ROOM" | "TEACHER";
  weekday: number;
  /** The other group's time on that day. */
  startTime: string;
  endTime: string;
  groupId: string;
  groupName: string;
  roomName: string | null;
  teacherName: string | null;
}

export interface ClashQuery {
  organizationId: string;
  /** The group being edited, left out of the comparison. */
  groupId?: string | null;
  slots: ScheduleSlotInput[];
  teacherIds: string[];
  startDate: string;
  endDate: string;
}

const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const overlaps = (
  a: { startTime: string; endTime: string },
  b: { startTime: string; endTime: string },
) => minutes(a.startTime) < minutes(b.endTime) && minutes(b.startTime) < minutes(a.endTime);

export async function findClashes(db: DbClient, query: ClashQuery): Promise<ClashDto[]> {
  const roomIds = [...new Set(query.slots.map((s) => s.roomId).filter((r): r is string => !!r))];
  const teacherIds = [...new Set(query.teacherIds)];
  if (roomIds.length === 0 && teacherIds.length === 0) return [];
  const weekdays = [...new Set(query.slots.map((s) => s.weekday))];
  const or: Prisma.GroupScheduleSlotWhereInput[] = [];
  if (roomIds.length) or.push({ roomId: { in: roomIds } });
  if (teacherIds.length) or.push({ group: { teachers: { some: { userId: { in: teacherIds } } } } });
  const rows = await db.groupScheduleSlot.findMany({
    where: {
      weekday: { in: weekdays },
      OR: or,
      group: {
        ...(query.groupId ? { id: { not: query.groupId } } : {}),
        status: { in: [...CURRENT_STATUSES] },
        branch: { organizationId: query.organizationId },
        startDate: { lte: isoToDate(query.endDate) },
        endDate: { gte: isoToDate(query.startDate) },
      },
    },
    include: {
      room: { select: { name: true } },
      group: {
        select: {
          id: true,
          name: true,
          teachers: { select: { userId: true, user: { select: { fullName: true } } } },
        },
      },
    },
    orderBy: [{ weekday: "asc" }, { startTime: "asc" }],
  });
  const clashes: ClashDto[] = [];
  const seen = new Set<string>();
  const push = (c: ClashDto) => {
    const key = `${c.kind}:${c.groupId}:${c.weekday}:${c.teacherName ?? ""}`;
    if (seen.has(key)) return;
    seen.add(key);
    clashes.push(c);
  };
  for (const slot of query.slots) {
    for (const row of rows) {
      if (row.weekday !== slot.weekday || !overlaps(slot, row)) continue;
      const base = {
        weekday: row.weekday,
        startTime: row.startTime,
        endTime: row.endTime,
        groupId: row.group.id,
        groupName: row.group.name,
      };
      if (slot.roomId && row.roomId === slot.roomId) {
        push({ ...base, kind: "ROOM", roomName: row.room?.name ?? null, teacherName: null });
      }
      for (const t of row.group.teachers) {
        if (!teacherIds.includes(t.userId)) continue;
        push({ ...base, kind: "TEACHER", roomName: null, teacherName: t.user.fullName });
      }
    }
  }
  return clashes;
}

/** Refuses the save with the clash list (409) unless the user chose to save anyway. */
export async function assertNoClashes(
  db: DbClient,
  query: ClashQuery & { ignore?: boolean },
): Promise<void> {
  if (query.ignore) return;
  const clashes = await findClashes(db, query);
  if (clashes.length > 0) {
    throw new AppError("CONFLICT", "errors.scheduleClash", { meta: { clashes } });
  }
}

/* ----- weekly timetable --------------------------------------------------------------------- */

export type TimetableMode = "room" | "teacher";

export interface TimetableBlockDto {
  weekday: number;
  startTime: string;
  endTime: string;
  groupId: string;
  groupName: string;
  courseName: string;
  color: string | null;
  roomName: string | null;
  teacherNames: string[];
}

export interface TimetableDto {
  mode: TimetableMode;
  branchId: string | null;
  branches: Array<{ id: string; name: string }>;
  rooms: Array<{ id: string; name: string }>;
  teachers: Array<{ id: string; fullName: string }>;
  selectedId: string | null;
  workStart: string;
  workEnd: string;
  blocks: TimetableBlockDto[];
}

export interface TimetableFilters {
  mode?: TimetableMode;
  branchId?: string;
  id?: string;
}

/**
 * One room's or one teacher's week: the slots of the current groups in the
 * actor's scope (a teacher: their own groups) in one branch.
 */
export async function getTimetable(
  actor: Actor,
  filters: TimetableFilters,
  db: DbClient = prisma,
): Promise<TimetableDto> {
  authorize(actor, "groups.view");
  const branches = await db.branch.findMany({
    where: { id: { in: actor.branchIds }, isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });
  const branchId =
    (filters.branchId && actor.branchIds.includes(filters.branchId) ? filters.branchId : null) ??
    actor.activeBranchId ??
    branches[0]?.id ??
    null;
  const own = ownGroupsOnly(actor);
  const mode: TimetableMode = filters.mode ?? (own ? "teacher" : "room");
  const settings = await db.orgSettings.findFirst({
    where: { organizationId: actor.organizationId },
    select: { workStart: true, workEnd: true },
  });
  if (!branchId) {
    return {
      mode,
      branchId: null,
      branches,
      rooms: [],
      teachers: [],
      selectedId: null,
      workStart: settings?.workStart ?? "08:00",
      workEnd: settings?.workEnd ?? "20:00",
      blocks: [],
    };
  }
  const [rooms, teachers] = await Promise.all([
    db.room.findMany({
      where: { branchId },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.user.findMany({
      where: own
        ? { id: actor.userId }
        : {
            organizationId: actor.organizationId,
            isArchived: false,
            branches: { some: { branchId } },
            roles: { some: { role: { code: { in: TEACHER_ROLE_CODES } } } },
          },
      select: { id: true, fullName: true },
      orderBy: { fullName: "asc" },
    }),
  ]);
  const options = mode === "room" ? rooms : teachers;
  const selectedId =
    (filters.id && options.some((o) => o.id === filters.id) ? filters.id : null) ??
    (mode === "teacher" && own ? actor.userId : null) ??
    options[0]?.id ??
    null;
  // This week in Tashkent: groups that have started (or start before Sunday) and have not ended.
  const now = new Date(Date.now() + 5 * 60 * 60 * 1000);
  const today = isoToDate(now.toISOString().slice(0, 10));
  const weekEnd = new Date(now);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + (7 - (now.getUTCDay() || 7)));
  const slots = selectedId
    ? await db.groupScheduleSlot.findMany({
        where: {
          ...(mode === "room"
            ? { roomId: selectedId }
            : {
                group: {
                  OR: [
                    { teachers: { some: { userId: selectedId } } },
                    { supportTeachers: { some: { userId: selectedId } } },
                  ],
                },
              }),
          group: {
            ...groupScope(actor),
            branchId,
            status: { in: [...CURRENT_STATUSES] },
            startDate: { lte: isoToDate(weekEnd.toISOString().slice(0, 10)) },
            endDate: { gte: today },
            ...(mode === "teacher"
              ? {
                  OR: [
                    { teachers: { some: { userId: selectedId } } },
                    { supportTeachers: { some: { userId: selectedId } } },
                  ],
                }
              : {}),
          },
        },
        include: {
          room: { select: { name: true } },
          group: {
            select: {
              id: true,
              name: true,
              course: { select: { name: true, color: true } },
              teachers: { select: { user: { select: { fullName: true } } } },
            },
          },
        },
        orderBy: [{ weekday: "asc" }, { startTime: "asc" }],
      })
    : [];
  return {
    mode,
    branchId,
    branches,
    rooms,
    teachers,
    selectedId,
    workStart: settings?.workStart ?? "08:00",
    workEnd: settings?.workEnd ?? "20:00",
    blocks: slots.map((s) => ({
      weekday: s.weekday,
      startTime: s.startTime,
      endTime: s.endTime,
      groupId: s.group.id,
      groupName: s.group.name,
      courseName: s.group.course.name,
      color: s.group.course.color,
      roomName: s.room?.name ?? null,
      teacherNames: s.group.teachers.map((t) => t.user.fullName),
    })),
  };
}
