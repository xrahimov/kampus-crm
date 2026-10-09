import type { Prisma } from "@/generated/prisma/client";
import type { AttendanceStatus, MembershipStatus } from "@/lib/validation/groups";
import { prisma, type DbClient } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";
import { authorize, can, type Actor } from "@/server/rbac/authorize";
import { groupScope } from "@/server/services/groups/shared";
import { dateToIso, isoToDate } from "@/server/services/settings/shared";
import { membershipBalances } from "@/server/services/students/balances";

/*
 * The teacher's day (A-113): the lessons of one day across the groups the user
 * may see (a teacher: their own groups; the office: the branch), each with its
 * roster for one-tap attendance and its homework, plus the next lesson after
 * now and the debtors of those groups. Built for a phone screen.
 */

/** Students who are expected in the room; frozen members are not. */
const ATTENDING: MembershipStatus[] = ["NEW", "TRIAL", "ACTIVE"];
/** Members whose balance the debtor card follows (a frozen student still owes). */
const OWING: MembershipStatus[] = ["NEW", "TRIAL", "ACTIVE", "FROZEN"];
const TASHKENT_OFFSET_MS = 5 * 60 * 60 * 1000;
const DEBTORS_SHOWN = 30;

/** The calendar day and wall-clock time in Tashkent (UTC+5). */
export function nowInTashkent(now = new Date()): { date: string; time: string } {
  const local = new Date(now.getTime() + TASHKENT_OFFSET_MS);
  return { date: local.toISOString().slice(0, 10), time: local.toISOString().slice(11, 16) };
}

export interface TodayMemberDto {
  membershipId: string;
  studentId: string;
  fullName: string;
  status: MembershipStatus;
  attendance: AttendanceStatus;
  /** Positive = credit, negative = debt, as on the group page. */
  balance: number | null;
}

export interface TodayHomeworkDto {
  id: string;
  text: string;
  dueDate: string | null;
  submitted: number;
  toCheck: number;
}

export interface TodayLessonDto {
  id: string;
  groupId: string;
  groupName: string;
  courseName: string;
  color: string | null;
  date: string;
  startTime: string;
  endTime: string;
  roomName: string | null;
  topic: string | null;
  isExtra: boolean;
  teacherNames: string[];
  members: TodayMemberDto[];
  present: number;
  marked: number;
  homework: TodayHomeworkDto | null;
}

export interface NextLessonDto {
  id: string;
  groupId: string;
  groupName: string;
  date: string;
  startTime: string;
  endTime: string;
  roomName: string | null;
}

export interface TodayDebtorDto {
  studentId: string;
  fullName: string;
  groupId: string;
  groupName: string;
  amount: number;
}

export interface TodayDto {
  date: string;
  /** The day the server considers today, so the client can offer "back to today". */
  today: string;
  lessons: TodayLessonDto[];
  next: NextLessonDto | null;
  debtors: TodayDebtorDto[];
  debtorCount: number;
  debtTotal: number;
  canMark: boolean;
  canSeeBalances: boolean;
}

const lessonInclude = {
  group: {
    select: {
      id: true,
      name: true,
      course: { select: { name: true, color: true } },
      slots: { select: { weekday: true, startTime: true, room: { select: { name: true } } } },
      teachers: { select: { user: { select: { fullName: true } } }, orderBy: { since: "asc" } },
    },
  },
  attendances: { select: { membershipId: true, status: true } },
  homework: {
    select: {
      id: true,
      text: true,
      dueDate: true,
      submissions: { select: { status: true } },
    },
  },
} satisfies Prisma.LessonInclude;
type LessonRow = Prisma.LessonGetPayload<{ include: typeof lessonInclude }>;

/** Monday = 1 … Sunday = 7 of a calendar day. */
function weekdayOf(dateIso: string): number {
  const d = isoToDate(dateIso).getUTCDay();
  return d === 0 ? 7 : d;
}

function roomOf(row: { group: LessonRow["group"] }, dateIso: string, startTime: string) {
  const weekday = weekdayOf(dateIso);
  const slot =
    row.group.slots.find((s) => s.weekday === weekday && s.startTime === startTime) ??
    row.group.slots.find((s) => s.weekday === weekday);
  return slot?.room?.name ?? null;
}

function groupsWhere(actor: Actor): Prisma.GroupWhereInput {
  return { ...groupScope(actor), status: { in: ["ACTIVE", "FROZEN"] } };
}

/** The day's lessons with rosters, the next lesson and the debtors of the user's groups. */
export async function getToday(
  actor: Actor,
  dateIso?: string,
  db: DbClient = prisma,
): Promise<TodayDto> {
  authorize(actor, "groups.view");
  const now = nowInTashkent();
  const date = dateIso ?? now.date;
  const parsed = isoToDate(date);
  if (Number.isNaN(parsed.getTime()) || dateToIso(parsed) !== date) {
    throw AppError.validation({ date: ["validation.date"] });
  }
  const group = groupsWhere(actor);
  const canMark = can(actor, "groups.attendance.mark");
  const canSeeBalances = can(actor, "students.view");

  const [lessons, nextRow, memberships] = await Promise.all([
    db.lesson.findMany({
      where: { date: isoToDate(date), group },
      include: lessonInclude,
      orderBy: [{ startTime: "asc" }, { group: { name: "asc" } }],
    }),
    db.lesson.findFirst({
      where: {
        group,
        OR: [
          { date: { gt: isoToDate(now.date) } },
          { date: isoToDate(now.date), startTime: { gt: now.time } },
        ],
      },
      include: lessonInclude,
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
    }),
    db.groupMembership.findMany({
      where: { group, status: { in: OWING } },
      select: {
        id: true,
        groupId: true,
        studentId: true,
        status: true,
        student: { select: { fullName: true, isArchived: true } },
        group: { select: { name: true } },
      },
      orderBy: { student: { fullName: "asc" } },
    }),
  ]);

  const live = memberships.filter((m) => !m.student.isArchived);
  const balances = canSeeBalances
    ? await membershipBalances(
        db,
        live.map((m) => m.id),
      )
    : new Map();
  const byGroup = new Map<string, typeof live>();
  for (const m of live) {
    const list = byGroup.get(m.groupId) ?? [];
    list.push(m);
    byGroup.set(m.groupId, list);
  }

  const lessonDtos: TodayLessonDto[] = lessons.map((l) => {
    const marks = new Map(l.attendances.map((a) => [a.membershipId, a.status]));
    const members: TodayMemberDto[] = (byGroup.get(l.groupId) ?? [])
      .filter((m) => (ATTENDING as string[]).includes(m.status))
      .map((m) => ({
        membershipId: m.id,
        studentId: m.studentId,
        fullName: m.student.fullName,
        status: m.status,
        attendance: marks.get(m.id) ?? "NOT_MARKED",
        balance: canSeeBalances ? (balances.get(m.id)?.balance ?? null) : null,
      }));
    const homework = l.homework
      ? {
          id: l.homework.id,
          text: l.homework.text,
          dueDate: l.homework.dueDate ? dateToIso(l.homework.dueDate) : null,
          submitted: l.homework.submissions.length,
          toCheck: l.homework.submissions.filter((s) => s.status === "SUBMITTED").length,
        }
      : null;
    return {
      id: l.id,
      groupId: l.groupId,
      groupName: l.group.name,
      courseName: l.group.course.name,
      color: l.group.course.color,
      date: dateToIso(l.date),
      startTime: l.startTime,
      endTime: l.endTime,
      roomName: roomOf(l, date, l.startTime),
      topic: l.topic,
      isExtra: l.isExtra,
      teacherNames: l.group.teachers.map((t) => t.user.fullName),
      members,
      present: members.filter((m) => m.attendance === "PRESENT").length,
      marked: members.filter((m) => m.attendance !== "NOT_MARKED").length,
      homework,
    };
  });

  // Debtors across the user's groups: one line per student and group, largest first.
  const debtors: TodayDebtorDto[] = [];
  let debtTotal = 0;
  if (canSeeBalances) {
    for (const m of live) {
      const balance = balances.get(m.id)?.balance ?? 0;
      if (balance >= -0.005) continue;
      debtors.push({
        studentId: m.studentId,
        fullName: m.student.fullName,
        groupId: m.groupId,
        groupName: m.group.name,
        amount: Math.round(-balance * 100) / 100,
      });
      debtTotal += -balance;
    }
    debtors.sort((a, b) => b.amount - a.amount);
  }

  return {
    date,
    today: now.date,
    lessons: lessonDtos,
    next: nextRow
      ? {
          id: nextRow.id,
          groupId: nextRow.groupId,
          groupName: nextRow.group.name,
          date: dateToIso(nextRow.date),
          startTime: nextRow.startTime,
          endTime: nextRow.endTime,
          roomName: roomOf(nextRow, dateToIso(nextRow.date), nextRow.startTime),
        }
      : null,
    debtors: debtors.slice(0, DEBTORS_SHOWN),
    debtorCount: debtors.length,
    debtTotal: Math.round(debtTotal * 100) / 100,
    canMark,
    canSeeBalances,
  };
}
