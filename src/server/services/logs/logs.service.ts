import type { Prisma } from "@/generated/prisma/client";
import type { Page } from "@/lib/validation/common";
import type { ActionLogFilters, LoginLogFilters } from "@/lib/validation/integrations";
import { prisma, type DbClient } from "@/server/db/prisma";
import type { ParsedList } from "@/server/http/list-query";
import { authorize, branchScope, type Actor } from "@/server/rbac/authorize";
import { isoToDate } from "@/server/services/settings/shared";

/* Settings → "Tizimga kirishlar" and the action feed (EXP §8 Login log, Action log). A-89. */

export interface LoginLogRowDto {
  id: string;
  userName: string | null;
  phone: string;
  success: boolean;
  ip: string | null;
  createdAt: string;
}

export interface ActionLogRowDto {
  id: string;
  action: string;
  entity: string;
  entityId: string;
  actorName: string | null;
  actorPhone: string | null;
  branchName: string | null;
  /** The person the action is about, when the audit row points at a student. */
  subjectName: string | null;
  before: unknown;
  after: unknown;
  createdAt: string;
}

export const LOGIN_LOG_SORT_FIELDS = ["createdAt"] as const;
export const ACTION_LOG_SORT_FIELDS = ["createdAt"] as const;

function dateRange(from?: string, to?: string): Prisma.DateTimeFilter | undefined {
  if (!from && !to) return undefined;
  const end = to ? isoToDate(to) : null;
  if (end) end.setUTCDate(end.getUTCDate() + 1);
  return { ...(from ? { gte: isoToDate(from) } : {}), ...(end ? { lt: end } : {}) };
}

export async function listLoginLogs(
  actor: Actor,
  query: ParsedList<(typeof LOGIN_LOG_SORT_FIELDS)[number]>,
  filters: LoginLogFilters = {},
  db: DbClient = prisma,
): Promise<Page<LoginLogRowDto>> {
  authorize(actor, "logs.view");
  const where: Prisma.LoginLogWhereInput = {};
  if (filters.success) where.success = filters.success === "true";
  const range = dateRange(filters.from, filters.to);
  if (range) where.createdAt = range;
  if (query.q) {
    where.OR = [
      { phone: { contains: query.q } },
      { user: { fullName: { contains: query.q, mode: "insensitive" } } },
    ];
  }
  const [items, total] = await Promise.all([
    db.loginLog.findMany({
      where,
      include: { user: { select: { fullName: true } } },
      orderBy: { createdAt: query.sort.direction },
      skip: query.skip,
      take: query.take,
    }),
    db.loginLog.count({ where }),
  ]);
  return {
    items: items.map((r) => ({
      id: r.id,
      userName: r.user?.fullName ?? null,
      phone: r.phone,
      success: r.success,
      ip: r.ip,
      createdAt: r.createdAt.toISOString(),
    })),
    page: query.page,
    pageSize: query.pageSize,
    total,
  };
}

export async function listActionLog(
  actor: Actor,
  query: ParsedList<(typeof ACTION_LOG_SORT_FIELDS)[number]>,
  filters: ActionLogFilters = {},
  db: DbClient = prisma,
): Promise<Page<ActionLogRowDto>> {
  authorize(actor, "logs.view");
  const where: Prisma.AuditLogWhereInput = {};
  const scope = branchScope(actor);
  if (scope) where.OR = [{ branchId: scope.branchId }, { branchId: null }];
  if (filters.entity) where.entity = filters.entity;
  if (filters.actorId) where.actorId = filters.actorId;
  const range = dateRange(filters.from, filters.to);
  if (range) where.createdAt = range;
  if (query.q) {
    where.AND = [
      {
        OR: [
          { action: { contains: query.q, mode: "insensitive" } },
          { actor: { fullName: { contains: query.q, mode: "insensitive" } } },
          { actor: { phone: { contains: query.q } } },
        ],
      },
    ];
  }
  const [rows, total] = await Promise.all([
    db.auditLog.findMany({
      where,
      include: {
        actor: { select: { fullName: true, phone: true } },
        branch: { select: { name: true } },
      },
      orderBy: { createdAt: query.sort.direction },
      skip: query.skip,
      take: query.take,
    }),
    db.auditLog.count({ where }),
  ]);
  // Resolve the student behind payment/membership rows for the "student + phone" column.
  const studentIds = new Set<string>();
  const membershipIds = new Set<string>();
  const paymentIds = new Set<string>();
  for (const r of rows) {
    if (r.entity === "Student") studentIds.add(r.entityId);
    if (r.entity === "GroupMembership") membershipIds.add(r.entityId);
    if (r.entity === "Payment") paymentIds.add(r.entityId);
  }
  const [memberships, payments] = await Promise.all([
    membershipIds.size
      ? db.groupMembership.findMany({
          where: { id: { in: [...membershipIds] } },
          select: { id: true, studentId: true },
        })
      : [],
    paymentIds.size
      ? db.payment.findMany({
          where: { id: { in: [...paymentIds] } },
          select: { id: true, studentId: true },
        })
      : [],
  ]);
  const studentOfMembership = new Map(memberships.map((m) => [m.id, m.studentId]));
  const studentOfPayment = new Map(payments.map((p) => [p.id, p.studentId]));
  for (const id of [...studentOfMembership.values(), ...studentOfPayment.values()])
    studentIds.add(id);
  const students = studentIds.size
    ? await db.student.findMany({
        where: { id: { in: [...studentIds] } },
        select: { id: true, fullName: true, phone: true },
      })
    : [];
  const studentName = new Map(
    students.map((s) => [s.id, s.phone ? `${s.fullName} · ${s.phone}` : s.fullName]),
  );
  const subjectOf = (r: { entity: string; entityId: string }) => {
    const id =
      r.entity === "Student"
        ? r.entityId
        : r.entity === "GroupMembership"
          ? studentOfMembership.get(r.entityId)
          : r.entity === "Payment"
            ? studentOfPayment.get(r.entityId)
            : undefined;
    return id ? (studentName.get(id) ?? null) : null;
  };
  return {
    items: rows.map((r) => ({
      id: r.id,
      action: r.action,
      entity: r.entity,
      entityId: r.entityId,
      actorName: r.actor?.fullName ?? null,
      actorPhone: r.actor?.phone ?? null,
      branchName: r.branch?.name ?? null,
      subjectName: subjectOf(r),
      before: r.before,
      after: r.after,
      createdAt: r.createdAt.toISOString(),
    })),
    page: query.page,
    pageSize: query.pageSize,
    total,
  };
}

/** Staff who appear as actors, for the filter. */
export async function listActionLogActors(
  actor: Actor,
  db: DbClient = prisma,
): Promise<Array<{ id: string; fullName: string }>> {
  authorize(actor, "logs.view");
  const rows = await db.auditLog.groupBy({ by: ["actorId"], where: { actorId: { not: null } } });
  const ids = rows.map((r) => r.actorId).filter((x): x is string => Boolean(x));
  const users = await db.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, fullName: true },
    orderBy: { fullName: "asc" },
  });
  return users;
}
