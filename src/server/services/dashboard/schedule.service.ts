import type { ScheduleFilters, ScheduleStep } from "@/lib/validation/dashboard";
import { prisma, type DbClient } from "@/server/db/prisma";
import { authorize, type Actor } from "@/server/rbac/authorize";
import { branchIn, reportBranch } from "@/server/services/reports/shared";

/* EXP §1 schedule grid: rooms × time slots for one weekday, blocks per group. */

export interface ScheduleBlockDto {
  groupId: string;
  groupName: string;
  courseName: string;
  color: string | null;
  teacherName: string | null;
  startTime: string;
  endTime: string;
}

export interface ScheduleDto {
  weekday: number;
  step: ScheduleStep;
  workStart: string;
  workEnd: string;
  /** Column starts, "HH:MM", from workStart to workEnd exclusive. */
  slots: string[];
  rooms: Array<{ id: string; name: string; capacity: number; blocks: ScheduleBlockDto[] }>;
  /** Groups whose slot has no room. */
  unassigned: ScheduleBlockDto[];
}

/** Monday = 1 … Sunday = 7, in Tashkent time (UTC+5). */
export function weekdayToday(now = new Date()): number {
  const local = new Date(now.getTime() + 5 * 60 * 60 * 1000);
  const d = local.getUTCDay();
  return d === 0 ? 7 : d;
}

const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const hhmm = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

export async function getDashboardSchedule(
  actor: Actor,
  filters: ScheduleFilters,
  db: DbClient = prisma,
): Promise<ScheduleDto> {
  authorize(actor, "dashboard.view");
  const where = branchIn(reportBranch(actor, filters.branchId));
  const weekday = filters.weekday ?? weekdayToday();
  const step = filters.step;
  const [settings, rooms, slots] = await Promise.all([
    db.orgSettings.findFirst({
      where: { organizationId: actor.organizationId },
      select: { workStart: true, workEnd: true },
    }),
    db.room.findMany({
      where,
      select: { id: true, name: true, capacity: true },
      orderBy: { name: "asc" },
    }),
    db.groupScheduleSlot.findMany({
      where: { weekday, group: { ...where, status: { not: "ARCHIVED" } } },
      select: {
        roomId: true,
        startTime: true,
        endTime: true,
        group: {
          select: {
            id: true,
            name: true,
            course: { select: { name: true, color: true } },
            teachers: {
              where: { role: "MAIN" },
              select: { user: { select: { fullName: true } } },
              take: 1,
            },
          },
        },
      },
      orderBy: [{ startTime: "asc" }, { group: { name: "asc" } }],
    }),
  ]);
  const workStart = settings?.workStart ?? "08:00";
  const workEnd = settings?.workEnd ?? "20:00";
  const columns: string[] = [];
  for (let m = minutes(workStart); m < minutes(workEnd); m += step) columns.push(hhmm(m));
  const block = (s: (typeof slots)[number]): ScheduleBlockDto => ({
    groupId: s.group.id,
    groupName: s.group.name,
    courseName: s.group.course.name,
    color: s.group.course.color,
    teacherName: s.group.teachers[0]?.user.fullName ?? null,
    startTime: s.startTime,
    endTime: s.endTime,
  });
  return {
    weekday,
    step,
    workStart,
    workEnd,
    slots: columns,
    rooms: rooms.map((r) => ({ ...r, blocks: slots.filter((s) => s.roomId === r.id).map(block) })),
    unassigned: slots.filter((s) => !s.roomId || !rooms.some((r) => r.id === s.roomId)).map(block),
  };
}
