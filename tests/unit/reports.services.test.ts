/**
 * Phase 12 against the real database: the Excel workbook round trip, student and
 * member imports, and the seven reports. Rows carry a run-specific tag and are
 * removed at the end.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/rbac/default-roles";
import { buildWorkbook, readFirstSheet } from "@/server/excel/workbook";
import { prisma } from "@/server/db/prisma";
import type { Actor } from "@/server/rbac/authorize";
import { createGroup } from "@/server/services/groups/groups.service";
import { markAttendance, setGrades } from "@/server/services/groups/lessons.service";
import {
  addMember,
  transferMember,
  updateMembership,
} from "@/server/services/groups/memberships.service";
import { createBoard, createColumn } from "@/server/services/leads/boards.service";
import { createLead, updateLead } from "@/server/services/leads/leads.service";
import {
  getChurnReport,
  createLeaveReason,
  deleteLeaveReason,
  listLeaveReasons,
  updateLeaveReason,
} from "@/server/services/reports/churn.service";
import { getGraduatesReport, setGraduateRecord } from "@/server/services/reports/graduates.service";
import { getLeadsReport } from "@/server/services/reports/leads-report.service";
import { getPaymentsReport } from "@/server/services/reports/payments-report.service";
import { getCenterStatistics } from "@/server/services/reports/statistics.service";
import { listStudentPayments } from "@/server/services/reports/student-payments.service";
import { getStudentsReport } from "@/server/services/reports/students-report.service";
import { createBranch } from "@/server/services/settings/branches.service";
import { createCourse } from "@/server/services/settings/courses.service";
import { createPaymentMethod } from "@/server/services/settings/payment-methods.service";
import { createRoom } from "@/server/services/settings/rooms.service";
import {
  importMembers,
  importStudents,
  normalizeDate,
  normalizePhone,
} from "@/server/services/students/import.service";
import { createPayment } from "@/server/services/students/payments.service";
import { DEMO_ORG_ID, demoBranchIds } from "./support/tenant";

const RUN = String(Date.now() % 100_000).padStart(5, "0");
const TAG = `r${RUN}`;
const phone = (n: number) => `+99894${RUN}${String(n).padStart(2, "0")}`;

const actor = (fullName: string, roles: string[], permissions: string[]): Actor => ({
  userId: "",
  fullName,
  roles,
  permissions,
  organizationId: DEMO_ORG_ID,
  branchIds: [],
  activeBranchId: null,
});
const ceo = actor("CEO", ["CEO"], ["*"]);
const teacher = actor("Teacher", ["TEACHER"], [...DEFAULT_ROLE_PERMISSIONS.TEACHER]);

// The current month in Tashkent, where every report defaults to.
const now = new Date(Date.now() + 5 * 60 * 60 * 1000);
const YEAR = now.getUTCFullYear();
const MONTH = now.getUTCMonth() + 1;
const MM = String(MONTH).padStart(2, "0");
const day = (d: number) => `${YEAR}-${MM}-${String(d).padStart(2, "0")}`;
const MONTH_START = day(1);

let branchA: string;
let courseA: string;
let roomA: string;
let groupA: string;
let groupB: string;
let methodId: string;
let alice: { id: string; studentId: string };
let bob: { id: string; studentId: string };
let carol: { id: string; studentId: string };
let columnId: string;
let sourceId: string;
const list = {
  page: 1,
  pageSize: 50,
  skip: 0,
  take: 50,
  sort: { field: "paidAt" as const, direction: "desc" as const },
};

beforeAll(async () => {
  const roles = await prisma.role.findMany({ where: { code: { in: ["TEACHER"] } } });
  for (const [a, n, code] of [
    [ceo, 1, null],
    [teacher, 2, "TEACHER"],
  ] as const) {
    const user = await prisma.user.create({
      data: {
        phone: phone(n),
        fullName: `${TAG} ${a.fullName}`,
        passwordHash: "x",
        organizationId: DEMO_ORG_ID,
      },
    });
    a.userId = user.id;
    if (code) {
      await prisma.userRole.create({ data: { userId: user.id, roleId: roles[0]!.id } });
    }
  }
  branchA = (await createBranch(ceo, { name: `${TAG} A`, isActive: true })).id;
  ceo.branchIds = await demoBranchIds();
  ceo.activeBranchId = branchA;
  await prisma.userBranch.create({ data: { userId: teacher.userId, branchId: branchA } });
  teacher.branchIds = [branchA];
  courseA = (
    await createCourse(ceo, {
      branchId: branchA,
      name: `${TAG} English`,
      description: undefined,
      price: 500_000,
      durationMonths: 3,
      gradingSystemId: null,
      color: null,
    })
  ).id;
  roomA = (await createRoom(ceo, { branchId: branchA, name: `${TAG} Room`, capacity: 10 })).id;
  const group = (name: string, start: string) =>
    createGroup(ceo, {
      branchId: branchA,
      name,
      courseId: courseA,
      gradingSystemId: null,
      weekdayPattern: "EVEN",
      slots: [2, 4, 6].map((weekday) => ({
        weekday,
        startTime: "10:00",
        endTime: "11:30",
        roomId: roomA,
      })),
      teachers: [{ userId: teacher.userId, role: "MAIN", shareType: "PERCENT", shareValue: 40 }],
      startDate: start,
      endDate: null,
      status: "ACTIVE",
    });
  groupA = (await group(`${TAG} GE-A`, MONTH_START)).id;
  groupB = (await group(`${TAG} GE-B`, MONTH_START)).id;
  methodId = (await createPaymentMethod(ceo, { name: `${TAG} Cash`, isActive: true, sortOrder: 0 }))
    .id;
  const member = (fullName: string, n: number) =>
    addMember(ceo, groupA, {
      newStudent: { fullName, phone: phone(n) },
      joinedAt: MONTH_START,
      status: "ACTIVE",
      customPrice: null,
      note: null,
    });
  alice = await member(`${TAG} Alice`, 11);
  bob = await member(`${TAG} Bob`, 12);
  carol = await member(`${TAG} Carol`, 13);
  const board = await createBoard(ceo, { branchId: branchA, name: `${TAG} Board` });
  columnId = (await createColumn(ceo, board.id, { name: `${TAG} Column` })).id;
  sourceId = (
    await prisma.leadSource.create({
      data: {
        organizationId: DEMO_ORG_ID,
        name: `${TAG} Source`,
      },
    })
  ).id;
});

afterAll(async () => {
  await prisma.lead.deleteMany({ where: { branchId: branchA } });
  await prisma.leadBoard.deleteMany({ where: { branchId: branchA } });
  await prisma.leadSource.deleteMany({ where: { name: { startsWith: TAG } } });
  await prisma.leaveReason.deleteMany({ where: { name: { startsWith: TAG } } });
  await prisma.payment.deleteMany({ where: { branchId: branchA } });
  await prisma.paymentMethod.deleteMany({ where: { name: { startsWith: TAG } } });
  await prisma.group.deleteMany({ where: { branchId: branchA } });
  await prisma.student.deleteMany({ where: { branchId: branchA } });
  await prisma.room.deleteMany({ where: { branchId: branchA } });
  await prisma.course.deleteMany({ where: { branchId: branchA } });
  await prisma.auditLog.deleteMany({ where: { branchId: branchA } });
  await prisma.user.deleteMany({ where: { phone: { startsWith: `+99894${RUN}` } } });
  await prisma.branch.deleteMany({ where: { id: branchA } });
});

describe("Excel workbook", () => {
  it("writes a sheet and reads it back, with dates as YYYY-MM-DD and empty rows dropped", async () => {
    const buffer = await buildWorkbook(
      "Sheet",
      [
        { header: "Name", key: "name", width: 20 },
        { header: "When", key: "when" },
        { header: "Amount", key: "amount" },
      ],
      [
        { name: "A", when: new Date(Date.UTC(2026, 8, 1)), amount: 12.5 },
        { name: "B", when: null, amount: 0 },
      ],
    );
    expect(buffer.byteLength).toBeGreaterThan(1000);
    const rows = await readFirstSheet(buffer);
    expect(rows[0]).toEqual(["Name", "When", "Amount"]);
    expect(rows[1]).toEqual(["A", "2026-09-01", "12.5"]);
    expect(rows[2]?.[0]).toBe("B");
    expect(rows).toHaveLength(3);
  });

  it("normalises phones and dates from spreadsheets", () => {
    expect(normalizePhone("90 123 45 67")).toBe("+998901234567");
    expect(normalizePhone("998901234567")).toBe("+998901234567");
    expect(normalizePhone("+998 (90) 123-45-67")).toBe("+998901234567");
    expect(normalizePhone("")).toBeNull();
    expect(normalizeDate("01.09.2026")).toBe("2026-09-01");
    expect(normalizeDate("1/9/2026")).toBe("2026-09-01");
    expect(normalizeDate("2026-9-1")).toBe("2026-09-01");
    expect(normalizeDate("  ")).toBeNull();
  });
});

describe("Excel import", () => {
  it("imports students from rows, skipping duplicates and existing phones with a reason", async () => {
    const result = await importStudents(ceo, branchA, [
      ["Full name", "Phone", "Gender", "Birth date", "Note"],
      [`${TAG} Imp One`, `94${RUN}21`, "erkak", "01.01.2010", "from excel"],
      [`${TAG} Imp Two`, `94${RUN}22`, "F", "", ""],
      [`${TAG} Imp Dup`, `94${RUN}21`, "", "", ""],
      [`${TAG} Imp Existing`, phone(11).slice(4), "", "", ""],
      ["", "", "", "", ""],
    ]);
    expect(result.imported).toBe(2);
    expect(result.skipped).toEqual([
      { row: 4, reason: "errors.importDuplicate" },
      { row: 5, reason: "errors.importExists" },
    ]);
    const one = await prisma.student.findFirst({ where: { fullName: `${TAG} Imp One` } });
    expect(one).toMatchObject({ phone: phone(21), gender: "MALE", note: "from excel" });
    expect(one?.birthDate?.toISOString().slice(0, 10)).toBe("2010-01-01");
    await expect(importStudents(teacher, branchA, [["a"], ["b"]])).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  it("adds group members by phone or name and reports who is already in", async () => {
    const result = await importMembers(ceo, groupB, [
      ["Full name", "Phone", "Joined", "Custom price", "Note"],
      [`${TAG} Imp One`, "", MONTH_START, "450000", ""],
      ["", phone(22), MONTH_START, "", "by phone"],
      [`${TAG} Newcomer`, "", MONTH_START, "", "created on the spot"],
      ["", `94${RUN}29`, MONTH_START, "", ""],
      [`${TAG} Imp One`, "", MONTH_START, "", ""],
      ["", "", "", "", ""],
    ]);
    expect(result.imported).toBe(3);
    expect(result.skipped).toEqual([
      { row: 5, reason: "errors.studentNotFound" },
      { row: 6, reason: "errors.importAlreadyIn" },
    ]);
    const members = await prisma.groupMembership.findMany({
      where: { groupId: groupB },
      include: { student: true },
    });
    expect(members.map((m) => m.status)).toEqual(["NEW", "NEW", "NEW"]);
    expect(members.some((m) => m.student.fullName === `${TAG} Newcomer`)).toBe(true);
    expect(
      members.find((m) => m.student.fullName === `${TAG} Imp One`)?.customPrice?.toNumber(),
    ).toBe(450_000);
  });
});

describe("payments reports", () => {
  beforeAll(async () => {
    const pay = (membershipId: string, amount: number, paidAt: string, bonus = 0) =>
      createPayment(ceo, {
        membershipId,
        paymentMethodId: methodId,
        amount,
        bonus,
        effectiveMonth: `${YEAR}-${MM}`,
        paidAt,
        comment: null,
      });
    await pay(alice.id, 500_000, day(2));
    await pay(bob.id, 300_000, day(3), 20_000);
  });

  it("totals the month's payments per KPI, teacher and cashier", async () => {
    const report = await getPaymentsReport(ceo, { branchId: branchA, year: YEAR, month: MONTH });
    expect(report.kpis.total).toMatchObject({ value: 800_000, count: 2 });
    expect(report.kpis.onTime.value).toBe(800_000);
    expect(report.kpis.late.value).toBe(0);
    expect(report.kpis.bonus.value).toBe(20_000);
    const teacherRow = report.teachers.find((r) => r.userId === teacher.userId);
    // 3 in GE-A plus the 3 NEW members the import put into GE-B.
    expect(teacherRow).toMatchObject({ groupsCount: 2, studentsCount: 6, totalPayments: 800_000 });
    expect(teacherRow?.courses).toEqual([`${TAG} English`]);
    const cashier = report.staff.find((r) => r.userId === ceo.userId);
    expect(cashier).toMatchObject({ paymentsCount: 2, totalPayments: 800_000, refunds: 0 });
    await expect(getPaymentsReport(teacher, {})).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("lists student payments with the filters of the reference page", async () => {
    const page = await listStudentPayments(ceo, list, {
      branchId: branchA,
      year: YEAR,
      month: MONTH,
    });
    expect(page.total).toBe(2);
    expect(page.totalAmount).toBe(800_000);
    expect(page.items[0]).toMatchObject({
      studentName: `${TAG} Bob`,
      groupName: `${TAG} GE-A`,
      teacherName: `${TAG} Teacher`,
      bonus: 20_000,
      methodName: `${TAG} Cash`,
    });
    const withBonus = await listStudentPayments(ceo, list, { branchId: branchA, bonus: "yes" });
    expect(withBonus.items.map((p) => p.studentName)).toEqual([`${TAG} Bob`]);
    const byName = await listStudentPayments(
      ceo,
      { ...list, q: `${TAG} Alice` },
      { branchId: branchA },
    );
    expect(byName.total).toBe(1);
    const byTeacher = await listStudentPayments(ceo, list, {
      branchId: branchA,
      teacherId: ceo.userId,
    });
    expect(byTeacher.total).toBe(0);
  });
});

describe("churn report and leave reasons", () => {
  it("manages reasons and offers them to the churn report", async () => {
    const reason = await createLeaveReason(ceo, {
      name: `${TAG} Moved`,
      kind: "LEAVE",
      isActive: true,
    });
    expect(reason).toMatchObject({ name: `${TAG} Moved`, kind: "LEAVE", isActive: true });
    await expect(
      createLeaveReason(ceo, { name: `${TAG} Moved`, kind: "LEAVE", isActive: true }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    const off = await updateLeaveReason(ceo, reason.id, { isActive: false });
    expect(off.isActive).toBe(false);
    expect((await listLeaveReasons(teacher)).some((r) => r.id === reason.id)).toBe(true);
    await expect(
      createLeaveReason(teacher, { name: `${TAG} X`, kind: "LEAVE", isActive: true }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await deleteLeaveReason(ceo, reason.id);
    expect((await listLeaveReasons(ceo)).some((r) => r.id === reason.id)).toBe(false);
  });

  it("counts who left this month, why, who removed them and the transfers", async () => {
    await updateMembership(ceo, carol.id, { status: "ARCHIVED", leaveReason: `${TAG} Price` });
    await transferMember(ceo, bob.id, {
      groupId: groupB,
      joinedAt: day(10),
      customPrice: null,
      note: null,
      reason: `${TAG} Time`,
    });
    const report = await getChurnReport(ceo, { branchId: branchA });
    expect(report.from).toBe(MONTH_START);
    expect(report.kpis.leftCount).toBe(1);
    expect(report.kpis.lostRevenue).toBe(500_000);
    const carolRow = report.rows.find((r) => r.studentId === carol.studentId);
    expect(carolRow).toMatchObject({
      groupName: `${TAG} GE-A`,
      courseName: `${TAG} English`,
      teacherName: `${TAG} Teacher`,
      reason: `${TAG} Price`,
      leftByName: `${TAG} CEO`,
      hasDiscount: false,
    });
    expect(report.rows.some((r) => r.studentId === bob.studentId)).toBe(false);
    expect(report.breakdown.reason).toEqual([{ name: `${TAG} Price`, count: 1 }]);
    expect(report.breakdown.teacher).toEqual([{ name: `${TAG} Teacher`, count: 1 }]);
    expect(report.breakdown.joinedThisMonth).toBe(1);
    expect(report.transfers.total).toBe(1);
    expect(report.transfers.reasons).toEqual([{ name: `${TAG} Time`, count: 1 }]);
    expect(report.discounts).toEqual({ withDiscount: 0, fullPrice: 1 });
    const filtered = await getChurnReport(ceo, { branchId: branchA, reason: `${TAG} Other` });
    expect(filtered.rows).toHaveLength(0);
    await expect(getChurnReport(ceo, { from: day(5), to: day(1) })).rejects.toMatchObject({
      code: "VALIDATION",
    });
  });
});

describe("graduates report", () => {
  it("lists graduates of the month and records their results", async () => {
    await updateMembership(ceo, alice.id, { status: "GRADUATED" });
    await expect(setGraduateRecord(ceo, carol.id, { ieltsScore: 7 })).rejects.toMatchObject({
      code: "CONFLICT",
      message: "errors.notGraduated",
    });
    const saved = await setGraduateRecord(ceo, alice.id, {
      ieltsScore: 7.5,
      cefrLevel: "C1",
      university: true,
      employed: false,
      note: "Oxford",
    });
    expect(saved).toMatchObject({ ieltsScore: 7.5, cefrLevel: "C1", university: true });
    const report = await getGraduatesReport(ceo, { branchId: branchA, year: YEAR, month: MONTH });
    expect(report.kpis).toMatchObject({
      count: 1,
      bestTeacher: { name: `${TAG} Teacher`, count: 1 },
      avgIelts: 7.5,
      commonCefr: "C1",
      universityPercent: 100,
      employedPercent: 0,
    });
    expect(report.rows[0]).toMatchObject({
      fullName: `${TAG} Alice`,
      groupName: `${TAG} GE-A`,
      graduatedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/) as string,
      result: { cefrLevel: "C1", note: "Oxford" },
    });
    const none = await getGraduatesReport(ceo, {
      branchId: branchA,
      year: YEAR,
      month: MONTH,
      result: "no",
    });
    expect(none.rows).toHaveLength(0);
    await expect(setGraduateRecord(teacher, alice.id, {})).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("leads report", () => {
  it("builds the funnel, the sources and the salespeople of the month", async () => {
    const lead = (fullName: string, status: "NEW" | "LOST" | "CONTACTED") =>
      createLead(
        ceo,
        {
          columnId,
          fullName,
          phones: [],
          birthDate: null,
          age: null,
          sourceId,
          teacherId: null,
          days: null,
          lessonTime: null,
          status,
          temperature: null,
          comment: null,
        },
        { createdById: ceo.userId },
      );
    const first = await lead(`${TAG} Lead One`, "NEW");
    await lead(`${TAG} Lead Two`, "LOST");
    await lead(`${TAG} Lead Three`, "CONTACTED");
    await updateLead(ceo, first.id, { status: "CONTACTED" });
    const report = await getLeadsReport(ceo, { branchId: branchA, year: YEAR, month: MONTH });
    expect(report.kpis).toMatchObject({
      newLeads: 3,
      conversions: 0,
      lost: 1,
      bestSource: { name: `${TAG} Source`, count: 3 },
      bestSalesperson: null,
    });
    const stage = (s: string) => report.funnel.find((f) => f.stage === s)?.count;
    expect(stage("CONTACTED")).toBe(2);
    expect(stage("LOST")).toBe(1);
    expect(stage("NEW")).toBe(0);
    expect(report.byMonth).toHaveLength(12);
    expect(report.byMonth[MONTH - 1]).toMatchObject({ created: 3, lost: 1, converted: 0 });
    expect(report.rows).toHaveLength(3);
    expect(report.rows[0]?.createdByName).toBe(`${TAG} CEO`);
    expect(report.sources.some((s) => s.id === sourceId)).toBe(true);
    const bySource = await getLeadsReport(ceo, { branchId: branchA, sourceId: "nope" });
    expect(bySource.rows).toHaveLength(0);
  });
});

describe("students report", () => {
  it("sums attendance per group and grades per student", async () => {
    const lessons = await prisma.lesson.findMany({
      where: { groupId: groupA },
      orderBy: { date: "asc" },
      take: 2,
    });
    expect(lessons).toHaveLength(2);
    const [l1, l2] = lessons as unknown as [{ id: string }, { id: string }];
    const dave = await addMember(ceo, groupA, {
      newStudent: { fullName: `${TAG} Dave`, phone: phone(14) },
      joinedAt: MONTH_START,
      status: "ACTIVE",
      customPrice: null,
      note: null,
    });
    await markAttendance(ceo, l1.id, [{ membershipId: dave.id, status: "PRESENT" }]);
    await markAttendance(ceo, l2.id, [{ membershipId: dave.id, status: "ABSENT" }]);
    await setGrades(ceo, l1.id, [{ membershipId: dave.id, score: 80 }]);
    await setGrades(ceo, l2.id, [{ membershipId: dave.id, score: 60 }]);
    const report = await getStudentsReport(ceo, { branchId: branchA, groupId: groupA });
    expect(report.from).toBe(MONTH_START);
    const row = report.attendance.rows.find((r) => r.groupId === groupA);
    expect(row).toMatchObject({
      groupName: `${TAG} GE-A`,
      teacherName: `${TAG} Teacher`,
      present: 1,
      absent: 1,
    });
    expect(report.attendance.totals.present).toBe(1);
    expect(report.attendance.totals.absent).toBe(1);
    expect(report.kpis.attendancePercent).toBe(50);
    expect(report.kpis.gradeAverage).toBe(70);
    const daveRow = report.performance.rows.find((r) => r.studentId === dave.studentId);
    expect(daveRow).toMatchObject({
      groups: [`${TAG} GE-A`],
      teachers: [`${TAG} Teacher`],
      courses: [`${TAG} English`],
      grades: [{ groupName: `${TAG} GE-A`, average: 70 }],
      average: 70,
    });
    expect(report.options.groups.some((g) => g.id === groupA)).toBe(true);
    const paged = await getStudentsReport(ceo, { branchId: branchA, page: 2 }, prisma, 1);
    expect(paged.performance.page).toBe(2);
    expect(paged.performance.rows).toHaveLength(1);
  });
});

describe("center statistics", () => {
  it("computes room utilisation from the lessons, capacities and working hours", async () => {
    const report = await getCenterStatistics(ceo, { branchId: branchA, year: YEAR, month: MONTH });
    expect(report.view).toBe("monthly");
    expect(report.workHours).toEqual({ start: "08:00", end: "20:00" });
    const roomRows = report.rows.filter((r) => r.roomId === roomA);
    expect(roomRows.length).toBeGreaterThanOrEqual(3); // two groups + the room total
    const total = roomRows.find((r) => r.isRoomTotal);
    expect(total).toMatchObject({ roomName: `${TAG} Room`, capacity: 10 });
    expect(total!.lessonHours).toBeGreaterThan(0);
    expect(total!.roomHours).toBeGreaterThan(total!.lessonHours);
    expect(report.kpis.utilisation).toBeGreaterThan(0);
    expect(report.kpis.utilisation).toBeLessThanOrEqual(100);
    expect(report.kpis.freeHours).toBe(
      Math.round((total!.roomHours - total!.lessonHours) * 10) / 10,
    );
    const daily = await getCenterStatistics(ceo, {
      branchId: branchA,
      view: "daily",
      date: day(1),
    });
    expect(daily.from).toBe(day(1));
    expect(daily.to).toBe(day(1));
    const weekly = await getCenterStatistics(ceo, {
      branchId: branchA,
      view: "weekly",
      date: day(1),
    });
    expect(new Date(weekly.to).getTime() - new Date(weekly.from).getTime()).toBe(6 * 86_400_000);
    await expect(getCenterStatistics(teacher, {})).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
