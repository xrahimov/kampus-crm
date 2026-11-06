import type { LessonMoveInput } from "@/lib/validation/groups";
import { recordAudit } from "@/server/audit/audit";
import { prisma, type DbClient } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";
import { notifyLessonChange, tashkentToday } from "@/server/services/groups/day-off.service";
import { notifyStaff } from "@/server/services/integrations/bot-recipients.service";
import { dateToIso, isoToDate } from "@/server/services/settings/shared";
import { membershipByToken } from "@/server/services/video/video.service";

/**
 * Reschedule and cancel rules for 1:1 students (A-166, online-lessons item D2).
 * When the centre switches it on, the only student of a group may move or
 * cancel an upcoming lesson from their page up to N hours before it starts;
 * later than that the lesson stays and counts as held. A lesson the teacher
 * cancelled without a new time can be rebooked by the student at any time.
 * Moves and cancellations reuse the group's days off (A-117), so staff see
 * them where they always did, and everyone is told the usual way.
 */

/** Reasons stored on the day off; the UI translates these markers. */
export const STUDENT_MOVED = "@student.moved";
export const STUDENT_CANCELLED = "@student.cancelled";

export interface RescheduleRulesDto {
  /** The centre allows it and this group has one student. */
  enabled: boolean;
  hours: number;
  workStart: string;
  workEnd: string;
}

export interface PortalUpcomingLessonDto {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  topic: string | null;
  /** Still inside the window: the student may move or cancel it. */
  canChange: boolean;
  /** When the window closes, as an ISO instant. */
  deadline: string;
}

export interface PortalCancelledLessonDto {
  dayOffId: string;
  date: string;
  startTime: string | null;
  endTime: string | null;
  /** The teacher's reason, or a marker for the student's own cancellation. */
  reason: string;
}

export interface PortalScheduleDto {
  rules: RescheduleRulesDto;
  upcoming: PortalUpcomingLessonDto[];
  /** Lessons taken off without a new time, from today on; the student may pick one. */
  cancelled: PortalCancelledLessonDto[];
}

const UPCOMING = 10;
const CURRENT = ["NEW", "TRIAL", "ACTIVE"] as const;
const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** The lesson's start as an instant, Tashkent time (UTC+5). */
export function lessonStart(date: string, startTime: string): Date {
  return new Date(`${date}T${startTime}:00+05:00`);
}

type Membership = NonNullable<Awaited<ReturnType<typeof membershipByToken>>>;

async function rulesFor(db: DbClient, membership: Membership): Promise<RescheduleRulesDto> {
  const [branch, members] = await Promise.all([
    db.branch.findUniqueOrThrow({
      where: { id: membership.group.branchId },
      select: { organization: { select: { id: true, settings: true } } },
    }),
    db.groupMembership.count({
      where: { groupId: membership.groupId, status: { in: [...CURRENT] } },
    }),
  ]);
  const settings = branch.organization.settings;
  return {
    enabled: Boolean(settings?.studentReschedule) && members === 1,
    hours: settings?.studentRescheduleHours ?? 12,
    workStart: settings?.workStart ?? "08:00",
    workEnd: settings?.workEnd ?? "20:00",
  };
}

export async function getPortalSchedule(
  token: string,
  db: DbClient = prisma,
): Promise<PortalScheduleDto | null> {
  const membership = await membershipByToken(db, token);
  if (!membership) return null;
  const todayIso = tashkentToday();
  const [rules, lessons, daysOff] = await Promise.all([
    rulesFor(db, membership),
    db.lesson.findMany({
      where: { groupId: membership.groupId, date: { gte: isoToDate(todayIso) } },
      orderBy: [{ date: "asc" }, { startTime: "asc" }],
      take: UPCOMING,
      select: {
        id: true,
        date: true,
        startTime: true,
        endTime: true,
        topic: true,
        courseTopic: { select: { title: true } },
      },
    }),
    db.groupDayOff.findMany({
      where: {
        groupId: membership.groupId,
        date: { gte: isoToDate(todayIso) },
        movedToLessonId: null,
      },
      orderBy: { date: "asc" },
    }),
  ]);
  const now = Date.now();
  const slotEnd = (startTime: string | null) => {
    if (!startTime) return null;
    const slot = membership.group.slots.find((s) => s.startTime === startTime);
    return slot?.endTime ?? null;
  };
  return {
    rules,
    upcoming: lessons.map((l) => {
      const date = dateToIso(l.date);
      const deadline = new Date(lessonStart(date, l.startTime).getTime() - rules.hours * 3600_000);
      return {
        id: l.id,
        date,
        startTime: l.startTime,
        endTime: l.endTime,
        topic: l.topic ?? l.courseTopic?.title ?? null,
        canChange: rules.enabled && deadline.getTime() > now,
        deadline: deadline.toISOString(),
      };
    }),
    cancelled: rules.enabled
      ? daysOff.map((d) => ({
          dayOffId: d.id,
          date: dateToIso(d.date),
          startTime: d.startTime,
          endTime: slotEnd(d.startTime),
          reason: d.reason,
        }))
      : [],
  };
}

async function requireRules(db: DbClient, membership: Membership): Promise<RescheduleRulesDto> {
  const rules = await rulesFor(db, membership);
  if (!rules.enabled) throw AppError.forbidden("errors.rescheduleOff");
  return rules;
}

/** The new time must be ahead, inside working hours and free for the group's teachers. */
async function assertSlotFree(
  db: DbClient,
  membership: Membership,
  rules: RescheduleRulesDto,
  moveTo: LessonMoveInput,
  ignoreLessonId: string | null,
): Promise<void> {
  if (lessonStart(moveTo.date, moveTo.startTime).getTime() <= Date.now()) {
    throw AppError.validation({ date: ["validation.futureDate"] });
  }
  if (moveTo.startTime < rules.workStart || moveTo.endTime > rules.workEnd) {
    throw AppError.validation({ startTime: ["validation.outsideWorkHours"] });
  }
  const teachers = await db.groupTeacher.findMany({
    where: { groupId: membership.groupId },
    select: { userId: true },
  });
  const busy = await db.lesson.findFirst({
    where: {
      id: ignoreLessonId ? { not: ignoreLessonId } : undefined,
      date: isoToDate(moveTo.date),
      OR: [
        { groupId: membership.groupId },
        { group: { teachers: { some: { userId: { in: teachers.map((t) => t.userId) } } } } },
      ],
    },
    select: { startTime: true, endTime: true },
  });
  const overlap = (a: { startTime: string; endTime: string }) =>
    minutes(a.startTime) < minutes(moveTo.endTime) &&
    minutes(moveTo.startTime) < minutes(a.endTime);
  if (busy && overlap(busy)) throw AppError.validation({ startTime: ["validation.teacherBusy"] });
}

async function upcomingLesson(
  db: DbClient,
  membership: Membership,
  rules: RescheduleRulesDto,
  lessonId: string,
) {
  const lesson = await db.lesson.findFirst({
    where: { id: lessonId, groupId: membership.groupId },
    include: { _count: { select: { attendances: true, grades: true } }, movedFrom: true },
  });
  if (!lesson) throw AppError.notFound();
  const date = dateToIso(lesson.date);
  const deadline = lessonStart(date, lesson.startTime).getTime() - rules.hours * 3600_000;
  if (deadline <= Date.now() || lesson._count.attendances > 0 || lesson._count.grades > 0) {
    throw AppError.conflict("errors.rescheduleTooLate");
  }
  return { ...lesson, dateIso: date };
}

async function tellEveryone(
  tx: DbClient,
  membership: Membership,
  input: {
    kind: "lessonMoved" | "lessonCancelled";
    date: string;
    startTime: string | null;
    endTime: string | null;
    moveTo: LessonMoveInput | null;
    refKey: string;
  },
) {
  const branch = await tx.branch.findUniqueOrThrow({
    where: { id: membership.group.branchId },
    select: { organizationId: true },
  });
  await notifyLessonChange(tx, {
    groupId: membership.groupId,
    groupName: membership.group.name,
    kind: input.kind,
    date: input.date,
    startTime: input.startTime,
    endTime: input.endTime,
    reason: "",
    moveTo: input.moveTo,
    refKey: input.refKey,
  });
  const when = `${input.date}${input.startTime ? ` ${input.startTime}` : ""}`;
  const text = input.moveTo
    ? `Dars ko'chirildi (o'quvchi): ${membership.student.fullName} — ${membership.group.name}, ${when} → ${input.moveTo.date} ${input.moveTo.startTime}–${input.moveTo.endTime}`
    : `Dars bekor qilindi (o'quvchi): ${membership.student.fullName} — ${membership.group.name}, ${when}`;
  await notifyStaff(tx, {
    organizationId: branch.organizationId,
    branchId: membership.group.branchId,
    text,
  });
}

/** The student moves an upcoming lesson to a new date and time. */
export async function movePortalLesson(
  token: string,
  lessonId: string,
  moveTo: LessonMoveInput,
  db: DbClient = prisma,
): Promise<PortalScheduleDto | null> {
  const membership = await membershipByToken(db, token);
  if (!membership) return null;
  const rules = await requireRules(db, membership);
  const lesson = await upcomingLesson(db, membership, rules, lessonId);
  await assertSlotFree(db, membership, rules, moveTo, lesson.id);
  await db.$transaction(async (tx) => {
    let refKey: string;
    if (lesson.isExtra) {
      // An already-moved lesson simply moves on; its day off now points at the new time.
      await tx.lesson.update({
        where: { id: lesson.id },
        data: {
          date: isoToDate(moveTo.date),
          startTime: moveTo.startTime,
          endTime: moveTo.endTime,
        },
      });
      refKey = `student-move:${lesson.id}:${moveTo.date}${moveTo.startTime}`;
    } else {
      const dayOff = await tx.groupDayOff.create({
        data: {
          groupId: membership.groupId,
          date: lesson.date,
          reason: STUDENT_MOVED,
          startTime: lesson.startTime,
          notifiedAt: new Date(),
        },
      });
      await tx.lesson.delete({ where: { id: lesson.id } });
      const moved = await tx.lesson.create({
        data: {
          groupId: membership.groupId,
          date: isoToDate(moveTo.date),
          startTime: moveTo.startTime,
          endTime: moveTo.endTime,
          isExtra: true,
        },
        select: { id: true },
      });
      await tx.groupDayOff.update({
        where: { id: dayOff.id },
        data: { movedToLessonId: moved.id },
      });
      refKey = `dayoff:${dayOff.id}`;
    }
    await tellEveryone(tx, membership, {
      kind: "lessonMoved",
      date: lesson.dateIso,
      startTime: lesson.startTime,
      endTime: lesson.endTime,
      moveTo,
      refKey,
    });
    await recordAudit(tx, null, {
      organizationId: (
        await tx.branch.findUniqueOrThrow({
          where: { id: membership.group.branchId },
          select: { organizationId: true },
        })
      ).organizationId,
      branchId: membership.group.branchId,
      action: "lesson.studentMove",
      entity: "Group",
      entityId: membership.groupId,
      before: { date: lesson.dateIso, startTime: lesson.startTime },
      after: { ...moveTo, studentId: membership.studentId },
    });
  });
  return getPortalSchedule(token, db);
}

/** The student cancels an upcoming lesson; the day is a day off the teacher sees. */
export async function cancelPortalLesson(
  token: string,
  lessonId: string,
  db: DbClient = prisma,
): Promise<PortalScheduleDto | null> {
  const membership = await membershipByToken(db, token);
  if (!membership) return null;
  const rules = await requireRules(db, membership);
  const lesson = await upcomingLesson(db, membership, rules, lessonId);
  await db.$transaction(async (tx) => {
    if (lesson.movedFrom) {
      // The lesson was itself a move: the original day off now stands as a plain cancellation.
      await tx.groupDayOff.update({
        where: { id: lesson.movedFrom.id },
        data: { movedToLessonId: null, reason: STUDENT_CANCELLED },
      });
      await tx.lesson.delete({ where: { id: lesson.id } });
    } else {
      await tx.lesson.delete({ where: { id: lesson.id } });
      await tx.groupDayOff.upsert({
        where: { groupId_date: { groupId: membership.groupId, date: lesson.date } },
        create: {
          groupId: membership.groupId,
          date: lesson.date,
          reason: STUDENT_CANCELLED,
          startTime: lesson.startTime,
          notifiedAt: new Date(),
        },
        update: { reason: STUDENT_CANCELLED, startTime: lesson.startTime },
      });
    }
    await tellEveryone(tx, membership, {
      kind: "lessonCancelled",
      date: lesson.dateIso,
      startTime: lesson.startTime,
      endTime: lesson.endTime,
      moveTo: null,
      refKey: `student-cancel:${lesson.id}`,
    });
    await recordAudit(tx, null, {
      organizationId: (
        await tx.branch.findUniqueOrThrow({
          where: { id: membership.group.branchId },
          select: { organizationId: true },
        })
      ).organizationId,
      branchId: membership.group.branchId,
      action: "lesson.studentCancel",
      entity: "Group",
      entityId: membership.groupId,
      before: {
        date: lesson.dateIso,
        startTime: lesson.startTime,
        studentId: membership.studentId,
      },
    });
  });
  return getPortalSchedule(token, db);
}

/** The student picks a new time for a lesson the teacher took off without one. */
export async function rebookPortalLesson(
  token: string,
  dayOffId: string,
  moveTo: LessonMoveInput,
  db: DbClient = prisma,
): Promise<PortalScheduleDto | null> {
  const membership = await membershipByToken(db, token);
  if (!membership) return null;
  const rules = await requireRules(db, membership);
  const dayOff = await db.groupDayOff.findFirst({
    where: { id: dayOffId, groupId: membership.groupId, movedToLessonId: null },
  });
  if (!dayOff) throw AppError.notFound();
  await assertSlotFree(db, membership, rules, moveTo, null);
  await db.$transaction(async (tx) => {
    const moved = await tx.lesson.create({
      data: {
        groupId: membership.groupId,
        date: isoToDate(moveTo.date),
        startTime: moveTo.startTime,
        endTime: moveTo.endTime,
        isExtra: true,
      },
      select: { id: true },
    });
    await tx.groupDayOff.update({
      where: { id: dayOff.id },
      data: {
        movedToLessonId: moved.id,
        reason: dayOff.reason === STUDENT_CANCELLED ? STUDENT_MOVED : dayOff.reason,
      },
    });
    await tellEveryone(tx, membership, {
      kind: "lessonMoved",
      date: dateToIso(dayOff.date),
      startTime: dayOff.startTime,
      endTime: null,
      moveTo,
      refKey: `rebook:${dayOff.id}:${moved.id}`,
    });
    await recordAudit(tx, null, {
      organizationId: (
        await tx.branch.findUniqueOrThrow({
          where: { id: membership.group.branchId },
          select: { organizationId: true },
        })
      ).organizationId,
      branchId: membership.group.branchId,
      action: "lesson.studentRebook",
      entity: "Group",
      entityId: membership.groupId,
      before: { date: dateToIso(dayOff.date), startTime: dayOff.startTime },
      after: { ...moveTo, studentId: membership.studentId },
    });
  });
  return getPortalSchedule(token, db);
}
