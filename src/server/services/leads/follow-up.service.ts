import type { Prisma } from "@/generated/prisma/client";
import { statusAfterContact } from "@/lib/lead-follow-up";
import type { Page, SortDirection } from "@/lib/validation/common";
import type {
  LeadCallRange,
  LeadCallsFilters,
  LeadCallSortField,
  LeadContactChannel,
  LeadContactInput,
  LeadContactOutcome,
} from "@/lib/validation/leads";
import { recordAudit } from "@/server/audit/audit";
import { prisma, type DbClient } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";
import type { ParsedList } from "@/server/http/list-query";
import { enqueue } from "@/server/jobs/queue";
import { authorize, type Actor } from "@/server/rbac/authorize";
import { notifyUsers } from "@/server/services/dashboard/notifications.service";
import { daysBetween } from "@/server/services/debts/debts.service";
import { dateToIso, isoToDate, mustFind } from "@/server/services/settings/shared";
import { botDate, botText, wallClock } from "@/server/services/telegram/student-telegram.service";

import { leadInclude, toLeadDto, type LeadDto } from "./leads.service";
import { assertBranch, leadScope, tashkentToday } from "./shared";

/*
 * Lead follow-up (A-126): every lead may carry an owner and a next-contact date.
 * "Calls today" lists what is due, a contact log moves the status and sets the
 * next date, and the owners hear about the day's calls each morning.
 */

/** Hour (Tashkent) from which the day's reminder goes out. */
export const LEAD_CALLS_HOUR = 9;
/** Leads named in the Telegram reminder before "… and N more". */
const REMINDER_NAMES = 8;

export interface LeadCallDto extends LeadDto {
  boardName: string;
  columnName: string;
  branchName: string;
  /** Who recorded the last contact. */
  lastContactBy: string | null;
  /** Days past the planned date (0 = due today); null without a date or when it is ahead. */
  overdueDays: number | null;
}

export interface LeadCallsSummary {
  overdue: number;
  today: number;
  upcoming: number;
  none: number;
}

export interface LeadCallsListDto extends Page<LeadCallDto> {
  summary: LeadCallsSummary;
  /** The day the list was computed for (Tashkent). */
  today: string;
}

export interface LeadContactDto {
  id: string;
  channel: LeadContactChannel;
  outcome: LeadContactOutcome | null;
  note: string | null;
  nextContactAt: string | null;
  createdBy: string | null;
  createdAt: string;
}

const callInclude = {
  ...leadInclude,
  board: { select: { name: true } },
  column: { select: { name: true } },
  branch: { select: { name: true } },
  contacts: {
    orderBy: { createdAt: "desc" },
    take: 1,
    select: { createdBy: { select: { fullName: true } } },
  },
} satisfies Prisma.LeadInclude;
type CallRow = Prisma.LeadGetPayload<{ include: typeof callInclude }>;

function toCallDto(row: CallRow, todayIso: string): LeadCallDto {
  const next = row.nextContactAt ? dateToIso(row.nextContactAt) : null;
  return {
    ...toLeadDto(row),
    boardName: row.board.name,
    columnName: row.column.name,
    branchName: row.branch.name,
    lastContactBy: row.contacts[0]?.createdBy?.fullName ?? null,
    overdueDays: next && next <= todayIso ? daysBetween(next, todayIso) : null,
  };
}

function rangeWhere(range: LeadCallRange, todayIso: string): Prisma.LeadWhereInput {
  const today = isoToDate(todayIso);
  switch (range) {
    case "OVERDUE":
      return { nextContactAt: { lt: today } };
    case "TODAY":
      return { nextContactAt: today };
    case "UPCOMING":
      return { nextContactAt: { gt: today } };
    case "NONE":
      return { nextContactAt: null };
    default:
      return { nextContactAt: { lte: today } };
  }
}

function ownerWhere(filters: LeadCallsFilters, actor: Actor): Prisma.LeadWhereInput {
  if (!filters.ownerId) return {};
  if (filters.ownerId === "none") return { ownerId: null };
  if (filters.ownerId === "me") return { ownerId: actor.userId || "-" };
  return { ownerId: filters.ownerId };
}

function orderOf(sort: {
  field: LeadCallSortField;
  direction: SortDirection;
}): Prisma.LeadOrderByWithRelationInput[] {
  const d = sort.direction;
  switch (sort.field) {
    case "fullName":
      return [{ fullName: d }];
    case "lastContactAt":
      return [{ lastContactAt: { sort: d, nulls: "last" } }, { fullName: "asc" }];
    case "createdAt":
      return [{ createdAt: d }];
    default:
      return [{ nextContactAt: { sort: d, nulls: "last" } }, { fullName: "asc" }];
  }
}

/** "Calls today": the leads in scope by owner and planned date, with the day's counts. */
export async function listLeadCalls(
  actor: Actor,
  query: ParsedList<LeadCallSortField>,
  filters: LeadCallsFilters = {},
  db: DbClient = prisma,
  todayIso: string = tashkentToday(),
): Promise<LeadCallsListDto> {
  authorize(actor, "leads.view");
  const base: Prisma.LeadWhereInput = {
    ...leadScope(actor),
    isArchived: false,
    ...ownerWhere(filters, actor),
  };
  const where: Prisma.LeadWhereInput = {
    ...base,
    ...rangeWhere(filters.range ?? "DUE", todayIso),
    ...(query.q
      ? {
          OR: [
            { fullName: { contains: query.q, mode: "insensitive" } },
            { phones: { some: { phone: { contains: query.q.replace(/[\s()-]/g, "") } } } },
          ],
        }
      : {}),
  };
  const today = isoToDate(todayIso);
  const [total, rows, overdue, dueToday, upcoming, none] = await Promise.all([
    db.lead.count({ where }),
    db.lead.findMany({
      where,
      include: callInclude,
      orderBy: orderOf(query.sort),
      skip: query.skip,
      take: query.take,
    }),
    db.lead.count({ where: { ...base, nextContactAt: { lt: today } } }),
    db.lead.count({ where: { ...base, nextContactAt: today } }),
    db.lead.count({ where: { ...base, nextContactAt: { gt: today } } }),
    db.lead.count({ where: { ...base, nextContactAt: null } }),
  ]);
  return {
    items: rows.map((r) => toCallDto(r, todayIso)),
    total,
    page: query.page,
    pageSize: query.pageSize,
    summary: { overdue, today: dueToday, upcoming, none },
    today: todayIso,
  };
}

async function findLead(db: DbClient, actor: Actor, id: string) {
  const row = await mustFind(
    db.lead.findUnique({ where: { id }, include: leadInclude }),
    "errors.leadNotFound",
  );
  assertBranch(actor, row.branchId);
  return row;
}

export async function listLeadContacts(
  actor: Actor,
  leadId: string,
  db: DbClient = prisma,
): Promise<LeadContactDto[]> {
  authorize(actor, "leads.view");
  await findLead(db, actor, leadId);
  const rows = await db.leadContact.findMany({
    where: { leadId },
    orderBy: { createdAt: "desc" },
    include: { createdBy: { select: { fullName: true } } },
  });
  return rows.map((c) => ({
    id: c.id,
    channel: c.channel,
    outcome: c.outcome,
    note: c.note,
    nextContactAt: c.nextContactAt ? dateToIso(c.nextContactAt) : null,
    createdBy: c.createdBy?.fullName ?? null,
    createdAt: c.createdAt.toISOString(),
  }));
}

/**
 * "Log a contact": records how the lead was reached and how it ended, moves the
 * status (unless staff chose one), sets the next date and gives an ownerless lead
 * to the person who called.
 */
export async function logLeadContact(
  actor: Actor,
  leadId: string,
  input: LeadContactInput,
  db: DbClient = prisma,
): Promise<LeadDto> {
  authorize(actor, "leads.update");
  const row = await findLead(db, actor, leadId);
  if (row.isArchived) throw AppError.conflict("errors.leadArchived");
  const outcome = input.outcome ?? null;
  const status = input.status ?? statusAfterContact(outcome, row.status);
  const nextContactAt =
    input.nextContactAt === undefined
      ? undefined
      : input.nextContactAt
        ? isoToDate(input.nextContactAt)
        : null;
  return db.$transaction(async (tx) => {
    const updated = await tx.lead.update({
      where: { id: leadId },
      data: {
        status,
        lastContactAt: new Date(),
        lastOutcome: outcome,
        ...(nextContactAt !== undefined ? { nextContactAt } : {}),
        ...(!row.ownerId && actor.userId ? { owner: { connect: { id: actor.userId } } } : {}),
        contacts: {
          create: {
            channel: input.channel,
            outcome,
            note: input.note ?? null,
            nextContactAt: nextContactAt ?? null,
            createdById: actor.userId || null,
          },
        },
      },
      include: leadInclude,
    });
    const after = toLeadDto(updated);
    await recordAudit(tx, actor, {
      action: "lead.contact",
      entity: "Lead",
      entityId: leadId,
      before: {
        status: row.status,
        nextContactAt: row.nextContactAt ? dateToIso(row.nextContactAt) : null,
      },
      after: {
        status: after.status,
        nextContactAt: after.nextContactAt,
        channel: input.channel,
        outcome,
        note: input.note ?? null,
      },
      branchId: row.branchId,
    });
    return after;
  });
}

/** From 09:00 Tashkent time the day's reminder is due once. */
export function leadFollowUpDue(now: Date = new Date()): { date: string; key: string } | null {
  const clock = wallClock(now);
  if (clock.minutes < LEAD_CALLS_HOUR * 60) return null;
  return { date: clock.date, key: `lead-calls:${clock.date}` };
}

export interface LeadFollowUpRun {
  /** In-app notices written. */
  notified: number;
  /** Telegram messages queued. */
  queued: number;
}

type DueLead = {
  id: string;
  fullName: string;
  branchId: string;
  ownerId: string | null;
  nextContactAt: Date | null;
  phones: Array<{ phone: string }>;
};

function push<K>(map: Map<K, DueLead[]>, key: K, lead: DueLead) {
  const list = map.get(key);
  if (list) list.push(lead);
  else map.set(key, [lead]);
}

/**
 * The morning run: every owner with calls due today (or overdue) gets one bell
 * notice and, when the staff bot knows their chat, one Telegram message naming
 * the leads. Leads nobody owns are announced to the branch's lead handlers.
 */
export async function runDailyLeadFollowUp(
  db: DbClient,
  todayIso: string = tashkentToday(),
  /** Limits the run to some branches (tests); the worker runs every centre. */
  scope: { branchIds?: string[] } = {},
): Promise<LeadFollowUpRun> {
  const result: LeadFollowUpRun = { notified: 0, queued: 0 };
  const orgs = await db.organization.findMany({
    select: { id: true, branches: { select: { id: true } } },
  });
  for (const org of orgs) {
    const branchIds = org.branches
      .map((b) => b.id)
      .filter((id) => !scope.branchIds || scope.branchIds.includes(id));
    if (branchIds.length === 0) continue;
    const due: DueLead[] = await db.lead.findMany({
      where: {
        branchId: { in: branchIds },
        isArchived: false,
        nextContactAt: { lte: isoToDate(todayIso) },
      },
      select: {
        id: true,
        fullName: true,
        branchId: true,
        ownerId: true,
        nextContactAt: true,
        phones: { orderBy: { sortOrder: "asc" }, take: 1, select: { phone: true } },
      },
      orderBy: [{ nextContactAt: "asc" }, { fullName: "asc" }],
    });
    if (due.length === 0) continue;
    const byOwner = new Map<string, DueLead[]>();
    const unowned = new Map<string, DueLead[]>();
    for (const lead of due) {
      if (lead.ownerId) push(byOwner, lead.ownerId, lead);
      else push(unowned, lead.branchId, lead);
    }
    const overdueOf = (leads: DueLead[]) =>
      leads.filter((l) => l.nextContactAt && dateToIso(l.nextContactAt) < todayIso).length;
    for (const [ownerId, leads] of byOwner) {
      const owner = await db.user.findUnique({
        where: { id: ownerId },
        select: {
          fullName: true,
          isArchived: true,
          botRecipient: { select: { chatId: true, branchIds: true } },
        },
      });
      if (!owner || owner.isArchived) {
        for (const lead of leads) push(unowned, lead.branchId, lead);
        continue;
      }
      await db.notification.create({
        data: {
          userId: ownerId,
          kind: "LEAD_FOLLOW_UP",
          params: { count: leads.length, overdue: overdueOf(leads) },
          href: "/leads/calls?ownerId=me",
          branchId: leads[0]?.branchId ?? null,
        },
      });
      result.notified += 1;
      const chat = owner.botRecipient;
      if (!chat) continue;
      const mine = chat.branchIds.length
        ? leads.filter((l) => chat.branchIds.includes(l.branchId))
        : leads;
      if (mine.length === 0) continue;
      const lines = mine.slice(0, REMINDER_NAMES).map((l) =>
        botText("uz", "leadCallsLine", {
          name: l.fullName,
          phone: l.phones[0]?.phone ?? "—",
          when: botDate("uz", dateToIso(l.nextContactAt ?? isoToDate(todayIso))),
        }),
      );
      const more = mine.length - lines.length;
      const text = [
        botText("uz", "leadCallsTitle", {
          name: owner.fullName,
          count: mine.length,
          overdue: overdueOf(mine),
        }),
        ...lines,
        ...(more > 0 ? [botText("uz", "leadCallsMore", { count: more })] : []),
      ].join("\n");
      await enqueue(db, {
        type: "telegram.send",
        payload: { organizationId: org.id, chatId: chat.chatId, text },
        uniqueKey: `lead-calls:${todayIso}:${ownerId}`,
      });
      result.queued += 1;
    }
    for (const [branchId, leads] of unowned) {
      result.notified += await notifyUsers(db, {
        kind: "LEAD_FOLLOW_UP",
        params: { count: leads.length, overdue: overdueOf(leads) },
        href: "/leads/calls?ownerId=none",
        branchId,
        permission: "leads.update",
      });
    }
  }
  return result;
}
