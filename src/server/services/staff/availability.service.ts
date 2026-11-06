import type { AvailabilityInput } from "@/lib/validation/groups";
import { recordAudit } from "@/server/audit/audit";
import { prisma, type DbClient } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";
import { authorize, type Actor } from "@/server/rbac/authorize";
import { isoToDate } from "@/server/services/settings/shared";

/*
 * Teacher availability for 1:1 booking (online-lessons item D1, A-169). A
 * teacher (or anyone who may edit teachers) keeps weekly windows in which the
 * teacher's 1:1 students may book or move a lesson from their page. Free slots
 * are those windows cut into steps, minus every lesson the teacher already
 * gives and the group's and branch's days off. A teacher with no windows has
 * no slot list; their students pick any free time inside the centre's hours.
 */

export interface AvailabilityWindowDto {
  weekday: number;
  startTime: string;
  endTime: string;
}

export interface FreeSlotDto {
  date: string;
  startTime: string;
  endTime: string;
}

const TEACHER_ROLES = ["TEACHER", "SUPPORT_TEACHER"];
const minutes = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));
const hhmm = (m: number) =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const byWindow = (a: AvailabilityWindowDto, b: AvailabilityWindowDto) =>
  a.weekday - b.weekday || a.startTime.localeCompare(b.startTime);

/** The person themselves, or someone who may see (view) or edit (update) teachers in their branch. */
async function requireTeacher(db: DbClient, actor: Actor, userId: string, edit: boolean) {
  const user = await db.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      organizationId: true,
      roles: { select: { role: { select: { code: true } } } },
      branches: { select: { branchId: true } },
    },
  });
  if (!user || user.organizationId !== actor.organizationId) throw AppError.notFound();
  if (actor.userId !== userId) {
    authorize(actor, edit ? "teachers.update" : "teachers.view");
    if (
      !actor.permissions.includes("*") &&
      !user.branches.some((b) => actor.branchIds.includes(b.branchId))
    ) {
      throw AppError.forbidden("errors.branchForbidden");
    }
  }
  return user;
}

/** Whether the user teaches at all; the account page shows the editor only then. */
export function isTeacherUser(roleCodes: string[]): boolean {
  return roleCodes.some((c) => TEACHER_ROLES.includes(c));
}

export async function getAvailability(
  actor: Actor,
  userId: string,
  db: DbClient = prisma,
): Promise<AvailabilityWindowDto[]> {
  await requireTeacher(db, actor, userId, false);
  return listWindows(db, [userId]);
}

async function listWindows(db: DbClient, userIds: string[]): Promise<AvailabilityWindowDto[]> {
  const rows = await db.teacherAvailability.findMany({
    where: { userId: { in: userIds } },
    select: { weekday: true, startTime: true, endTime: true },
  });
  return rows.sort(byWindow);
}

export async function setAvailability(
  actor: Actor,
  userId: string,
  input: AvailabilityInput,
  db: DbClient = prisma,
): Promise<AvailabilityWindowDto[]> {
  await requireTeacher(db, actor, userId, true);
  // Windows of one day must not overlap each other.
  const sorted = [...input.windows].sort(byWindow);
  for (let i = 1; i < sorted.length; i++) {
    const prev = sorted[i - 1]!;
    const cur = sorted[i]!;
    if (prev.weekday === cur.weekday && cur.startTime < prev.endTime) {
      throw AppError.validation({ windows: ["validation.availabilityOverlap"] });
    }
  }
  return db.$transaction(async (tx) => {
    const before = await listWindows(tx, [userId]);
    await tx.teacherAvailability.deleteMany({ where: { userId } });
    if (sorted.length > 0) {
      await tx.teacherAvailability.createMany({
        data: sorted.map((w) => ({ userId, ...w })),
      });
    }
    await recordAudit(tx, actor, {
      action: "staff.availability",
      entity: "User",
      entityId: userId,
      before: { windows: before },
      after: { windows: sorted },
    });
    return sorted;
  });
}

/**
 * Free slots for a group's teachers over `days` days from `from`: each window
 * of the day, in steps of `stepMinutes`, as slots of `lengthMinutes` that no
 * lesson of the teachers (any group) or of the group overlaps, skipping the
 * group's and the branch's days off. Empty when the teachers keep no windows.
 */
export async function freeSlots(
  db: DbClient,
  input: {
    groupId: string;
    branchId: string;
    teacherIds: string[];
    from: string;
    days: number;
    lengthMinutes: number;
    stepMinutes: number;
    /** A lesson being moved does not block its own old time. */
    ignoreLessonId?: string | null;
    now?: Date;
    limit?: number;
  },
): Promise<{ hasAvailability: boolean; slots: FreeSlotDto[] }> {
  const windows = await listWindows(db, input.teacherIds);
  if (windows.length === 0) return { hasAvailability: false, slots: [] };
  const start = isoToDate(input.from);
  const end = new Date(start.getTime() + input.days * 86_400_000);
  const [lessons, groupDays, branchDays] = await Promise.all([
    db.lesson.findMany({
      where: {
        date: { gte: start, lt: end },
        id: input.ignoreLessonId ? { not: input.ignoreLessonId } : undefined,
        group: { status: { not: "ARCHIVED" } },
        OR: [
          { groupId: input.groupId },
          { group: { teachers: { some: { userId: { in: input.teacherIds } } } } },
          { group: { supportTeachers: { some: { userId: { in: input.teacherIds } } } } },
        ],
      },
      select: { date: true, startTime: true, endTime: true },
    }),
    db.groupDayOff.findMany({
      where: { groupId: input.groupId, date: { gte: start, lt: end }, movedToLessonId: null },
      select: { date: true },
    }),
    db.dayOff.findMany({
      where: { branchId: input.branchId, date: { gte: start, lt: end } },
      select: { date: true },
    }),
  ]);
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const off = new Set([...groupDays, ...branchDays].map((d) => iso(d.date)));
  const busy = new Map<string, Array<{ s: number; e: number }>>();
  for (const l of lessons) {
    const key = iso(l.date);
    const list = busy.get(key) ?? [];
    list.push({ s: minutes(l.startTime), e: minutes(l.endTime) });
    busy.set(key, list);
  }
  const now = (input.now ?? new Date()).getTime();
  const limit = input.limit ?? 60;
  const slots: FreeSlotDto[] = [];
  for (let d = new Date(start); d < end && slots.length < limit; d.setUTCDate(d.getUTCDate() + 1)) {
    const date = iso(d);
    if (off.has(date)) continue;
    const weekday = d.getUTCDay() || 7;
    const taken = busy.get(date) ?? [];
    for (const w of windows.filter((w) => w.weekday === weekday)) {
      for (
        let s = minutes(w.startTime);
        s + input.lengthMinutes <= minutes(w.endTime) && slots.length < limit;
        s += input.stepMinutes
      ) {
        const e = s + input.lengthMinutes;
        if (new Date(`${date}T${hhmm(s)}:00+05:00`).getTime() <= now) continue;
        if (taken.some((t) => t.s < e && s < t.e)) continue;
        if (slots.some((x) => x.date === date && x.startTime === hhmm(s))) continue;
        slots.push({ date, startTime: hhmm(s), endTime: hhmm(e) });
      }
    }
  }
  return { hasAvailability: true, slots };
}

/** True when the teachers keep windows and `slot` lies inside one of that weekday's windows. */
export async function withinAvailability(
  db: DbClient,
  teacherIds: string[],
  slot: { date: string; startTime: string; endTime: string },
): Promise<boolean | null> {
  const windows = await listWindows(db, teacherIds);
  if (windows.length === 0) return null;
  const weekday = isoToDate(slot.date).getUTCDay() || 7;
  return windows.some(
    (w) => w.weekday === weekday && w.startTime <= slot.startTime && slot.endTime <= w.endTime,
  );
}
