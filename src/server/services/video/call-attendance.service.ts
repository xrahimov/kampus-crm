import type { AttendanceStatus } from "@/generated/prisma/client";
import { prisma, type DbClient } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";
import { authorize, type Actor } from "@/server/rbac/authorize";
import { findGroupInScope } from "@/server/services/groups/shared";
import { markAttendance } from "@/server/services/groups/lessons.service";
import { dateToIso } from "@/server/services/settings/shared";
import { loadVideoConfig } from "@/server/services/video/video.service";

/*
 * Attendance from a video lesson (online-lessons item B1, A-151): who was in
 * the call and for how long is known, so Kampus proposes the marks: present
 * when online at least `attendanceMinutes` (Settings → Integrations → Video
 * lessons, default 10), absent otherwise, with a note when someone joined late.
 * The teacher looks at the list, changes what is wrong and applies it; marks
 * already set by hand are left alone unless the teacher picks them again.
 */

const MEMBERS = ["NEW", "TRIAL", "ACTIVE"] as const;

export interface CallAttendanceRowDto {
  membershipId: string;
  studentId: string;
  fullName: string;
  /** Minutes online in this call, summed over reconnects. */
  minutes: number;
  /** Minutes after the lesson's start (or the call's, without a lesson) of the first join. */
  lateMinutes: number | null;
  suggested: Exclude<AttendanceStatus, "NOT_MARKED" | "EXCUSED">;
  /** The mark the lesson already has, if any. */
  current: AttendanceStatus | null;
}

export interface CallAttendanceDto {
  roomId: string;
  lessonId: string | null;
  lessonDate: string | null;
  lessonStart: string | null;
  thresholdMinutes: number;
  rows: CallAttendanceRowDto[];
}

/** "18:30" on a lesson's date as a UTC instant in Tashkent time (UTC+5, no DST). */
function lessonStartInstant(date: Date, time: string): Date {
  const [h, m] = time.split(":").map(Number);
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), h! - 5, m!),
  );
}

async function roomInScope(db: DbClient, actor: Actor, roomId: string) {
  const room = await db.videoRoom.findUnique({
    where: { id: roomId },
    include: {
      lesson: { select: { id: true, date: true, startTime: true } },
      participants: {
        where: { role: "STUDENT", studentId: { not: null } },
        select: { studentId: true, joinedAt: true, leftAt: true, lastSeenAt: true },
      },
    },
  });
  if (!room) throw AppError.notFound();
  await findGroupInScope(db, actor, room.groupId, {});
  return room;
}

export async function getCallAttendance(
  actor: Actor,
  roomId: string,
  db: DbClient = prisma,
): Promise<CallAttendanceDto> {
  authorize(actor, "groups.attendance.mark");
  const room = await roomInScope(db, actor, roomId);
  const config = await loadVideoConfig(db, actor.organizationId);
  const threshold = config.attendanceMinutes;
  const members = await db.groupMembership.findMany({
    where: { groupId: room.groupId, status: { in: [...MEMBERS] }, student: { isArchived: false } },
    orderBy: { student: { fullName: "asc" } },
    select: { id: true, studentId: true, student: { select: { fullName: true } } },
  });
  const marks = room.lesson
    ? await db.attendance.findMany({
        where: { lessonId: room.lesson.id },
        select: { membershipId: true, status: true },
      })
    : [];
  const markOf = new Map(marks.map((m) => [m.membershipId, m.status]));
  const start = room.lesson
    ? lessonStartInstant(room.lesson.date, room.lesson.startTime)
    : room.startedAt;
  const now = Date.now();
  const rows = members.map((m) => {
    const sessions = room.participants.filter((p) => p.studentId === m.studentId);
    const ms = sessions.reduce((sum, p) => {
      const end = (p.leftAt ?? (room.status === "LIVE" ? new Date(now) : p.lastSeenAt)).getTime();
      return sum + Math.max(0, end - p.joinedAt.getTime());
    }, 0);
    const first = sessions.reduce<Date | null>(
      (min, p) => (!min || p.joinedAt < min ? p.joinedAt : min),
      null,
    );
    const minutes = Math.round(ms / 60_000);
    const lateMinutes = first
      ? Math.max(0, Math.round((first.getTime() - start.getTime()) / 60_000))
      : null;
    const current = markOf.get(m.id);
    return {
      membershipId: m.id,
      studentId: m.studentId,
      fullName: m.student.fullName,
      minutes,
      lateMinutes,
      suggested: minutes >= threshold ? ("PRESENT" as const) : ("ABSENT" as const),
      current: current && current !== "NOT_MARKED" ? current : null,
    };
  });
  return {
    roomId: room.id,
    lessonId: room.lesson?.id ?? null,
    lessonDate: room.lesson ? dateToIso(room.lesson.date) : null,
    lessonStart: room.lesson?.startTime ?? null,
    thresholdMinutes: threshold,
    rows,
  };
}

/**
 * Writes the marks the teacher confirmed onto the call's lesson, through the
 * normal attendance path (coins, auto-SMS, audit, "only during the lesson").
 * A late join is kept as the mark's note.
 */
export async function applyCallAttendance(
  actor: Actor,
  roomId: string,
  marks: Array<{ membershipId: string; status: "PRESENT" | "ABSENT" | "EXCUSED" }>,
  db: DbClient = prisma,
): Promise<void> {
  authorize(actor, "groups.attendance.mark");
  const proposal = await getCallAttendance(actor, roomId, db);
  if (!proposal.lessonId) throw AppError.conflict("errors.callWithoutLesson");
  const rowOf = new Map(proposal.rows.map((r) => [r.membershipId, r]));
  const late = proposal.thresholdMinutes;
  const final = marks
    .filter((m) => rowOf.has(m.membershipId))
    .map((m) => {
      const row = rowOf.get(m.membershipId)!;
      const comment =
        m.status === "PRESENT" && row.lateMinutes !== null && row.lateMinutes > late
          ? `+${row.lateMinutes} min`
          : null;
      return { membershipId: m.membershipId, status: m.status, comment };
    });
  if (final.length === 0) return;
  await markAttendance(actor, proposal.lessonId, final, db);
}
