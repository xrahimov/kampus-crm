import type { Prisma } from "@/generated/prisma/client";
import type { GraduateRecordInput, GraduatesFilters } from "@/lib/validation/reports";
import { recordAudit } from "@/server/audit/audit";
import { prisma, type DbClient } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";
import { authorize, type Actor } from "@/server/rbac/authorize";
import { mustFind } from "@/server/services/settings/shared";

import {
  branchIn,
  countBy,
  dateToIso,
  monthPeriod,
  num,
  pct,
  reportBranch,
  round1,
} from "./shared";

/* "Bitiruvchilar hisoboti" (EXP §10 graduates-reports). */

export interface GraduateResultDto {
  ieltsScore: number | null;
  cefrLevel: string | null;
  university: boolean | null;
  employed: boolean | null;
  note: string | null;
}

export interface GraduateRowDto {
  membershipId: string;
  studentId: string;
  fullName: string;
  groupName: string;
  branchName: string;
  courseName: string;
  teacherName: string | null;
  graduatedAt: string;
  /** Last group exam score as "score/max", or null. */
  examResult: string | null;
  result: GraduateResultDto | null;
}

export interface GraduatesReportDto {
  year: number;
  month: number;
  kpis: {
    count: number;
    bestTeacher: { name: string; count: number } | null;
    avgIelts: number | null;
    commonCefr: string | null;
    universityPercent: number | null;
    employedPercent: number | null;
  };
  rows: GraduateRowDto[];
  options: {
    groups: Array<{ id: string; name: string }>;
    teachers: Array<{ id: string; fullName: string }>;
    courses: Array<{ id: string; name: string }>;
  };
}

const include = {
  student: { select: { fullName: true } },
  graduate: true,
  group: {
    select: {
      id: true,
      name: true,
      courseId: true,
      branch: { select: { name: true } },
      course: { select: { name: true } },
      teachers: {
        where: { role: "MAIN" as const },
        select: { userId: true, user: { select: { fullName: true } } },
        take: 1,
      },
    },
  },
} satisfies Prisma.GroupMembershipInclude;

const resultDto = (g: {
  ieltsScore: Prisma.Decimal | null;
  cefrLevel: string | null;
  university: boolean | null;
  employed: boolean | null;
  note: string | null;
}): GraduateResultDto => ({
  ieltsScore: g.ieltsScore ? num(g.ieltsScore) : null,
  cefrLevel: g.cefrLevel,
  university: g.university,
  employed: g.employed,
  note: g.note,
});

export async function getGraduatesReport(
  actor: Actor,
  filters: GraduatesFilters,
  db: DbClient = prisma,
): Promise<GraduatesReportDto> {
  authorize(actor, "reports.view");
  const scope = reportBranch(actor, filters.branchId);
  const period = monthPeriod(filters.year, filters.month);
  const group: Prisma.GroupWhereInput = { ...branchIn(scope) };
  if (filters.groupId) group.id = filters.groupId;
  if (filters.courseId) group.courseId = filters.courseId;
  if (filters.teacherId) group.teachers = { some: { userId: filters.teacherId } };
  const rowsRaw = await db.groupMembership.findMany({
    where: {
      group,
      status: "GRADUATED",
      leftAt: { gte: period.from, lte: period.to },
      ...(filters.result === "yes" ? { graduate: { isNot: null } } : {}),
      ...(filters.result === "no" ? { graduate: null } : {}),
    },
    include,
    orderBy: [{ leftAt: "desc" }, { id: "asc" }],
  });
  // Latest group exam score of each graduate in their group.
  const results = await db.examResult.findMany({
    where: {
      studentId: { in: rowsRaw.map((m) => m.studentId) },
      exam: { groupId: { in: rowsRaw.map((m) => m.group.id) }, type: "GROUP" },
      score: { not: null },
    },
    select: {
      studentId: true,
      score: true,
      exam: { select: { groupId: true, maxScore: true, date: true } },
    },
    orderBy: { exam: { date: "desc" } },
  });
  const examOf = new Map<string, string>();
  for (const r of results) {
    const key = `${r.studentId}:${r.exam.groupId}`;
    if (!examOf.has(key)) examOf.set(key, `${num(r.score)}/${num(r.exam.maxScore)}`);
  }
  const rows: GraduateRowDto[] = rowsRaw.map((m) => ({
    membershipId: m.id,
    studentId: m.studentId,
    fullName: m.student.fullName,
    groupName: m.group.name,
    branchName: m.group.branch.name,
    courseName: m.group.course.name,
    teacherName: m.group.teachers[0]?.user.fullName ?? null,
    graduatedAt: dateToIso(m.leftAt!),
    examResult: examOf.get(`${m.studentId}:${m.group.id}`) ?? null,
    result: m.graduate ? resultDto(m.graduate) : null,
  }));
  const withResult = rows.map((r) => r.result).filter((r): r is GraduateResultDto => r !== null);
  const ielts = withResult.map((r) => r.ieltsScore).filter((x): x is number => x !== null);
  const cefr = countBy(
    withResult.filter((r) => r.cefrLevel),
    (r) => r.cefrLevel,
  );
  const uni = withResult.filter((r) => r.university !== null);
  const emp = withResult.filter((r) => r.employed !== null);
  const byTeacher = countBy(rows, (r) => r.teacherName).filter((t) => t.name);
  const [groups, teachers, courses] = await Promise.all([
    db.group.findMany({
      where: branchIn(scope),
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.user.findMany({
      where: { groupsTaught: { some: { group: branchIn(scope) } } },
      select: { id: true, fullName: true },
      orderBy: { fullName: "asc" },
    }),
    db.course.findMany({
      where: branchIn(scope),
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);
  return {
    year: period.year,
    month: period.month,
    kpis: {
      count: rows.length,
      bestTeacher: byTeacher[0] ? { name: byTeacher[0].name, count: byTeacher[0].count } : null,
      avgIelts: ielts.length ? round1(ielts.reduce((s, x) => s + x, 0) / ielts.length) : null,
      commonCefr: cefr[0]?.name ?? null,
      universityPercent: uni.length
        ? pct(uni.filter((r) => r.university).length, uni.length)
        : null,
      employedPercent: emp.length ? pct(emp.filter((r) => r.employed).length, emp.length) : null,
    },
    rows,
    options: { groups, teachers, courses },
  };
}

/** "Natija kiritish": the outcome behind the cards, one row per graduated membership. */
export async function setGraduateRecord(
  actor: Actor,
  membershipId: string,
  input: GraduateRecordInput,
  db: DbClient = prisma,
): Promise<GraduateResultDto> {
  authorize(actor, "students.update");
  const membership = await mustFind(
    db.groupMembership.findUnique({
      where: { id: membershipId },
      select: { status: true, group: { select: { branchId: true } } },
    }),
  );
  if (!actor.branchIds.includes(membership.group.branchId)) {
    throw AppError.forbidden("errors.branchForbidden");
  }
  if (membership.status !== "GRADUATED") throw AppError.conflict("errors.notGraduated");
  const data = {
    ieltsScore: input.ieltsScore ?? null,
    cefrLevel: input.cefrLevel ?? null,
    university: input.university ?? null,
    employed: input.employed ?? null,
    note: input.note ?? null,
  };
  return db.$transaction(async (tx) => {
    const row = await tx.graduateRecord.upsert({
      where: { membershipId },
      update: data,
      create: { membershipId, ...data },
    });
    await recordAudit(tx, actor, {
      action: "graduate.record",
      entity: "GroupMembership",
      entityId: membershipId,
      after: data,
      branchId: membership.group.branchId,
    });
    return resultDto(row);
  });
}
