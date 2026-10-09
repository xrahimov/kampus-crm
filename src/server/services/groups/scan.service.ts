import type { AttendanceScanInput } from "@/lib/validation/groups";
import { prisma, type DbClient } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";
import { authorize, type Actor } from "@/server/rbac/authorize";
import { markAttendance } from "@/server/services/groups/lessons.service";
import { groupScope } from "@/server/services/groups/shared";
import { isoToDate } from "@/server/services/settings/shared";
import { nowInTashkent } from "@/server/services/today/today.service";

/*
 * Attendance by QR (round 2 B8, A-139): the badge's QR (`kampus:student:<id>`,
 * A-65) is scanned with a phone camera or a hand scanner at the door and the
 * student is marked present, either on the lesson the teacher opened or on
 * the student's lesson of the day nearest to now.
 */

export type ScanStatus =
  /** Marked present just now. */
  | "marked"
  /** Was already present. */
  | "already"
  /** A valid badge, but the student has no lesson today (or not in this lesson's group). */
  | "noLesson"
  /** Not a Kampus badge, or a student the user may not see. */
  | "unknown";

export interface ScanResultDto {
  status: ScanStatus;
  studentId: string | null;
  studentName: string | null;
  groupName: string | null;
  /** "HH:mm–HH:mm" of the lesson marked. */
  lessonTime: string | null;
  lessonId: string | null;
}

const PREFIX = "kampus:student:";
const CURRENT = ["NEW", "TRIAL", "ACTIVE"] as const;

/** The student id inside a badge code; null for anything else. */
export function parseBadgeCode(code: string): string | null {
  const trimmed = code.trim();
  if (!trimmed.startsWith(PREFIX)) return null;
  const id = trimmed.slice(PREFIX.length);
  return /^[A-Za-z0-9_-]{1,64}$/.test(id) ? id : null;
}

const miss: ScanResultDto = {
  status: "unknown",
  studentId: null,
  studentName: null,
  groupName: null,
  lessonTime: null,
  lessonId: null,
};

/** Minutes from midnight of "HH:mm". */
const minutes = (hhmm: string) => {
  const [h, m] = hhmm.split(":").map(Number);
  return (h ?? 0) * 60 + (m ?? 0);
};

export async function scanAttendance(
  actor: Actor,
  input: AttendanceScanInput,
  db: DbClient = prisma,
): Promise<ScanResultDto> {
  authorize(actor, "groups.attendance.mark");
  const studentId = parseBadgeCode(input.code);
  if (!studentId) return miss;
  const student = await db.student.findUnique({
    where: { id: studentId },
    select: { id: true, fullName: true, branchId: true, isArchived: true },
  });
  if (!student || student.isArchived || !actor.branchIds.includes(student.branchId)) return miss;
  const found: ScanResultDto = { ...miss, studentId: student.id, studentName: student.fullName };

  const now = nowInTashkent();
  // The student's lessons of the day in groups the user may mark, with their membership.
  const lessons = await db.lesson.findMany({
    where: {
      ...(input.lessonId ? { id: input.lessonId } : { date: isoToDate(now.date) }),
      group: {
        ...groupScope(actor),
        status: { in: ["ACTIVE", "FROZEN"] },
        memberships: { some: { studentId, status: { in: [...CURRENT] } } },
      },
    },
    select: {
      id: true,
      startTime: true,
      endTime: true,
      groupId: true,
      group: {
        select: {
          name: true,
          memberships: {
            where: { studentId, status: { in: [...CURRENT] } },
            select: { id: true },
            take: 1,
          },
        },
      },
    },
    orderBy: { startTime: "asc" },
  });
  if (input.lessonId && lessons.length === 0) {
    // Make sure the lesson itself exists and is the user's to mark; a wrong id is an error, not "no lesson".
    const lesson = await db.lesson.findUnique({
      where: { id: input.lessonId },
      select: { group: { select: { branchId: true } } },
    });
    if (!lesson) throw AppError.notFound();
    if (!actor.branchIds.includes(lesson.group.branchId)) {
      throw AppError.forbidden("errors.branchForbidden");
    }
  }
  if (lessons.length === 0) return { ...found, status: "noLesson" };

  // The lesson under way, else the next one of the day, else the last one that ended.
  const t = minutes(now.time);
  const pick =
    lessons.find((l) => minutes(l.startTime) - 30 <= t && t <= minutes(l.endTime) + 30) ??
    lessons.find((l) => minutes(l.startTime) > t) ??
    lessons[lessons.length - 1]!;
  const membershipId = pick.group.memberships[0]!.id;
  const result: ScanResultDto = {
    ...found,
    groupName: pick.group.name,
    lessonTime: `${pick.startTime}–${pick.endTime}`,
    lessonId: pick.id,
  };
  const existing = await db.attendance.findFirst({
    where: { lessonId: pick.id, membershipId },
    select: { status: true },
  });
  if (existing?.status === "PRESENT") return { ...result, status: "already" };
  await markAttendance(actor, pick.id, [{ membershipId, status: "PRESENT" }], db);
  return { ...result, status: "marked" };
}
