import type { NotificationKind, Prisma } from "@/generated/prisma/client";
import { hasPermission, type Permission } from "@/lib/rbac/permissions";
import type { Page } from "@/lib/validation/common";
import type { MarkReadInput, NotificationsQuery } from "@/lib/validation/dashboard";
import { prisma, type DbClient } from "@/server/db/prisma";
import type { Actor } from "@/server/rbac/authorize";
import { membershipBalances } from "@/server/services/students/balances";

/* EXP §11 bell: in-app notifications for staff (A-97). */

export interface NotificationDto {
  id: string;
  kind: NotificationKind;
  params: Record<string, string | number>;
  href: string | null;
  readAt: string | null;
  createdAt: string;
}

const PAGE_SIZE = 20;

const toDto = (n: {
  id: string;
  kind: NotificationKind;
  params: Prisma.JsonValue;
  href: string | null;
  readAt: Date | null;
  createdAt: Date;
}): NotificationDto => ({
  id: n.id,
  kind: n.kind,
  params: (n.params ?? {}) as Record<string, string | number>,
  href: n.href,
  readAt: n.readAt?.toISOString() ?? null,
  createdAt: n.createdAt.toISOString(),
});

/**
 * Creates one notification per staff member who holds `permission` and works in
 * `branchId` (a user who may see every branch always qualifies). The actor who
 * caused the event is left out.
 */
export async function notifyUsers(
  tx: DbClient,
  input: {
    kind: NotificationKind;
    params: Record<string, string | number>;
    href?: string | null;
    branchId?: string | null;
    permission: Permission;
    excludeUserId?: string | null;
  },
): Promise<number> {
  const users = await tx.user.findMany({
    where: {
      isArchived: false,
      ...(input.excludeUserId ? { id: { not: input.excludeUserId } } : {}),
    },
    select: {
      id: true,
      roles: { select: { role: { select: { permissions: true, isActive: true } } } },
      branches: { select: { branchId: true } },
    },
  });
  const recipients = users.filter((u) => {
    const grants = u.roles.filter((r) => r.role.isActive).flatMap((r) => r.role.permissions);
    if (!hasPermission(grants, input.permission)) return false;
    if (!input.branchId) return true;
    const allBranches = grants.includes("*") || grants.includes("settings.org");
    return allBranches || u.branches.some((b) => b.branchId === input.branchId);
  });
  if (recipients.length === 0) return 0;
  await tx.notification.createMany({
    data: recipients.map((u) => ({
      userId: u.id,
      kind: input.kind,
      params: input.params,
      href: input.href ?? null,
      branchId: input.branchId ?? null,
    })),
  });
  return recipients.length;
}

export async function listNotifications(
  actor: Actor,
  query: NotificationsQuery,
  db: DbClient = prisma,
): Promise<Page<NotificationDto> & { unread: number }> {
  const where: Prisma.NotificationWhereInput = {
    userId: actor.userId,
    ...(query.unread ? { readAt: null } : {}),
  };
  const [total, unread, rows] = await Promise.all([
    db.notification.count({ where }),
    db.notification.count({ where: { userId: actor.userId, readAt: null } }),
    db.notification.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (query.page - 1) * PAGE_SIZE,
      take: PAGE_SIZE,
    }),
  ]);
  return { items: rows.map(toDto), total, page: query.page, pageSize: PAGE_SIZE, unread };
}

export async function unreadCount(actor: Actor, db: DbClient = prisma): Promise<number> {
  return db.notification.count({ where: { userId: actor.userId, readAt: null } });
}

export async function markRead(
  actor: Actor,
  input: MarkReadInput,
  db: DbClient = prisma,
): Promise<{ marked: number; unread: number }> {
  const result = await db.notification.updateMany({
    where: {
      userId: actor.userId,
      readAt: null,
      ...(input.all ? {} : { id: { in: input.ids ?? [] } }),
    },
    data: { readAt: new Date() },
  });
  return { marked: result.count, unread: await unreadCount(actor, db) };
}

/**
 * Daily part (runs with the `auto-sms.daily` job): today's student birthdays for
 * the branch staff and a debtor count for whoever takes payments. Keyed by day,
 * so a second run adds nothing.
 */
export async function runDailyNotifications(
  db: DbClient,
  todayIso: string,
): Promise<{ created: number }> {
  const marker = `daily:${todayIso}`;
  const already = await db.notification.findFirst({
    where: { kind: { in: ["BIRTHDAY", "DEBTORS"] }, params: { path: ["day"], equals: todayIso } },
    select: { id: true },
  });
  if (already) return { created: 0 };
  let created = 0;
  const [year, month, day] = todayIso.split("-").map(Number) as [number, number, number];
  const birthdays = await db.$queryRaw<Array<{ id: string; fullName: string; branchId: string }>>`
    SELECT id, "fullName", "branchId" FROM "Student"
    WHERE "isArchived" = false AND "birthDate" IS NOT NULL
      AND EXTRACT(MONTH FROM "birthDate") = ${month}
      AND EXTRACT(DAY FROM "birthDate") = ${day}`;
  for (const s of birthdays) {
    created += await notifyUsers(db, {
      kind: "BIRTHDAY",
      params: { name: s.fullName, day: todayIso, year },
      href: `/students/${s.id}`,
      branchId: s.branchId,
      permission: "students.view",
    });
  }
  const active = await db.groupMembership.findMany({
    where: { status: "ACTIVE", group: { status: "ACTIVE" } },
    select: { id: true, studentId: true, group: { select: { branchId: true } } },
  });
  const balances = await membershipBalances(
    db,
    active.map((m) => m.id),
  );
  const debtorsByBranch = new Map<string, Set<string>>();
  for (const m of active) {
    const b = balances.get(m.id);
    if (!b || b.balance >= 0) continue;
    const set = debtorsByBranch.get(m.group.branchId) ?? new Set<string>();
    set.add(m.studentId);
    debtorsByBranch.set(m.group.branchId, set);
  }
  for (const [branchId, students] of debtorsByBranch) {
    created += await notifyUsers(db, {
      kind: "DEBTORS",
      params: { count: students.size, day: todayIso, marker },
      href: "/students?paymentStatus=DEBTOR",
      branchId,
      permission: "payments.create",
    });
  }
  return { created };
}
