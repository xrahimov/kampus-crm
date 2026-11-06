import { prisma, type DbClient } from "@/server/db/prisma";
import type { Actor } from "@/server/rbac/authorize";
import { markAttendance } from "@/server/services/groups/lessons.service";
import { notifyStaff } from "@/server/services/integrations/bot-recipients.service";
import { dateToIso } from "@/server/services/settings/shared";
import { notifyStudents } from "@/server/services/telegram/student-telegram.service";
import { loadVideoConfig } from "@/server/services/video/video.service";

/*
 * No-show in a 1:1 call (online-lessons item D3, A-167). The teacher's browser
 * syncs every second or so; when the room belongs to a lesson of a group with
 * exactly one current student, nobody but staff has ever joined, and the
 * teacher has waited `noShowMinutes` (Settings → Integrations → Video lessons)
 * since the later of the call's start and the lesson's start, the student is
 * marked absent through the usual attendance path (as the teacher who opened
 * the room, so coins, auto-SMS and the audit log behave as for a hand mark),
 * the student and their parents are told on Telegram, the branch's staff feed
 * gets a line, and the teacher sees a banner in the room. It happens once per
 * room; a student who turns up later is handled by attendance from the call.
 */

const CURRENT = ["NEW", "TRIAL", "ACTIVE"] as const;
/** Checks are cheap but not free: none before the call is this old. */
const MIN_ROOM_AGE_MS = 60_000;

export interface NoShowRoom {
  id: string;
  groupId: string;
  lessonId: string | null;
  startedById: string;
  startedAt: Date;
  noShowAt: Date | null;
}

/** "18:30" on a lesson's date as an instant in Tashkent time (UTC+5). */
function lessonStartInstant(date: Date, time: string): Date {
  const [h, m] = time.split(":").map(Number);
  return new Date(
    Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate(), h! - 5, m!),
  );
}

/**
 * Runs the rule for a LIVE room and returns when the no-show was recorded, or
 * null while the student may still come.
 */
export async function checkNoShow(
  db: DbClient,
  room: NoShowRoom,
  now: Date = new Date(),
): Promise<Date | null> {
  if (room.noShowAt) return room.noShowAt;
  if (!room.lessonId || now.getTime() - room.startedAt.getTime() < MIN_ROOM_AGE_MS) return null;

  const lesson = await db.lesson.findUnique({
    where: { id: room.lessonId },
    select: {
      id: true,
      date: true,
      startTime: true,
      group: {
        select: {
          id: true,
          name: true,
          branchId: true,
          branch: { select: { organizationId: true } },
          memberships: {
            where: { status: { in: [...CURRENT] }, student: { isArchived: false } },
            select: { id: true, studentId: true, student: { select: { fullName: true } } },
          },
        },
      },
    },
  });
  if (!lesson || lesson.group.memberships.length !== 1) return null;
  const config = await loadVideoConfig(db, lesson.group.branch.organizationId);
  if (config.noShowMinutes === 0) return null;
  const since = Math.max(
    room.startedAt.getTime(),
    lessonStartInstant(lesson.date, lesson.startTime).getTime(),
  );
  if (now.getTime() - since < config.noShowMinutes * 60_000) return null;

  const [member] = lesson.group.memberships;
  const joined = await db.videoParticipant.count({ where: { roomId: room.id, role: "STUDENT" } });
  if (joined > 0) return null;

  // Serialised per room: two syncs at once record it once.
  const claimed = await db.videoRoom.updateMany({
    where: { id: room.id, noShowAt: null, status: "LIVE" },
    data: { noShowAt: now },
  });
  if (claimed.count === 0) return now;

  const teacher = await db.user.findUniqueOrThrow({
    where: { id: room.startedById },
    select: { id: true, fullName: true },
  });
  // The teacher who opened the room marks; branch scope only, so no role rules apply.
  const actor: Actor = {
    userId: teacher.id,
    fullName: teacher.fullName,
    organizationId: lesson.group.branch.organizationId,
    roles: [],
    permissions: ["groups.attendance.mark"],
    branchIds: [lesson.group.branchId],
    activeBranchId: lesson.group.branchId,
  };
  const mark = await db.attendance.findUnique({
    where: { lessonId_membershipId: { lessonId: lesson.id, membershipId: member!.id } },
    select: { status: true },
  });
  if (!mark || mark.status === "NOT_MARKED") {
    await markAttendance(actor, lesson.id, [{ membershipId: member!.id, status: "ABSENT" }], db);
  }
  const date = dateToIso(lesson.date);
  await notifyStudents(db, {
    studentIds: [member!.studentId],
    kind: "noShow",
    refKey: `no-show:${room.id}`,
    values: { group: lesson.group.name, minutes: config.noShowMinutes, time: lesson.startTime },
  });
  await notifyStaff(db, {
    organizationId: lesson.group.branch.organizationId,
    branchId: lesson.group.branchId,
    text: `O'quvchi darsga kelmadi: ${member!.student.fullName} — ${lesson.group.name}, ${date} ${lesson.startTime} (${config.noShowMinutes} daqiqa kutildi, "kelmadi" qo'yildi)`,
  });
  return now;
}

/** For tests and tools: the rule for one room by id. */
export async function checkRoomNoShow(roomId: string, db: DbClient = prisma, now = new Date()) {
  const room = await db.videoRoom.findUniqueOrThrow({
    where: { id: roomId },
    select: {
      id: true,
      groupId: true,
      lessonId: true,
      startedById: true,
      startedAt: true,
      noShowAt: true,
    },
  });
  return checkNoShow(db, room, now);
}
