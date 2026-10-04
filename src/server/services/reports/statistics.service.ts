import type { StatisticsFilters, StatisticsView } from "@/lib/validation/reports";
import { prisma, type DbClient } from "@/server/db/prisma";
import { authorize, type Actor } from "@/server/rbac/authorize";

import {
  branchIn,
  dateToIso,
  isoToDate,
  monthPeriod,
  num,
  pct,
  reportBranch,
  round1,
} from "./shared";

/* "Markaz Faoliyati Statistikasi" (EXP §10 statistics): room and seat utilisation (A-94). */

export interface StatisticsRowDto {
  roomId: string;
  roomName: string;
  capacity: number;
  /** Room working hours in the period (org work hours × working days). */
  roomHours: number;
  groupId: string | null;
  groupName: string | null;
  students: number;
  freeSeats: number;
  lessonHours: number;
  coursePrice: number | null;
  totalSum: number;
  /** Room hours not used by any lesson (room subtotal rows only). */
  freeHours: number | null;
  seatHours: number;
  actualSeatHours: number;
  planSeatHours: number;
  fik: number;
  isRoomTotal: boolean;
}

export interface StatisticsReportDto {
  view: StatisticsView;
  from: string;
  to: string;
  year: number;
  month: number;
  workHours: { start: string; end: string };
  kpis: {
    utilisation: number;
    freeHours: number;
    students: number;
    potentialRevenue: number;
    freeSeats: number;
    possibleStudents: number;
  };
  rows: StatisticsRowDto[];
}

const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const hoursBetween = (start: string, end: string) =>
  Math.max(0, (minutes(end) - minutes(start)) / 60);

function bounds(filters: StatisticsFilters): {
  view: StatisticsView;
  from: string;
  to: string;
  year: number;
  month: number;
} {
  const view = filters.view ?? "monthly";
  const period = monthPeriod(filters.year, filters.month);
  if (view === "monthly")
    return {
      view,
      from: dateToIso(period.from),
      to: dateToIso(period.to),
      year: period.year,
      month: period.month,
    };
  const anchor = filters.date ? isoToDate(filters.date) : new Date(Date.now() + 5 * 60 * 60 * 1000);
  const day = dateToIso(anchor);
  if (view === "daily")
    return {
      view,
      from: day,
      to: day,
      year: anchor.getUTCFullYear(),
      month: anchor.getUTCMonth() + 1,
    };
  const weekday = anchor.getUTCDay() === 0 ? 7 : anchor.getUTCDay();
  const monday = new Date(anchor.getTime() - (weekday - 1) * 86_400_000);
  const sunday = new Date(monday.getTime() + 6 * 86_400_000);
  return {
    view,
    from: dateToIso(monday),
    to: dateToIso(sunday),
    year: anchor.getUTCFullYear(),
    month: anchor.getUTCMonth() + 1,
  };
}

export async function getCenterStatistics(
  actor: Actor,
  filters: StatisticsFilters,
  db: DbClient = prisma,
): Promise<StatisticsReportDto> {
  authorize(actor, "reports.view");
  const scope = reportBranch(actor, filters.branchId);
  const { view, from, to, year, month } = bounds(filters);
  const fromDate = isoToDate(from);
  const toDate = isoToDate(to);
  const [settings, rooms, daysOff] = await Promise.all([
    db.orgSettings.findFirst({ select: { workStart: true, workEnd: true } }),
    db.room.findMany({
      where: branchIn(scope),
      select: {
        id: true,
        name: true,
        capacity: true,
        branchId: true,
        slots: {
          where: { group: { status: { not: "ARCHIVED" } } },
          select: {
            weekday: true,
            group: {
              select: {
                id: true,
                name: true,
                course: { select: { price: true } },
                lessons: {
                  where: { date: { gte: fromDate, lte: toDate } },
                  select: { date: true, startTime: true, endTime: true },
                },
                memberships: {
                  where: { status: { notIn: ["ARCHIVED", "GRADUATED"] } },
                  select: { studentId: true },
                },
              },
            },
          },
        },
      },
      orderBy: { name: "asc" },
    }),
    db.dayOff.findMany({
      where: { ...branchIn(scope), date: { gte: fromDate, lte: toDate } },
      select: { branchId: true, date: true },
    }),
  ]);
  const workStart = settings?.workStart ?? "08:00";
  const workEnd = settings?.workEnd ?? "20:00";
  const dayHours = hoursBetween(workStart, workEnd);
  const offByBranch = new Map<string, Set<string>>();
  for (const d of daysOff) {
    const set = offByBranch.get(d.branchId) ?? new Set<string>();
    set.add(dateToIso(d.date));
    offByBranch.set(d.branchId, set);
  }
  const workingDays = (branchId: string) => {
    let n = 0;
    for (let d = fromDate; d <= toDate; d = new Date(d.getTime() + 86_400_000)) {
      if (d.getUTCDay() === 0) continue; // Sunday
      if (offByBranch.get(branchId)?.has(dateToIso(d))) continue;
      n += 1;
    }
    return n;
  };

  const rows: StatisticsRowDto[] = [];
  const students = new Set<string>();
  let totalActual = 0;
  let totalPlan = 0;
  let totalFreeHours = 0;
  let totalFreeSeats = 0;
  let potentialRevenue = 0;
  const groupHours: number[] = [];
  let capacitySum = 0;

  for (const room of rooms) {
    const roomHours = round1(dayHours * workingDays(room.branchId));
    const planSeatHours = round1(room.capacity * roomHours);
    capacitySum += room.capacity;
    // One row per group using the room; a group's lessons count here when their weekday's slot is in this room.
    const byGroup = new Map<
      string,
      {
        name: string;
        weekdays: Set<number>;
        price: number;
        lessons: (typeof room.slots)[number]["group"]["lessons"];
        students: Set<string>;
      }
    >();
    for (const slot of room.slots) {
      const g = slot.group;
      let entry = byGroup.get(g.id);
      if (!entry) {
        entry = {
          name: g.name,
          weekdays: new Set(),
          price: num(g.course.price),
          lessons: g.lessons,
          students: new Set(g.memberships.map((m) => m.studentId)),
        };
        byGroup.set(g.id, entry);
      }
      entry.weekdays.add(slot.weekday);
    }
    let usedHours = 0;
    let roomActual = 0;
    let roomStudents = 0;
    let roomFreeSeats = 0;
    let roomSum = 0;
    const groupRows: StatisticsRowDto[] = [];
    for (const [groupId, g] of byGroup) {
      const lessonHours = round1(
        g.lessons
          .filter((l) => g.weekdays.has(l.date.getUTCDay() === 0 ? 7 : l.date.getUTCDay()))
          .reduce((s, l) => s + hoursBetween(l.startTime, l.endTime), 0),
      );
      const count = g.students.size;
      for (const s of g.students) students.add(s);
      const freeSeats = Math.max(0, room.capacity - count);
      const seatHours = round1(room.capacity * lessonHours);
      const actual = round1(count * lessonHours);
      usedHours += lessonHours;
      roomActual += actual;
      roomStudents += count;
      roomFreeSeats += freeSeats;
      roomSum += count * g.price;
      potentialRevenue += freeSeats * g.price;
      if (lessonHours > 0) groupHours.push(lessonHours);
      groupRows.push({
        roomId: room.id,
        roomName: room.name,
        capacity: room.capacity,
        roomHours,
        groupId,
        groupName: g.name,
        students: count,
        freeSeats,
        lessonHours,
        coursePrice: g.price,
        totalSum: count * g.price,
        freeHours: null,
        seatHours,
        actualSeatHours: actual,
        planSeatHours,
        fik: pct(actual, seatHours),
        isRoomTotal: false,
      });
    }
    const freeHours = round1(Math.max(0, roomHours - usedHours));
    totalActual += roomActual;
    totalPlan += planSeatHours;
    totalFreeHours += freeHours;
    totalFreeSeats += roomFreeSeats;
    rows.push(...groupRows, {
      roomId: room.id,
      roomName: room.name,
      capacity: room.capacity,
      roomHours,
      groupId: null,
      groupName: null,
      students: roomStudents,
      freeSeats: roomFreeSeats,
      lessonHours: round1(usedHours),
      coursePrice: null,
      totalSum: roomSum,
      freeHours,
      seatHours: round1(room.capacity * usedHours),
      actualSeatHours: round1(roomActual),
      planSeatHours,
      fik: pct(roomActual, planSeatHours),
      isRoomTotal: true,
    });
  }
  // Free time could host more groups: free hours ÷ a typical group's hours, each with an average room's seats.
  const avgGroupHours = groupHours.length
    ? groupHours.reduce((s, x) => s + x, 0) / groupHours.length
    : 0;
  const avgCapacity = rooms.length ? capacitySum / rooms.length : 0;
  const extraGroups = avgGroupHours > 0 ? Math.floor(totalFreeHours / avgGroupHours) : 0;

  return {
    view,
    from,
    to,
    year,
    month,
    workHours: { start: workStart, end: workEnd },
    kpis: {
      utilisation: pct(totalActual, totalPlan),
      freeHours: round1(totalFreeHours),
      students: students.size,
      potentialRevenue,
      freeSeats: totalFreeSeats,
      possibleStudents: totalFreeSeats + Math.round(extraGroups * avgCapacity),
    },
    rows,
  };
}
