import type { Prisma } from "@/generated/prisma/client";
import type { TrialBookingInput, TrialOutcomeInput, TrialStatus } from "@/lib/validation/leads";
import { recordAudit } from "@/server/audit/audit";
import { prisma, type DbClient } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";
import { authorize, can, type Actor } from "@/server/rbac/authorize";
import { findGroupInScope, groupScope } from "@/server/services/groups/shared";
import { dateToIso, isoToDate, mustFind } from "@/server/services/settings/shared";

import { leadScope } from "./shared";

/*
 * Trial lessons (A-131): a lead comes to one lesson of a group before deciding.
 * The office books the visit from the lead card, the teacher sees the visitor on
 * the Today roster and marks whether they came, and adding the lead to the group
 * (A-68) closes the booking as converted.
 */

/** Bookings that still count as a visit: not cancelled. */
export const TRIAL_LIVE: TrialStatus[] = ["BOOKED", "ATTENDED", "NO_SHOW", "CONVERTED"];

export interface TrialBookingDto {
  id: string;
  leadId: string;
  groupId: string;
  groupName: string;
  courseName: string;
  lessonId: string | null;
  /** "HH:mm" of the group's lesson that day, when one exists. */
  startTime: string | null;
  date: string;
  status: TrialStatus;
  note: string | null;
  createdByName: string | null;
  createdAt: string;
}

const include = {
  group: { select: { name: true, course: { select: { name: true } } } },
  lesson: { select: { startTime: true } },
  createdBy: { select: { fullName: true } },
} satisfies Prisma.TrialBookingInclude;
type Row = Prisma.TrialBookingGetPayload<{ include: typeof include }>;

function toDto(row: Row): TrialBookingDto {
  return {
    id: row.id,
    leadId: row.leadId,
    groupId: row.groupId,
    groupName: row.group.name,
    courseName: row.group.course.name,
    lessonId: row.lessonId,
    startTime: row.lesson?.startTime ?? null,
    date: dateToIso(row.date),
    status: row.status,
    note: row.note,
    createdByName: row.createdBy?.fullName ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

/** The lead's trials, newest day first. */
export async function listLeadTrials(
  actor: Actor,
  leadId: string,
  db: DbClient = prisma,
): Promise<TrialBookingDto[]> {
  authorize(actor, "leads.view");
  await mustFind(
    db.lead.findFirst({ where: { id: leadId, ...leadScope(actor) }, select: { id: true } }),
    "errors.leadNotFound",
  );
  const rows = await db.trialBooking.findMany({
    where: { leadId },
    include,
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
  });
  return rows.map(toDto);
}

/**
 * "Book a trial" on the lead card: one visit per lead, group and day. The
 * group's lesson on that day is remembered when it exists, so the Today roster
 * shows the visitor under the right lesson; without one the booking still shows
 * once the office adds the lesson.
 */
export async function bookTrial(
  actor: Actor,
  leadId: string,
  input: TrialBookingInput,
  db: DbClient = prisma,
): Promise<TrialBookingDto> {
  authorize(actor, "leads.update");
  const lead = await mustFind(
    db.lead.findFirst({
      where: { id: leadId, ...leadScope(actor) },
      select: { id: true, branchId: true, studentId: true, isArchived: true },
    }),
    "errors.leadNotFound",
  );
  if (lead.isArchived) throw AppError.conflict("errors.leadArchived");
  const group = await findGroupInScope(db, actor, input.groupId, {});
  if (group.status === "ARCHIVED") throw AppError.conflict("errors.groupArchived");
  if (group.branchId !== lead.branchId) {
    throw AppError.validation({ groupId: ["validation.trialOtherBranch"] });
  }
  const date = isoToDate(input.date);
  const duplicate = await db.trialBooking.findFirst({
    where: { leadId, groupId: group.id, date, status: { not: "CANCELLED" } },
    select: { id: true },
  });
  if (duplicate) throw AppError.conflict("errors.trialExists");
  const lesson = await db.lesson.findFirst({
    where: { groupId: group.id, date },
    orderBy: { startTime: "asc" },
    select: { id: true },
  });
  return db.$transaction(async (tx) => {
    const row = await tx.trialBooking.create({
      data: {
        leadId,
        groupId: group.id,
        lessonId: lesson?.id ?? null,
        date,
        note: input.note,
        createdById: actor.userId || null,
      },
      include,
    });
    await recordAudit(tx, actor, {
      action: "lead.trial.book",
      entity: "Lead",
      entityId: leadId,
      after: { groupId: group.id, groupName: group.name, date: input.date },
      branchId: lead.branchId,
    });
    return toDto(row);
  });
}

/**
 * The outcome of a visit: "came" or "didn't come" from the Today roster (the
 * teacher, who may mark attendance in that group) or from the lead card (the
 * office), "cancelled" from the card only. A converted booking stays converted.
 */
export async function setTrialOutcome(
  actor: Actor,
  bookingId: string,
  input: TrialOutcomeInput,
  db: DbClient = prisma,
): Promise<TrialBookingDto> {
  const office = can(actor, "leads.update");
  const teacher = can(actor, "groups.attendance.mark");
  if (!office && !teacher) throw AppError.forbidden();
  if (input.status === "CANCELLED" && !office) throw AppError.forbidden();
  const row = await mustFind(
    db.trialBooking.findFirst({
      where: {
        id: bookingId,
        OR: [
          ...(office ? [{ lead: leadScope(actor) }] : []),
          ...(teacher ? [{ group: groupScope(actor) }] : []),
        ],
      },
      include: { ...include, lead: { select: { branchId: true } } },
    }),
    "errors.trialNotFound",
  );
  if (row.status === "CONVERTED") throw AppError.conflict("errors.trialConverted");
  if (row.status === input.status) return toDto(row);
  return db.$transaction(async (tx) => {
    const updated = await tx.trialBooking.update({
      where: { id: row.id },
      data: { status: input.status },
      include,
    });
    await recordAudit(tx, actor, {
      action: "lead.trial.outcome",
      entity: "Lead",
      entityId: row.leadId,
      before: { status: row.status },
      after: { status: input.status, groupName: row.group.name, date: dateToIso(row.date) },
      branchId: row.lead.branchId,
    });
    return toDto(updated);
  });
}

/** Called when a lead joins a group (A-68): its open trials there, and any attended one, end as converted. */
export async function convertTrials(tx: DbClient, leadId: string, groupId: string): Promise<void> {
  await tx.trialBooking.updateMany({
    where: {
      leadId,
      OR: [{ groupId }, { status: "ATTENDED" }],
      status: { in: ["BOOKED", "ATTENDED"] },
    },
    data: { status: "CONVERTED" },
  });
}

export interface TodayTrialDto {
  id: string;
  leadId: string;
  fullName: string;
  /** Shown to people who may see leads; the teacher sees the name only. */
  phone: string | null;
  status: TrialStatus;
  note: string | null;
  lessonId: string | null;
}

/**
 * The day's trial visitors of the given groups, for the Today roster: live
 * bookings by group, the office's phone numbers included only for people who
 * may see leads.
 */
export async function trialsOfDay(
  db: DbClient,
  actor: Actor,
  groupIds: string[],
  dateIso: string,
): Promise<Map<string, TodayTrialDto[]>> {
  const result = new Map<string, TodayTrialDto[]>();
  if (groupIds.length === 0) return result;
  const showPhone = can(actor, "leads.view");
  const rows = await db.trialBooking.findMany({
    where: { groupId: { in: groupIds }, date: isoToDate(dateIso), status: { in: TRIAL_LIVE } },
    select: {
      id: true,
      leadId: true,
      groupId: true,
      lessonId: true,
      status: true,
      note: true,
      lead: {
        select: { fullName: true, phones: { orderBy: { sortOrder: "asc" }, take: 1 } },
      },
    },
    orderBy: { lead: { fullName: "asc" } },
  });
  for (const r of rows) {
    const list = result.get(r.groupId) ?? [];
    list.push({
      id: r.id,
      leadId: r.leadId,
      fullName: r.lead.fullName,
      phone: showPhone ? (r.lead.phones[0]?.phone ?? null) : null,
      status: r.status,
      note: r.note,
      lessonId: r.lessonId,
    });
    result.set(r.groupId, list);
  }
  return result;
}
