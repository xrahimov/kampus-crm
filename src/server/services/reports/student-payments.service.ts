import type { Prisma } from "@/generated/prisma/client";
import type { Page } from "@/lib/validation/common";
import type { StudentPaymentSortField, StudentPaymentsFilters } from "@/lib/validation/reports";
import { prisma, type DbClient } from "@/server/db/prisma";
import type { ParsedList } from "@/server/http/list-query";
import { authorize, type Actor } from "@/server/rbac/authorize";
import { TEACHER_ROLE_CODES } from "@/server/services/staff/staff.service";
import { dateToIso } from "@/server/services/settings/shared";

import { branchIn, monthPeriod, num, reportBranch } from "./shared";

/* "O'quvchilar to'lovlari" (EXP §10 student-payment): the month's payments, one row each. */

export interface StudentPaymentRowDto {
  id: string;
  studentId: string;
  studentName: string;
  groupId: string;
  groupName: string;
  teacherName: string | null;
  courseName: string;
  amount: number;
  bonus: number;
  refunded: number;
  paidAt: string;
  effectiveMonth: string;
  comment: string | null;
  receivedByName: string | null;
  methodName: string | null;
}

export interface StudentPaymentsOptions {
  groups: Array<{ id: string; name: string }>;
  methods: Array<{ id: string; name: string }>;
  teachers: Array<{ id: string; fullName: string }>;
  courses: Array<{ id: string; name: string }>;
  staff: Array<{ id: string; fullName: string }>;
}

const include = {
  student: { select: { fullName: true } },
  paymentMethod: { select: { name: true } },
  receivedBy: { select: { fullName: true } },
  refunds: { select: { amount: true } },
  membership: {
    select: {
      group: {
        select: {
          id: true,
          name: true,
          course: { select: { name: true } },
          teachers: {
            where: { role: "MAIN" as const },
            select: { user: { select: { fullName: true } } },
            take: 1,
          },
        },
      },
    },
  },
} satisfies Prisma.PaymentInclude;

function where(
  actor: Actor,
  filters: StudentPaymentsFilters,
  q?: string,
): Prisma.PaymentWhereInput {
  const scope = reportBranch(actor, filters.branchId);
  const period = monthPeriod(filters.year, filters.month);
  const range = { gte: period.from, lte: period.to };
  const group: Prisma.GroupWhereInput = {};
  if (filters.courseId) group.courseId = filters.courseId;
  if (filters.teacherId) group.teachers = { some: { userId: filters.teacherId } };
  return {
    ...scope,
    ...(filters.byPaidAt ? { paidAt: range } : { effectiveMonth: range }),
    ...(filters.groupId ? { membership: { groupId: filters.groupId } } : {}),
    ...(Object.keys(group).length
      ? { membership: { ...(filters.groupId ? { groupId: filters.groupId } : {}), group } }
      : {}),
    ...(filters.paymentMethodId ? { paymentMethodId: filters.paymentMethodId } : {}),
    ...(filters.receivedById ? { receivedById: filters.receivedById } : {}),
    ...(filters.bonus === "yes"
      ? { bonus: { gt: 0 } }
      : filters.bonus === "no"
        ? { bonus: 0 }
        : {}),
    ...(q ? { student: { fullName: { contains: q, mode: "insensitive" } } } : {}),
  };
}

export async function listStudentPayments(
  actor: Actor,
  query: ParsedList<StudentPaymentSortField>,
  filters: StudentPaymentsFilters,
  db: DbClient = prisma,
): Promise<Page<StudentPaymentRowDto> & { totalAmount: number }> {
  authorize(actor, "reports.payments");
  const w = where(actor, filters, query.q);
  const [total, sum, rows] = await Promise.all([
    db.payment.count({ where: w }),
    db.payment.aggregate({ where: w, _sum: { amount: true } }),
    db.payment.findMany({
      where: w,
      include,
      orderBy: [{ [query.sort.field]: query.sort.direction }, { id: "asc" }],
      skip: query.skip,
      take: query.take,
    }),
  ]);
  return {
    items: rows.map((p) => ({
      id: p.id,
      studentId: p.studentId,
      studentName: p.student.fullName,
      groupId: p.membership.group.id,
      groupName: p.membership.group.name,
      teacherName: p.membership.group.teachers[0]?.user.fullName ?? null,
      courseName: p.membership.group.course.name,
      amount: num(p.amount),
      bonus: num(p.bonus),
      refunded: p.refunds.reduce((s, r) => s + num(r.amount), 0),
      paidAt: dateToIso(p.paidAt),
      effectiveMonth: dateToIso(p.effectiveMonth).slice(0, 7),
      comment: p.comment,
      receivedByName: p.receivedBy?.fullName ?? null,
      methodName: p.paymentMethod?.name ?? null,
    })),
    page: query.page,
    pageSize: query.pageSize,
    total,
    totalAmount: num(sum._sum.amount),
  };
}

export async function getStudentPaymentsOptions(
  actor: Actor,
  branchId?: string,
  db: DbClient = prisma,
): Promise<StudentPaymentsOptions> {
  authorize(actor, "reports.payments");
  const scope = reportBranch(actor, branchId);
  const organizationId = actor.organizationId;
  const [groups, methods, teachers, courses, staff] = await Promise.all([
    db.group.findMany({
      where: branchIn(scope),
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.paymentMethod.findMany({
      where: { organizationId },
      select: { id: true, name: true },
      orderBy: { sortOrder: "asc" },
    }),
    db.user.findMany({
      where: {
        organizationId,
        isArchived: false,
        roles: { some: { role: { code: { in: [...TEACHER_ROLE_CODES] } } } },
      },
      select: { id: true, fullName: true },
      orderBy: { fullName: "asc" },
    }),
    db.course.findMany({
      where: { ...branchIn(scope), isArchived: false },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.user.findMany({
      where: { paymentsReceived: { some: scope } },
      select: { id: true, fullName: true },
      orderBy: { fullName: "asc" },
    }),
  ]);
  return { groups, methods, teachers, courses, staff };
}
