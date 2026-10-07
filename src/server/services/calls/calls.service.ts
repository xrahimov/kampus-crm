import type { Prisma } from "@/generated/prisma/client";
import type { Page } from "@/lib/validation/common";
import type {
  CallDirection,
  CallFilters,
  CallStatus,
  TelephonyWebhookInput,
} from "@/lib/validation/integrations";
import { recordAudit } from "@/server/audit/audit";
import { prisma, type DbClient } from "@/server/db/prisma";
import type { ParsedList } from "@/server/http/list-query";
import { authorize, branchScope, type Actor } from "@/server/rbac/authorize";
import { getTelephonyProvider } from "@/server/services/integrations/integrations.service";
import { isoToDate, mustFind } from "@/server/services/settings/shared";
import { studentScope } from "@/server/services/students/students.service";

/* "Qo'ng'iroqlar" (EXP §8 Calls) and the student's CALLS tab. A-86. */

export interface CallDto {
  id: string;
  direction: CallDirection;
  status: CallStatus;
  fromPhone: string;
  toPhone: string;
  staffName: string | null;
  studentId: string | null;
  studentName: string | null;
  durationSeconds: number;
  recordingUrl: string | null;
  startedAt: string;
}

const include = {
  staff: { select: { fullName: true } },
  student: { select: { fullName: true } },
} as const;

function toDto(row: Prisma.CallLogGetPayload<{ include: typeof include }>): CallDto {
  return {
    id: row.id,
    direction: row.direction,
    status: row.status,
    fromPhone: row.fromPhone,
    toPhone: row.toPhone,
    staffName: row.staff?.fullName ?? null,
    studentId: row.studentId,
    studentName: row.student?.fullName ?? null,
    durationSeconds: row.durationSeconds,
    recordingUrl: row.recordingUrl,
    startedAt: row.startedAt.toISOString(),
  };
}

export const CALL_SORT_FIELDS = ["startedAt"] as const;

function addDay(iso: string): Date {
  const d = isoToDate(iso);
  d.setUTCDate(d.getUTCDate() + 1);
  return d;
}

export async function listCalls(
  actor: Actor,
  query: ParsedList<(typeof CALL_SORT_FIELDS)[number]>,
  filters: CallFilters = {},
  db: DbClient = prisma,
): Promise<Page<CallDto>> {
  authorize(actor, "logs.view");
  const where: Prisma.CallLogWhereInput = {};
  const scope = branchScope(actor);
  if (scope) where.OR = [{ branchId: scope.branchId }, { branchId: null }];
  if (filters.direction) where.direction = filters.direction;
  if (filters.status) where.status = filters.status;
  if (filters.from || filters.to) {
    where.startedAt = {
      ...(filters.from ? { gte: isoToDate(filters.from) } : {}),
      ...(filters.to ? { lt: addDay(filters.to) } : {}),
    };
  }
  if (query.q) {
    where.AND = [
      {
        OR: [
          { fromPhone: { contains: query.q } },
          { toPhone: { contains: query.q } },
          { student: { fullName: { contains: query.q, mode: "insensitive" } } },
          { staff: { fullName: { contains: query.q, mode: "insensitive" } } },
        ],
      },
    ];
  }
  const [items, total] = await Promise.all([
    db.callLog.findMany({
      where,
      include,
      orderBy: { startedAt: query.sort.direction },
      skip: query.skip,
      take: query.take,
    }),
    db.callLog.count({ where }),
  ]);
  return { items: items.map(toDto), page: query.page, pageSize: query.pageSize, total };
}

export async function listStudentCalls(
  actor: Actor,
  studentId: string,
  db: DbClient = prisma,
): Promise<CallDto[]> {
  authorize(actor, "students.view");
  await mustFind(
    db.student.findFirst({
      where: { id: studentId, ...studentScope(actor) },
      select: { id: true },
    }),
    "errors.studentNotFound",
  );
  const rows = await db.callLog.findMany({
    where: { studentId },
    include,
    orderBy: { startedAt: "desc" },
    take: 200,
  });
  return rows.map(toDto);
}

/** Click-to-call from the profile: the provider dials, the row starts as an outbound call. */
export async function startCall(
  actor: Actor,
  studentId: string,
  phone: string,
  db: DbClient = prisma,
): Promise<CallDto & { adapter: string }> {
  authorize(actor, "students.view");
  const student = await mustFind(
    db.student.findFirst({ where: { id: studentId, ...studentScope(actor) } }),
    "errors.studentNotFound",
  );
  const staff = await mustFind(db.user.findUnique({ where: { id: actor.userId } }));
  const provider = getTelephonyProvider();
  const { externalId } = await provider.originateCall({ from: staff.phone, to: phone });
  const organizationId = actor.organizationId;
  const row = await db.$transaction(async (tx) => {
    const created = await tx.callLog.create({
      data: {
        organizationId,
        branchId: student.branchId,
        direction: "OUTBOUND",
        status: "ANSWERED",
        fromPhone: staff.phone,
        toPhone: phone,
        staffId: actor.userId,
        studentId,
        externalId,
        startedAt: new Date(),
      },
      include,
    });
    await recordAudit(tx, actor, {
      action: "call.start",
      entity: "CallLog",
      entityId: created.id,
      after: { studentId, toPhone: phone, adapter: provider.name },
      branchId: student.branchId,
    });
    return created;
  });
  return { ...toDto(row), adapter: provider.name };
}

/** `/webhooks/telephony`: upsert by the provider's call id; links the number to a student or staff. */
export async function recordWebhookCall(
  db: DbClient,
  organizationId: string,
  input: TelephonyWebhookInput,
): Promise<CallDto> {
  // The webhook secret named the centre (A-108); only its people are matched.
  const customerPhone = input.direction === "INBOUND" ? input.from : input.to;
  const staffPhone = input.direction === "INBOUND" ? input.to : input.from;
  const [student, staff] = await Promise.all([
    db.student.findFirst({
      where: { phone: customerPhone, isArchived: false, branch: { organizationId } },
      select: { id: true, branchId: true },
    }),
    db.user.findFirst({ where: { phone: staffPhone, organizationId }, select: { id: true } }),
  ]);
  const data = {
    organizationId,
    branchId: student?.branchId ?? null,
    direction: input.direction,
    status: input.status,
    fromPhone: input.from,
    toPhone: input.to,
    staffId: staff?.id ?? null,
    studentId: student?.id ?? null,
    durationSeconds: input.durationSeconds,
    recordingUrl: input.recordingUrl ?? null,
    startedAt: new Date(input.startedAt),
  };
  const row = await db.callLog.upsert({
    where: { externalId: input.externalId },
    create: { ...data, externalId: input.externalId },
    update: data,
    include,
  });
  return toDto(row);
}
