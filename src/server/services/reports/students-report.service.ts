import type { Prisma } from "@/generated/prisma/client";
import type { StudentsReportFilters } from "@/lib/validation/reports";
import { prisma, type DbClient } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";
import { authorize, type Actor } from "@/server/rbac/authorize";

import {
  branchIn,
  dateToIso,
  isoToDate,
  monthPeriod,
  num,
  pct,
  reportBranch,
  round1,
} from "./shared";

/* "O'quvchilar hisoboti" (EXP §10 students-reports): KPIs, DAVOMATLAR HISOBOTI and O'ZLASHTIRISH DARAJASI. */

export interface AttendanceReportRowDto {
  groupId: string;
  groupName: string;
  teacherName: string | null;
  students: number;
  lessons: number;
  expected: number;
  present: number;
  absent: number;
  unmarked: number;
}

export interface PerformanceRowDto {
  studentId: string;
  fullName: string;
  groups: string[];
  teachers: string[];
  courses: string[];
  grades: Array<{ groupName: string; average: number | null }>;
  average: number | null;
}

export interface StudentsReportDto {
  from: string;
  to: string;
  kpis: {
    total: number;
    newInPeriod: number;
    multiCourse: number;
    attendancePercent: number | null;
    gradeAverage: number | null;
    /** No student app in v1 (A-93). */
    appUsage: null;
  };
  attendance: {
    totals: { expected: number; present: number; absent: number; unmarked: number };
    rows: AttendanceReportRowDto[];
  };
  performance: { rows: PerformanceRowDto[]; page: number; pageSize: number; total: number };
  options: {
    groups: Array<{ id: string; name: string }>;
    teachers: Array<{ id: string; fullName: string }>;
  };
}

const LEFT = ["ARCHIVED", "GRADUATED"] as const;
const PERFORMANCE_PAGE = 10;

export async function getStudentsReport(
  actor: Actor,
  filters: StudentsReportFilters,
  db: DbClient = prisma,
  performancePageSize = PERFORMANCE_PAGE,
): Promise<StudentsReportDto> {
  authorize(actor, "reports.view");
  const scope = reportBranch(actor, filters.branchId);
  const period = monthPeriod(filters.year, filters.month);
  const from = filters.from ?? dateToIso(period.from);
  const to = filters.to ?? dateToIso(period.to);
  if (to < from) throw AppError.validation({ to: ["validation.endAfterStart"] });
  const fromDate = isoToDate(from);
  const toDate = isoToDate(to);
  const today = new Date();

  const groupWhere: Prisma.GroupWhereInput = { ...branchIn(scope) };
  if (filters.groupId) groupWhere.id = filters.groupId;
  if (filters.teacherId) groupWhere.teachers = { some: { userId: filters.teacherId } };
  if (filters.status && filters.status !== "ALL") groupWhere.status = filters.status;
  else if (!filters.status) groupWhere.status = { not: "ARCHIVED" };

  const groups = await db.group.findMany({
    where: groupWhere,
    select: {
      id: true,
      name: true,
      course: { select: { name: true } },
      teachers: {
        where: { role: "MAIN" },
        select: { user: { select: { fullName: true } } },
        take: 1,
      },
      memberships: {
        where: { status: { notIn: [...LEFT] } },
        select: {
          id: true,
          studentId: true,
          joinedAt: true,
          student: { select: { fullName: true } },
        },
      },
      lessons: {
        where: { date: { gte: fromDate, lte: toDate < today ? toDate : today } },
        select: {
          id: true,
          attendances: { select: { membershipId: true, status: true } },
          grades: { select: { membershipId: true, score: true } },
        },
      },
    },
    orderBy: { name: "asc" },
  });

  const attendanceRows: AttendanceReportRowDto[] = [];
  const totals = { expected: 0, present: 0, absent: 0, unmarked: 0 };
  const students = new Map<
    string,
    PerformanceRowDto & { courseSet: Set<string>; scores: number[] }
  >();
  let allPresent = 0;
  let allMarked = 0;
  const allScores: number[] = [];
  const newStudents = new Set<string>();

  for (const g of groups) {
    const teacherName = g.teachers[0]?.user.fullName ?? null;
    let present = 0;
    let absent = 0;
    let marked = 0;
    const perStudentScores = new Map<string, number[]>();
    for (const l of g.lessons) {
      for (const a of l.attendances) {
        if (a.status === "PRESENT") present += 1;
        else if (a.status === "ABSENT") absent += 1;
        if (a.status !== "NOT_MARKED") marked += 1;
      }
      for (const gr of l.grades) {
        const score = num(gr.score);
        allScores.push(score);
        const list = perStudentScores.get(gr.membershipId) ?? [];
        list.push(score);
        perStudentScores.set(gr.membershipId, list);
      }
    }
    const expected = g.memberships.length * g.lessons.length;
    const unmarked = Math.max(0, expected - marked);
    attendanceRows.push({
      groupId: g.id,
      groupName: g.name,
      teacherName,
      students: g.memberships.length,
      lessons: g.lessons.length,
      expected,
      present,
      absent,
      unmarked,
    });
    totals.expected += expected;
    totals.present += present;
    totals.absent += absent;
    totals.unmarked += unmarked;
    allPresent += present;
    allMarked += present + absent;

    for (const m of g.memberships) {
      if (m.joinedAt >= fromDate && m.joinedAt <= toDate) newStudents.add(m.studentId);
      let row = students.get(m.studentId);
      if (!row) {
        row = {
          studentId: m.studentId,
          fullName: m.student.fullName,
          groups: [],
          teachers: [],
          courses: [],
          grades: [],
          average: null,
          courseSet: new Set(),
          scores: [],
        };
        students.set(m.studentId, row);
      }
      row.groups.push(g.name);
      if (teacherName && !row.teachers.includes(teacherName)) row.teachers.push(teacherName);
      row.courseSet.add(g.course.name);
      const scores = perStudentScores.get(m.id) ?? [];
      row.scores.push(...scores);
      row.grades.push({
        groupName: g.name,
        average: scores.length ? round1(scores.reduce((s, x) => s + x, 0) / scores.length) : null,
      });
    }
  }

  const performance = [...students.values()]
    .map(({ courseSet, scores, ...row }) => ({
      ...row,
      courses: [...courseSet],
      average: scores.length ? round1(scores.reduce((s, x) => s + x, 0) / scores.length) : null,
      multi: courseSet.size,
    }))
    .sort((a, b) => (b.average ?? -1) - (a.average ?? -1) || a.fullName.localeCompare(b.fullName));
  const page = filters.page ?? 1;
  const [groupOptions, teacherOptions] = await Promise.all([
    db.group.findMany({
      where: { ...branchIn(scope), status: { not: "ARCHIVED" } },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    db.user.findMany({
      where: { groupsTaught: { some: { group: branchIn(scope) } } },
      select: { id: true, fullName: true },
      orderBy: { fullName: "asc" },
    }),
  ]);

  return {
    from,
    to,
    kpis: {
      total: students.size,
      newInPeriod: newStudents.size,
      multiCourse: performance.filter((s) => s.multi >= 2).length,
      attendancePercent: allMarked ? pct(allPresent, allMarked) : null,
      gradeAverage: allScores.length
        ? round1(allScores.reduce((s, x) => s + x, 0) / allScores.length)
        : null,
      appUsage: null,
    },
    attendance: { totals, rows: attendanceRows },
    performance: {
      rows: performance
        .slice((page - 1) * performancePageSize, page * performancePageSize)
        .map(({ multi, ...r }) => {
          void multi;
          return r;
        }),
      page,
      pageSize: performancePageSize,
      total: performance.length,
    },
    options: { groups: groupOptions, teachers: teacherOptions },
  };
}
