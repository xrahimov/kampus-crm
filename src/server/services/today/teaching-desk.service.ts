import type { Prisma } from "@/generated/prisma/client";
import type { AttendanceStatus, MembershipStatus } from "@/lib/validation/groups";
import { prisma, type DbClient } from "@/server/db/prisma";
import { authorize, can, type Actor } from "@/server/rbac/authorize";
import { groupScope } from "@/server/services/groups/shared";
import { listCheckingQueue } from "@/server/services/homework/checking-queue.service";
import { dateToIso, isoToDate } from "@/server/services/settings/shared";
import { getGroupVideo, type GroupVideoDto } from "@/server/services/video/video.service";

import { nowInTashkent } from "./today.service";

/*
 * The teacher's desk (A-194): what the teaching view puts on top of Today.
 * The lesson under way or the next one with its video call, the lessons after
 * it, the homework answers waiting, and the teacher's own students with their
 * last few lessons. Everything is read through `groupScope`, so a teacher gets
 * the groups they teach and nothing of anyone else's.
 */

const ATTENDING: MembershipStatus[] = ["NEW", "TRIAL", "ACTIVE"];
const COMING_UP = 5;
const COMING_UP_DAYS = 14;
const STUDENTS_SHOWN = 8;
const MARKS_SHOWN = 5;
const CHECKING_SHOWN = 3;
const NAMES_SHOWN = 6;

export interface DeskLessonDto {
  id: string;
  groupId: string;
  groupName: string;
  courseName: string;
  color: string | null;
  date: string;
  startTime: string;
  endTime: string;
}

export interface DeskFocusDto extends DeskLessonDto {
  /** The clock is between the lesson's start and end. */
  underWay: boolean;
  /** The first few students of the group, and how many there are in all. */
  studentNames: string[];
  studentCount: number;
  video: GroupVideoDto;
}

export interface DeskStudentDto {
  membershipId: string;
  studentId: string;
  fullName: string;
  groupId: string;
  groupName: string;
  /** The last lessons that were marked, oldest first. */
  marks: AttendanceStatus[];
}

export interface DeskCheckingDto {
  total: number;
  items: Array<{
    key: string;
    studentId: string;
    fullName: string;
    groupName: string;
    /** The assignment's title, else the lesson's topic. */
    what: string | null;
    lessonDate: string | null;
  }>;
}

export interface TeachingDeskDto {
  /** The moment the server answered, so the countdown starts from the same clock. */
  now: string;
  today: string;
  /** How many running groups the person has; 0 explains an empty desk. */
  groupCount: number;
  focus: DeskFocusDto | null;
  comingUp: DeskLessonDto[];
  /** Null for someone who may not check homework. */
  checking: DeskCheckingDto | null;
  students: DeskStudentDto[];
  studentCount: number;
  /** May start a call and see the students' links. */
  canHost: boolean;
  canSms: boolean;
}

const lessonSelect = {
  id: true,
  groupId: true,
  date: true,
  startTime: true,
  endTime: true,
  group: { select: { name: true, course: { select: { name: true, color: true } } } },
} satisfies Prisma.LessonSelect;
type LessonRow = Prisma.LessonGetPayload<{ select: typeof lessonSelect }>;

const toLesson = (l: LessonRow): DeskLessonDto => ({
  id: l.id,
  groupId: l.groupId,
  groupName: l.group.name,
  courseName: l.group.course.name,
  color: l.group.course.color,
  date: dateToIso(l.date),
  startTime: l.startTime,
  endTime: l.endTime,
});

function shiftIso(iso: string, days: number): string {
  const d = isoToDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return dateToIso(d);
}

export async function getTeachingDesk(
  actor: Actor,
  db: DbClient = prisma,
  at: Date = new Date(),
): Promise<TeachingDeskDto> {
  authorize(actor, "groups.view");
  const now = nowInTashkent(at);
  const group: Prisma.GroupWhereInput = {
    ...groupScope(actor),
    status: { in: ["ACTIVE", "FROZEN"] },
  };
  const canHost = can(actor, "groups.attendance.mark");
  const member: Prisma.GroupMembershipWhereInput = {
    group,
    status: { in: ATTENDING },
    student: { isArchived: false },
  };

  const [groupCount, upcoming, checking, studentRows, studentCount] = await Promise.all([
    db.group.count({ where: group }),
    // The lesson under way has not ended yet, so "ends after now" finds it first.
    db.lesson.findMany({
      where: {
        group,
        OR: [
          { date: isoToDate(now.date), endTime: { gt: now.time } },
          { date: { gt: isoToDate(now.date), lte: isoToDate(shiftIso(now.date, COMING_UP_DAYS)) } },
        ],
      },
      select: lessonSelect,
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
      take: COMING_UP + 1,
    }),
    canHost ? listCheckingQueue(actor, db) : null,
    db.groupMembership.findMany({
      where: member,
      select: {
        id: true,
        studentId: true,
        groupId: true,
        student: { select: { fullName: true } },
        group: { select: { name: true } },
      },
      orderBy: [{ student: { fullName: "asc" } }, { id: "asc" }],
      take: STUDENTS_SHOWN,
    }),
    db.groupMembership.count({ where: member }),
  ]);

  const first = upcoming[0];
  let focus: DeskFocusDto | null = null;
  if (first) {
    const [video, names, count] = await Promise.all([
      getGroupVideo(actor, first.groupId, db),
      db.groupMembership.findMany({
        where: { ...member, groupId: first.groupId },
        select: { student: { select: { fullName: true } } },
        orderBy: { student: { fullName: "asc" } },
        take: NAMES_SHOWN,
      }),
      db.groupMembership.count({ where: { ...member, groupId: first.groupId } }),
    ]);
    const date = dateToIso(first.date);
    focus = {
      ...toLesson(first),
      underWay: date === now.date && first.startTime <= now.time,
      studentNames: names.map((n) => n.student.fullName),
      studentCount: count,
      video,
    };
  }

  // The last marked lessons of the students shown, newest first from the database.
  const marks = new Map<string, AttendanceStatus[]>();
  if (studentRows.length > 0) {
    const rows = await db.attendance.findMany({
      where: {
        membershipId: { in: studentRows.map((s) => s.id) },
        status: { not: "NOT_MARKED" },
        lesson: { date: { lte: isoToDate(now.date) } },
      },
      select: { membershipId: true, status: true },
      orderBy: [{ lesson: { date: "desc" } }, { lesson: { startTime: "desc" } }],
      take: studentRows.length * 40,
    });
    for (const r of rows) {
      const list = marks.get(r.membershipId) ?? [];
      if (list.length < MARKS_SHOWN) list.push(r.status);
      marks.set(r.membershipId, list);
    }
  }

  return {
    now: at.toISOString(),
    today: now.date,
    groupCount,
    focus,
    comingUp: upcoming.slice(1, COMING_UP + 1).map(toLesson),
    checking: checking
      ? {
          total: checking.total,
          items: checking.items.slice(0, CHECKING_SHOWN).map((i) => ({
            key: `${i.homeworkId}:${i.membershipId}`,
            studentId: i.studentId,
            fullName: i.fullName,
            groupName: i.groupName,
            what: i.title ?? i.lessonTopic,
            lessonDate: i.lessonDate,
          })),
        }
      : null,
    students: studentRows.map((s) => ({
      membershipId: s.id,
      studentId: s.studentId,
      fullName: s.student.fullName,
      groupId: s.groupId,
      groupName: s.group.name,
      marks: (marks.get(s.id) ?? []).reverse(),
    })),
    studentCount,
    canHost,
    canSms: can(actor, "sms.send"),
  };
}
