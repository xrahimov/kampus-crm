import type { Prisma } from "@/generated/prisma/client";
import type { Page } from "@/lib/validation/common";
import type {
  AutoSmsEvent,
  SendSmsInput,
  SmsLogFilters,
  SmsRecipientType,
  SmsStatus,
  SmsTarget,
} from "@/lib/validation/integrations";
import { recordAudit } from "@/server/audit/audit";
import { prisma, type DbClient } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";
import type { ParsedList } from "@/server/http/list-query";
import { authorize, branchScope, canAccessAllBranches, type Actor } from "@/server/rbac/authorize";
import { findGroupInScope } from "@/server/services/groups/shared";
import { getSmsProvider } from "@/server/services/integrations/integrations.service";
import { isoToDate, mustFind } from "@/server/services/settings/shared";
import { listStudents, studentScope } from "@/server/services/students/students.service";

/* Sending SMS (EXP: SMS YUBORISH buttons, column SMS, parents, Xabar +) and the SMS log (§8). A-84. */

export interface SmsRecipient {
  type: SmsRecipientType;
  name: string;
  phone: string;
  studentId: string | null;
  branchId: string | null;
}

export interface SmsLogRowDto {
  id: string;
  recipientType: SmsRecipientType;
  recipientName: string;
  phone: string;
  studentId: string | null;
  text: string;
  status: SmsStatus;
  /** Null = sent by the system ("Dastur tomonidan jo'natildi"). */
  sentByName: string | null;
  event: AutoSmsEvent | null;
  error: string | null;
  createdAt: string;
  sentAt: string | null;
}

export interface SendSmsResult {
  total: number;
  sent: number;
  failed: number;
  skipped: number;
  adapter: string;
}

const LEFT = ["ARCHIVED", "GRADUATED"] as const;

/** Resolves a target into phones the actor may message; students without a phone are skipped. */
export async function resolveRecipients(
  actor: Actor,
  target: SmsTarget,
  db: DbClient = prisma,
): Promise<{ recipients: SmsRecipient[]; skipped: number }> {
  const recipients: SmsRecipient[] = [];
  let skipped = 0;
  const pushStudents = (
    rows: Array<{ id: string; fullName: string; phone: string | null; branchId: string }>,
  ) => {
    for (const s of rows) {
      if (!s.phone) {
        skipped += 1;
        continue;
      }
      recipients.push({
        type: "STUDENT",
        name: s.fullName,
        phone: s.phone,
        studentId: s.id,
        branchId: s.branchId,
      });
    }
  };
  const studentSelect = { id: true, fullName: true, phone: true, branchId: true } as const;

  switch (target.kind) {
    case "student": {
      const s = await mustFind(
        db.student.findFirst({
          where: { id: target.studentId, ...studentScope(actor) },
          select: studentSelect,
        }),
        "errors.studentNotFound",
      );
      pushStudents([s]);
      break;
    }
    case "students": {
      pushStudents(
        await db.student.findMany({
          where: { id: { in: target.studentIds }, ...studentScope(actor) },
          select: studentSelect,
        }),
      );
      break;
    }
    case "studentFilter": {
      const { kind: _kind, q, ...filters } = target;
      const page = await listStudents(
        actor,
        {
          page: 1,
          pageSize: 2000,
          skip: 0,
          take: 2000,
          q,
          sort: { field: "fullName", direction: "asc" },
        },
        filters,
        db,
      );
      pushStudents(
        await db.student.findMany({
          where: { id: { in: page.items.map((s) => s.id) } },
          select: studentSelect,
        }),
      );
      break;
    }
    case "parents": {
      const s = await mustFind(
        db.student.findFirst({
          where: { id: target.studentId, ...studentScope(actor) },
          select: { ...studentSelect, parents: true },
        }),
        "errors.studentNotFound",
      );
      for (const p of s.parents) {
        recipients.push({
          type: "PARENT",
          name: p.fullName,
          phone: p.phone,
          studentId: s.id,
          branchId: s.branchId,
        });
      }
      break;
    }
    case "group": {
      const group = await findGroupInScope(db, actor, target.groupId, {
        memberships: {
          where: { status: { notIn: [...LEFT] } },
          include: { student: { select: studentSelect } },
        },
      });
      pushStudents(group.memberships.map((m) => m.student));
      break;
    }
    case "staff":
    case "teachers": {
      authorize(actor, "teachers.view");
      const where: Prisma.UserWhereInput =
        target.kind === "staff"
          ? { id: { in: target.userIds } }
          : {
              isArchived: target.archived,
              roles: { some: { role: { code: { in: ["TEACHER", "SUPPORT_TEACHER"] } } } },
            };
      where.organizationId = actor.organizationId;
      if (!canAccessAllBranches(actor)) {
        where.branches = { some: { branchId: { in: actor.branchIds } } };
      }
      const users = await db.user.findMany({ where, select: { fullName: true, phone: true } });
      for (const u of users) {
        recipients.push({
          type: "STAFF",
          name: u.fullName,
          phone: u.phone,
          studentId: null,
          branchId: null,
        });
      }
      break;
    }
    case "leads": {
      authorize(actor, "leads.view");
      const rows = await db.lead.findMany({
        where: { id: { in: target.leadIds }, ...branchScope(actor) },
        select: {
          fullName: true,
          branchId: true,
          phones: { orderBy: { sortOrder: "asc" }, take: 1, select: { phone: true } },
        },
      });
      for (const l of rows) {
        const phone = l.phones[0]?.phone;
        if (!phone) {
          skipped += 1;
          continue;
        }
        recipients.push({
          type: "LEAD",
          name: l.fullName,
          phone,
          studentId: null,
          branchId: l.branchId,
        });
      }
      break;
    }
    case "leadColumn": {
      authorize(actor, "leads.view");
      const column = await mustFind(
        db.leadColumn.findFirst({
          where: { id: target.columnId, board: branchScope(actor) },
          include: {
            leads: {
              where: { isArchived: false },
              select: {
                fullName: true,
                branchId: true,
                phones: { orderBy: { sortOrder: "asc" }, take: 1, select: { phone: true } },
              },
            },
          },
        }),
        "errors.columnNotFound",
      );
      for (const l of column.leads) {
        const phone = l.phones[0]?.phone;
        if (!phone) {
          skipped += 1;
          continue;
        }
        recipients.push({
          type: "LEAD",
          name: l.fullName,
          phone,
          studentId: null,
          branchId: l.branchId,
        });
      }
      break;
    }
  }
  // One SMS per phone even when a parent shares a number or a student is in two groups.
  const seen = new Set<string>();
  const unique = recipients.filter((r) => {
    if (seen.has(r.phone)) return false;
    seen.add(r.phone);
    return true;
  });
  return { recipients: unique, skipped: skipped + (recipients.length - unique.length) };
}

/** Sends one stored message through the configured provider and records the outcome. */
export async function deliverMessage(db: DbClient, messageId: string): Promise<SmsStatus> {
  const message = await db.smsMessage.findUnique({ where: { id: messageId } });
  if (!message || message.status === "SENT") return message?.status ?? "FAILED";
  const provider = await getSmsProvider(db, message.organizationId);
  try {
    const { providerId } = await provider.send({ phone: message.phone, text: message.text });
    await db.smsMessage.update({
      where: { id: messageId },
      data: { status: "SENT", providerId, sentAt: new Date(), error: null },
    });
    return "SENT";
  } catch (error) {
    await db.smsMessage.update({
      where: { id: messageId },
      data: {
        status: "FAILED",
        error: (error instanceof Error ? error.message : String(error)).slice(0, 500),
      },
    });
    return "FAILED";
  }
}

/** A manual send: rows are written first, then delivered one by one so the log shows every outcome. */
export async function sendSms(
  actor: Actor,
  input: SendSmsInput,
  db: DbClient = prisma,
): Promise<SendSmsResult> {
  authorize(actor, "sms.send");
  const { recipients, skipped } = await resolveRecipients(actor, input.target, db);
  if (recipients.length === 0) throw AppError.validation({ target: ["validation.noRecipients"] });
  const organizationId = actor.organizationId;
  const ids = await db.$transaction(async (tx) => {
    const created: string[] = [];
    for (const r of recipients) {
      const row = await tx.smsMessage.create({
        data: {
          organizationId,
          branchId: r.branchId ?? actor.activeBranchId ?? null,
          recipientType: r.type,
          recipientName: r.name,
          phone: r.phone,
          studentId: r.studentId,
          text: input.text,
          status: "QUEUED",
          sentById: actor.userId || null,
        },
      });
      created.push(row.id);
    }
    await recordAudit(tx, actor, {
      action: "sms.send",
      entity: "SmsMessage",
      entityId: created[0] ?? "",
      after: { target: input.target, recipients: created.length, text: input.text },
      branchId: actor.activeBranchId ?? null,
    });
    return created;
  });
  let sent = 0;
  let failed = 0;
  for (const id of ids) {
    if ((await deliverMessage(db, id)) === "SENT") sent += 1;
    else failed += 1;
  }
  const provider = await getSmsProvider(db, actor.organizationId);
  return { total: ids.length, sent, failed, skipped, adapter: provider.name };
}

/** A preview for the send dialog: how many phones a target reaches. */
export async function countRecipients(
  actor: Actor,
  target: SmsTarget,
  db: DbClient = prisma,
): Promise<{ count: number; skipped: number; sample: string[] }> {
  authorize(actor, "sms.send");
  const { recipients, skipped } = await resolveRecipients(actor, target, db);
  return { count: recipients.length, skipped, sample: recipients.slice(0, 5).map((r) => r.name) };
}

const include = { sentBy: { select: { fullName: true } } } as const;

function toDto(row: Prisma.SmsMessageGetPayload<{ include: typeof include }>): SmsLogRowDto {
  return {
    id: row.id,
    recipientType: row.recipientType,
    recipientName: row.recipientName,
    phone: row.phone,
    studentId: row.studentId,
    text: row.text,
    status: row.status,
    sentByName: row.sentBy?.fullName ?? null,
    event: row.event,
    error: row.error,
    createdAt: row.createdAt.toISOString(),
    sentAt: row.sentAt?.toISOString() ?? null,
  };
}

export const SMS_LOG_SORT_FIELDS = ["createdAt"] as const;

/** Settings → "Yuborilgan SMSlar" (EXP §8 SMS log). */
export async function listSmsLog(
  actor: Actor,
  query: ParsedList<(typeof SMS_LOG_SORT_FIELDS)[number]>,
  filters: SmsLogFilters = {},
  db: DbClient = prisma,
): Promise<Page<SmsLogRowDto>> {
  authorize(actor, "logs.view");
  const where: Prisma.SmsMessageWhereInput = {};
  const scope = branchScope(actor);
  if (scope) where.OR = [{ branchId: scope.branchId }, { branchId: null }];
  if (filters.status) where.status = filters.status;
  if (filters.sentBy === "system") where.sentById = null;
  else if (filters.sentBy) where.sentById = filters.sentBy;
  if (filters.from || filters.to) {
    where.createdAt = {
      ...(filters.from ? { gte: isoToDate(filters.from) } : {}),
      ...(filters.to ? { lt: isoToDate(addDay(filters.to)) } : {}),
    };
  }
  if (query.q) {
    where.AND = [
      {
        OR: [
          { recipientName: { contains: query.q, mode: "insensitive" } },
          { phone: { contains: query.q } },
          { text: { contains: query.q, mode: "insensitive" } },
        ],
      },
    ];
  }
  const [items, total] = await Promise.all([
    db.smsMessage.findMany({
      where,
      include,
      // Rows of one batch share a timestamp; the id keeps their order stable.
      orderBy: [{ createdAt: query.sort.direction }, { id: query.sort.direction }],
      skip: query.skip,
      take: query.take,
    }),
    db.smsMessage.count({ where }),
  ]);
  return { items: items.map(toDto), page: query.page, pageSize: query.pageSize, total };
}

function addDay(iso: string): string {
  const d = isoToDate(iso);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Student profile → SMS tab. */
export async function listStudentSms(
  actor: Actor,
  studentId: string,
  db: DbClient = prisma,
): Promise<SmsLogRowDto[]> {
  authorize(actor, "students.view");
  await mustFind(
    db.student.findFirst({
      where: { id: studentId, ...studentScope(actor) },
      select: { id: true },
    }),
    "errors.studentNotFound",
  );
  const rows = await db.smsMessage.findMany({
    where: { studentId },
    include,
    orderBy: { createdAt: "desc" },
    take: 200,
  });
  return rows.map(toDto);
}
