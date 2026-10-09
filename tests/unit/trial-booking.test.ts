/**
 * Trial lessons for leads (A-131) against the real database: booking from the
 * card, the visitor on the teacher's Today roster, the outcome, conversion when
 * the lead joins the group and the trials-by-source figures of the leads report.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/rbac/default-roles";
import { prisma } from "@/server/db/prisma";
import type { Actor } from "@/server/rbac/authorize";
import { createGroup } from "@/server/services/groups/groups.service";
import { createBoard } from "@/server/services/leads/boards.service";
import { addLeadsToGroup, createLead, getLead } from "@/server/services/leads/leads.service";
import { createSource } from "@/server/services/leads/sources.service";
import { bookTrial, listLeadTrials, setTrialOutcome } from "@/server/services/leads/trials.service";
import { getLeadsReport } from "@/server/services/reports/leads-report.service";
import { createBranch } from "@/server/services/settings/branches.service";
import { createCourse } from "@/server/services/settings/courses.service";
import { getToday, nowInTashkent } from "@/server/services/today/today.service";

import { DEMO_ORG_ID, demoBranchIds } from "./support/tenant";

const RUN = String(Date.now() % 100_000).padStart(5, "0");
const TAG = `tr${RUN}`;
const phone = (n: number) => `+99897${RUN}${String(n).padStart(2, "0")}`;
const TODAY = nowInTashkent().date;
const daysAgo = (n: number) => {
  const d = new Date(Date.now() + 5 * 60 * 60 * 1000);
  d.setUTCDate(d.getUTCDate() - n);
  return d.toISOString().slice(0, 10);
};

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
const outsider = actor("Outsider", ["TEACHER"], [...DEFAULT_ROLE_PERMISSIONS.TEACHER]);

let branchId: string;
let branchB: string;
let groupId: string;
let otherGroupId: string;
let columnId: string;
let sourceId: string;
let leadId: string;
let bookingId: string;

beforeAll(async () => {
  for (const [a, n] of [
    [ceo, 1],
    [teacher, 2],
    [outsider, 3],
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
  }
  branchId = (await createBranch(ceo, { name: `${TAG} A`, isActive: true })).id;
  branchB = (await createBranch(ceo, { name: `${TAG} B`, isActive: true })).id;
  ceo.branchIds = await demoBranchIds();
  ceo.activeBranchId = branchId;
  teacher.branchIds = [branchId];
  outsider.branchIds = [branchId];
  await prisma.userBranch.createMany({
    data: [teacher, outsider].map((a) => ({ userId: a.userId, branchId })),
  });
  const teacherRole = await prisma.role.findUniqueOrThrow({ where: { code: "TEACHER" } });
  await prisma.userRole.createMany({
    data: [teacher, outsider].map((a) => ({ userId: a.userId, roleId: teacherRole.id })),
  });
  const course = (name: string, branch: string) =>
    createCourse(ceo, {
      branchId: branch,
      name,
      description: undefined,
      price: 400_000,
      durationMonths: 2,
      gradingSystemId: null,
      color: "#0F766E",
    });
  const courseId = (await course(`${TAG} Course`, branchId)).id;
  const courseB = (await course(`${TAG} Course B`, branchB)).id;
  // A lesson every day, so whatever day the suite runs on has one.
  const group = (name: string, branch: string, cid: string, teacherId: string | null) =>
    createGroup(ceo, {
      branchId: branch,
      name,
      courseId: cid,
      gradingSystemId: null,
      weekdayPattern: "CUSTOM",
      slots: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
        weekday,
        startTime: "22:00",
        endTime: "22:45",
        roomId: null,
      })),
      teachers: teacherId
        ? [{ userId: teacherId, role: "MAIN", shareType: "PERCENT", shareValue: 40 }]
        : [],
      startDate: daysAgo(10),
      endDate: null,
      status: "ACTIVE",
    });
  groupId = (await group(`${TAG} Group`, branchId, courseId, teacher.userId)).id;
  otherGroupId = (await group(`${TAG} Group B`, branchB, courseB, null)).id;
  const boardId = (await createBoard(ceo, { name: `${TAG} Board`, branchId })).id;
  columnId = (await prisma.leadColumn.findFirstOrThrow({ where: { boardId } })).id;
  sourceId = (await createSource(ceo, { name: `${TAG} Instagram`, isActive: true })).id;
  leadId = (
    await createLead(ceo, {
      columnId,
      fullName: `${TAG} Visitor`,
      phones: [phone(10)],
      birthDate: null,
      age: null,
      sourceId,
      teacherId: null,
      days: null,
      lessonTime: null,
      status: "NEW",
      temperature: null,
      comment: null,
    })
  ).id;
});

afterAll(async () => {
  const branches = [branchId, branchB];
  const users = [ceo, teacher, outsider].map((a) => a.userId);
  const leads = await prisma.lead.findMany({ where: { branchId: { in: branches } } });
  const students = await prisma.student.findMany({ where: { branchId: { in: branches } } });
  const ids = students.map((s) => s.id);
  await prisma.auditLog.deleteMany({
    where: {
      OR: [
        { branchId: { in: branches } },
        { actorId: { in: users } },
        { entityId: { in: [...leads.map((l) => l.id), ...ids] } },
      ],
    },
  });
  await prisma.notification.deleteMany({ where: { userId: { in: users } } });
  await prisma.lead.deleteMany({ where: { branchId: { in: branches } } });
  await prisma.leadBoard.deleteMany({ where: { branchId: { in: branches } } });
  await prisma.leadSource.deleteMany({ where: { id: sourceId } });
  await prisma.smsMessage.deleteMany({ where: { studentId: { in: ids } } });
  await prisma.coinTransaction.deleteMany({ where: { studentId: { in: ids } } });
  await prisma.groupMembership.deleteMany({ where: { studentId: { in: ids } } });
  await prisma.group.deleteMany({ where: { branchId: { in: branches } } });
  await prisma.student.deleteMany({ where: { branchId: { in: branches } } });
  await prisma.course.deleteMany({ where: { branchId: { in: branches } } });
  await prisma.userBranch.deleteMany({ where: { branchId: { in: branches } } });
  await prisma.userRole.deleteMany({ where: { userId: { in: users } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.branch.deleteMany({ where: { id: { in: branches } } });
  await prisma.$disconnect();
});

describe("booking a trial from the lead card", () => {
  it("books one visit per lead, group and day, tied to the day's lesson", async () => {
    const booking = await bookTrial(ceo, leadId, { groupId, date: TODAY, note: "Shy" });
    bookingId = booking.id;
    expect(booking).toMatchObject({
      leadId,
      groupId,
      groupName: `${TAG} Group`,
      date: TODAY,
      status: "BOOKED",
      note: "Shy",
      startTime: "22:00",
      createdByName: `${TAG} CEO`,
    });
    expect(booking.lessonId).not.toBeNull();
    await expect(bookTrial(ceo, leadId, { groupId, date: TODAY, note: null })).rejects.toThrow(
      "errors.trialExists",
    );
    // A group of another branch is refused; a teacher may not book.
    await expect(
      bookTrial(ceo, leadId, { groupId: otherGroupId, date: TODAY, note: null }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(bookTrial(teacher, leadId, { groupId, date: TODAY, note: null })).rejects.toThrow(
      "errors.forbidden",
    );
    const list = await listLeadTrials(ceo, leadId);
    expect(list.map((t) => t.id)).toEqual([bookingId]);
    const audit = await prisma.auditLog.findFirst({
      where: { action: "lead.trial.book", entityId: leadId },
    });
    expect(audit).not.toBeNull();
  });

  it("shows the booked visit on the card", async () => {
    const lead = await getLead(ceo, leadId);
    expect(lead.trial).toEqual({
      id: bookingId,
      date: TODAY,
      groupName: `${TAG} Group`,
      status: "BOOKED",
    });
  });
});

describe("the visitor on the Today roster", () => {
  it("lists the visitor under the lesson, name and note only for the teacher", async () => {
    const day = await getToday(teacher);
    const lesson = day.lessons.find((l) => l.groupId === groupId)!;
    expect(lesson).toBeDefined();
    expect(lesson.trials).toEqual([
      {
        id: bookingId,
        leadId,
        fullName: `${TAG} Visitor`,
        phone: null,
        status: "BOOKED",
        note: "Shy",
        lessonId: lesson.id,
      },
    ]);
    // The office sees the phone too.
    const office = await getToday(ceo, TODAY);
    expect(office.lessons.find((l) => l.groupId === groupId)!.trials[0]!.phone).toBe(phone(10));
    // A teacher of other groups sees nothing of this one.
    const other = await getToday(outsider);
    expect(other.lessons.find((l) => l.groupId === groupId)).toBeUndefined();
  });

  it("lets the group's teacher mark the visit, but not cancel it or touch other groups", async () => {
    await expect(setTrialOutcome(outsider, bookingId, { status: "ATTENDED" })).rejects.toThrow(
      "errors.trialNotFound",
    );
    await expect(setTrialOutcome(teacher, bookingId, { status: "CANCELLED" })).rejects.toThrow(
      "errors.forbidden",
    );
    const noShow = await setTrialOutcome(teacher, bookingId, { status: "NO_SHOW" });
    expect(noShow.status).toBe("NO_SHOW");
    expect((await getLead(ceo, leadId)).trial?.status).toBe("NO_SHOW");
    const came = await setTrialOutcome(teacher, bookingId, { status: "ATTENDED" });
    expect(came.status).toBe("ATTENDED");
    const audits = await prisma.auditLog.count({
      where: { action: "lead.trial.outcome", entityId: leadId },
    });
    expect(audits).toBe(2);
  });
});

describe("conversion and the report", () => {
  it("closes the trial as converted when the lead joins the group", async () => {
    const result = await addLeadsToGroup(ceo, {
      leadIds: [leadId],
      groupId,
      joinedAt: TODAY,
      status: "ACTIVE",
    });
    expect(result).toEqual({ added: 1, skipped: 0 });
    const row = await prisma.trialBooking.findUniqueOrThrow({ where: { id: bookingId } });
    expect(row.status).toBe("CONVERTED");
    await expect(setTrialOutcome(ceo, bookingId, { status: "NO_SHOW" })).rejects.toThrow(
      "errors.trialConverted",
    );
    // The converted student is a member now, no longer a visitor.
    const day = await getToday(teacher);
    const lesson = day.lessons.find((l) => l.groupId === groupId)!;
    expect(lesson.trials[0]!.status).toBe("CONVERTED");
    expect(lesson.members.map((m) => m.fullName)).toContain(`${TAG} Visitor`);
  });

  it("counts the month's trials and the funnel per source", async () => {
    const [year, month] = TODAY.split("-").map(Number) as [number, number];
    const report = await getLeadsReport(ceo, { branchId, year, month });
    expect(report.kpis.trials).toBe(1);
    expect(report.kpis.trialsAttended).toBe(1);
    expect(report.trialsBySource).toEqual([
      { name: `${TAG} Instagram`, leads: 1, trials: 1, attended: 1, converted: 1 },
    ]);
  });
});
