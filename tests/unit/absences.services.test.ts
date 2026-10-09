/**
 * Absence follow-up (A-125) against the real database: cases open from the
 * attendance by the two rules, close when the student is back or gone, staff
 * contacts are logged, the daily run tells the managers and the Monday summary
 * reaches the staff feed.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/rbac/default-roles";
import { prisma } from "@/server/db/prisma";
import type { Actor } from "@/server/rbac/authorize";
import {
  absenceRules,
  getAbsenceCase,
  listAbsenceCases,
  listAbsenceContacts,
  logAbsenceContact,
  runDailyAbsenceFollowUp,
  runWeeklyAbsenceSummary,
  syncAbsenceCases,
  weeklyAbsenceSummaryDue,
} from "@/server/services/absences/absences.service";
import { listNotifications } from "@/server/services/dashboard/notifications.service";
import { createGroup } from "@/server/services/groups/groups.service";
import { addExtraLesson, markAttendance } from "@/server/services/groups/lessons.service";
import { createBranch } from "@/server/services/settings/branches.service";
import { createCourse } from "@/server/services/settings/courses.service";
import { createStudent } from "@/server/services/students/students.service";

import { DEMO_ORG_ID, demoBranchIds } from "./support/tenant";

const RUN = String(Date.now() % 100_000).padStart(5, "0");
const TAG = `abs${RUN}`;
const phone = (n: number) => `+99895${RUN}${String(n).padStart(2, "0")}`;
const iso = (d: Date) => d.toISOString().slice(0, 10);
const daysAgo = (n: number) => {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  return iso(d);
};
const TODAY = daysAgo(0);
const RULES = { streak: 2, silentDays: 7 };

const ceo: Actor = {
  userId: "",
  fullName: "CEO",
  roles: ["CEO"],
  permissions: ["*"],
  organizationId: DEMO_ORG_ID,
  branchIds: [],
  activeBranchId: null,
};
const admin: Actor = {
  ...ceo,
  fullName: "Admin",
  roles: ["ADMIN"],
  permissions: [...DEFAULT_ROLE_PERMISSIONS.ADMIN],
};
const teacher: Actor = {
  ...ceo,
  fullName: "Teacher",
  roles: ["TEACHER"],
  permissions: [...DEFAULT_ROLE_PERMISSIONS.TEACHER],
};

let branchId: string;
let groupId: string;
let savedRules: { absenceStreak: number | null; absenceSilentDays: number | null };
const students: Record<string, { id: string; membershipId: string }> = {};
/** The group's lessons before today, newest first. */
let past: Array<{ id: string; date: string }> = [];
const chat = `${TAG}-chat`;

const list = (over: Partial<Parameters<typeof listAbsenceCases>[1]> = {}) => ({
  page: 1,
  pageSize: 50,
  skip: 0,
  take: 50,
  sort: { field: "sinceAt" as const, direction: "asc" as const },
  ...over,
});

beforeAll(async () => {
  for (const [a, n] of [
    [ceo, 1],
    [admin, 2],
    [teacher, 3],
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
  branchId = (await createBranch(ceo, { name: `${TAG} Branch`, isActive: true })).id;
  ceo.branchIds = await demoBranchIds();
  ceo.activeBranchId = branchId;
  admin.branchIds = [branchId];
  teacher.branchIds = [branchId];
  await prisma.userBranch.createMany({
    data: [admin.userId, teacher.userId].map((userId) => ({ userId, branchId })),
  });
  const adminRole = await prisma.role.findUniqueOrThrow({ where: { code: "ADMIN" } });
  const teacherRole = await prisma.role.findUniqueOrThrow({ where: { code: "TEACHER" } });
  await prisma.userRole.createMany({
    data: [
      { userId: admin.userId, roleId: adminRole.id },
      { userId: teacher.userId, roleId: teacherRole.id },
    ],
  });
  const courseId = (
    await createCourse(ceo, {
      branchId,
      name: `${TAG} Course`,
      description: undefined,
      price: 300_000,
      durationMonths: 3,
      gradingSystemId: null,
      color: null,
    })
  ).id;
  // A lesson every day for the last three weeks, so the rules have marks to read.
  groupId = (
    await createGroup(ceo, {
      branchId,
      name: `${TAG} Group`,
      courseId,
      gradingSystemId: null,
      weekdayPattern: "CUSTOM",
      slots: [1, 2, 3, 4, 5, 6, 7].map((weekday) => ({
        weekday,
        startTime: "08:00",
        endTime: "09:00",
        roomId: null,
      })),
      teachers: [{ userId: teacher.userId, role: "MAIN", shareType: "PERCENT", shareValue: 40 }],
      startDate: daysAgo(21),
      endDate: null,
      status: "ACTIVE",
    })
  ).id;
  let n = 10;
  for (const name of ["Alice", "Bob", "Carol", "Dan"]) {
    const created = await createStudent(ceo, {
      branchId,
      fullName: `${TAG} ${name}`,
      phone: phone(n++),
      birthDate: null,
      gender: "MALE",
      photoUrl: null,
      password: null,
      sourceId: null,
      schoolId: null,
      note: null,
      membership: {
        groupId,
        joinedAt: daysAgo(21),
        customPrice: null,
        note: null,
        status: "ACTIVE",
      },
    });
    const membership = await prisma.groupMembership.findFirstOrThrow({
      where: { studentId: created.id, groupId },
    });
    students[name] = { id: created.id, membershipId: membership.id };
  }
  const lessons = await prisma.lesson.findMany({
    where: { groupId, date: { lt: new Date(`${TODAY}T00:00:00Z`) } },
    orderBy: [{ date: "desc" }, { startTime: "desc" }],
  });
  past = lessons.map((l) => ({ id: l.id, date: iso(l.date) }));
  savedRules = await prisma.orgSettings.findUniqueOrThrow({
    where: { organizationId: DEMO_ORG_ID },
    select: { absenceStreak: true, absenceSilentDays: true },
  });
  await prisma.orgSettings.update({
    where: { organizationId: DEMO_ORG_ID },
    data: { absenceStreak: RULES.streak, absenceSilentDays: RULES.silentDays },
  });
});

afterAll(async () => {
  await prisma.orgSettings.update({ where: { organizationId: DEMO_ORG_ID }, data: savedRules });
  const users = [ceo.userId, admin.userId, teacher.userId];
  await prisma.job.deleteMany({ where: { payload: { path: ["chatId"], equals: chat } } });
  await prisma.botRecipient.deleteMany({ where: { chatId: chat } });
  await prisma.notification.deleteMany({ where: { userId: { in: users } } });
  await prisma.auditLog.deleteMany({ where: { OR: [{ branchId }, { actorId: { in: users } }] } });
  await prisma.absenceCase.deleteMany({ where: { branchId } });
  const ids = Object.values(students).map((s) => s.id);
  await prisma.groupMembership.deleteMany({ where: { studentId: { in: ids } } });
  await prisma.group.deleteMany({ where: { branchId } });
  await prisma.student.deleteMany({ where: { branchId } });
  await prisma.course.deleteMany({ where: { branchId } });
  await prisma.userBranch.deleteMany({ where: { branchId } });
  await prisma.userRole.deleteMany({ where: { userId: { in: users } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.branch.deleteMany({ where: { id: branchId } });
  await prisma.$disconnect();
});

const mark = (lessonId: string, name: string, status: "PRESENT" | "ABSENT" | "EXCUSED") =>
  markAttendance(ceo, lessonId, [{ membershipId: students[name]!.membershipId, status }]);

const rowOf = async (name: string, filter: Parameters<typeof listAbsenceCases>[2] = {}) => {
  const page = await listAbsenceCases(ceo, list(), { branchId, ...filter });
  return page.items.find((i) => i.studentId === students[name]!.id);
};

describe("absence follow-up", () => {
  it("reads the rules from the centre's settings", async () => {
    expect(past.length).toBeGreaterThanOrEqual(14);
    expect(await absenceRules(prisma, DEMO_ORG_ID)).toEqual(RULES);
  });

  it("opens a case for absences in a row and for a student not seen for a while", async () => {
    // Alice missed the last two lessons; Carol came yesterday after two absences;
    // Dan was excused yesterday after two absences; Bob was never marked at all.
    await mark(past[0]!.id, "Alice", "ABSENT");
    await mark(past[1]!.id, "Alice", "ABSENT");
    await mark(past[2]!.id, "Alice", "PRESENT");
    await mark(past[0]!.id, "Carol", "PRESENT");
    await mark(past[1]!.id, "Carol", "ABSENT");
    await mark(past[2]!.id, "Carol", "ABSENT");
    await mark(past[0]!.id, "Dan", "EXCUSED");
    await mark(past[1]!.id, "Dan", "ABSENT");
    await mark(past[2]!.id, "Dan", "ABSENT");
    await mark(past[3]!.id, "Dan", "PRESENT");

    const synced = await syncAbsenceCases(prisma, { branchIds: [branchId] }, RULES, TODAY);
    expect(synced.opened).toBe(3);
    expect(synced.openedBy.get(branchId)).toBe(3);

    const page = await listAbsenceCases(ceo, list(), { branchId });
    expect(page.total).toBe(3);
    expect(page.summary).toEqual({ open: 3, noContact: 3, streak: 2, silent: 1 });
    expect(page.rules).toEqual(RULES);
    // Longest away first: Bob's silent week starts before Alice's two lessons.
    expect(page.items[0]!.studentId).toBe(students.Bob!.id);

    const alice = (await rowOf("Alice"))!;
    expect(alice.reason).toBe("STREAK");
    expect(alice.missed).toBe(2);
    expect(alice.sinceAt).toBe(past[1]!.date);
    expect(alice.lastPresentAt).toBe(past[2]!.date);
    expect(alice.days).toBeGreaterThanOrEqual(2);
    expect(alice.groupName).toBe(`${TAG} Group`);
    expect(alice.teacher).toBe(`${TAG} Teacher`);
    expect(alice.lastContactAt).toBeNull();

    const bob = (await rowOf("Bob"))!;
    expect(bob.reason).toBe("SILENT");
    expect(bob.missed).toBe(RULES.silentDays);
    expect(bob.lastPresentAt).toBeNull();
    expect(bob.sinceAt).toBe(past[RULES.silentDays - 1]!.date);

    const dan = (await rowOf("Dan"))!;
    expect(dan.reason).toBe("STREAK");
    expect(dan.lastPresentAt).toBe(past[3]!.date);
    expect(await rowOf("Carol")).toBeUndefined();

    const streaks = await listAbsenceCases(ceo, list(), { branchId, reason: "STREAK" });
    expect(streaks.total).toBe(2);
    const found = await listAbsenceCases(ceo, list({ q: "Alice" }), { branchId });
    expect(found.items.map((i) => i.studentId)).toEqual([students.Alice!.id]);
  });

  it("keeps one case per student and follows the marks", async () => {
    const extra = await addExtraLesson(ceo, groupId, {
      date: daysAgo(1),
      startTime: "10:00",
      endTime: "11:00",
    });
    await mark(extra.id, "Alice", "ABSENT");
    const synced = await syncAbsenceCases(prisma, { branchIds: [branchId] }, RULES, TODAY);
    expect(synced.opened).toBe(0);
    const alice = (await rowOf("Alice"))!;
    expect(alice.missed).toBe(3);
    expect(alice.sinceAt).toBe(past[1]!.date);
    expect(await prisma.absenceCase.count({ where: { studentId: students.Alice!.id } })).toBe(1);
  });

  it("logs the calls and keeps teachers out", async () => {
    const alice = (await rowOf("Alice"))!;
    const after = await logAbsenceContact(ceo, alice.id, {
      channel: "CALL",
      outcome: "WILL_RETURN",
      note: "Back on Monday",
    });
    expect(after.lastChannel).toBe("CALL");
    expect(after.lastOutcome).toBe("WILL_RETURN");
    expect(after.lastContactBy).toBe(`${TAG} CEO`);
    expect(after.lastContactAt).not.toBeNull();
    const contacts = await listAbsenceContacts(ceo, alice.id);
    expect(contacts).toHaveLength(1);
    expect(contacts[0]).toMatchObject({
      channel: "CALL",
      outcome: "WILL_RETURN",
      note: "Back on Monday",
      createdBy: `${TAG} CEO`,
    });
    const page = await listAbsenceCases(ceo, list(), { branchId, status: "NO_CONTACT" });
    expect(page.total).toBe(2);
    expect(page.summary.noContact).toBe(2);

    await expect(listAbsenceCases(teacher, list(), { branchId })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    await expect(getAbsenceCase(teacher, alice.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
    // The admin of the branch may; an admin of another branch may not.
    expect((await listAbsenceCases(admin, list(), { branchId })).total).toBe(3);
    const outsider: Actor = { ...admin, branchIds: ceo.branchIds.filter((b) => b !== branchId) };
    await expect(getAbsenceCase(outsider, alice.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("closes a case when the student is back, gone, or no longer flagged", async () => {
    // Alice came to the extra lesson after all.
    const extra = await prisma.lesson.findFirstOrThrow({
      where: { groupId, isExtra: true, date: new Date(`${daysAgo(1)}T00:00:00Z`) },
    });
    await mark(extra.id, "Alice", "PRESENT");
    // Bob's membership was frozen.
    await prisma.groupMembership.update({
      where: { id: students.Bob!.membershipId },
      data: { status: "FROZEN", frozenAt: new Date(`${TODAY}T00:00:00Z`) },
    });
    // The centre raised the bar to three absences in a row: Dan's two no longer count.
    const synced = await syncAbsenceCases(
      prisma,
      { branchIds: [branchId] },
      { ...RULES, streak: 3 },
      TODAY,
    );
    expect(synced.closed).toBe(3);
    expect(await prisma.absenceCase.count({ where: { branchId, status: "OPEN" } })).toBe(0);

    // Reading the list reconciles with the centre's own rules again: Dan is back on it, as a new case.
    const closed = await listAbsenceCases(ceo, list(), { branchId, status: "CLOSED" });
    expect(closed.total).toBe(3);
    const reasonOf = (name: string) =>
      closed.items.find((i) => i.studentId === students[name]!.id)!.closedReason;
    expect(reasonOf("Alice")).toBe("RETURNED");
    expect(reasonOf("Bob")).toBe("LEFT");
    expect(reasonOf("Dan")).toBe("CLEARED");
    const alice = closed.items.find((i) => i.studentId === students.Alice!.id)!;
    expect(alice.lastPresentAt).toBe(daysAgo(1));
    expect(alice.closedAt).not.toBeNull();
    await expect(
      logAbsenceContact(ceo, alice.id, { channel: "NOTE", outcome: null, note: null }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    const open = await listAbsenceCases(ceo, list(), { branchId });
    expect(open.items.map((i) => i.studentId)).toEqual([students.Dan!.id]);
    expect(await prisma.absenceCase.count({ where: { studentId: students.Dan!.id } })).toBe(2);
    const again = await syncAbsenceCases(prisma, { branchIds: [branchId] }, RULES, TODAY);
    expect(again).toMatchObject({ opened: 0, closed: 0 });
  });

  it("tells the branch managers about the day's new cases", async () => {
    await prisma.absenceCase.deleteMany({ where: { branchId, status: "OPEN" } });
    const run = await runDailyAbsenceFollowUp(prisma, TODAY, { branchIds: [branchId] });
    expect(run.opened).toBe(1);
    expect(run.notified).toBeGreaterThanOrEqual(1);
    const notices = await listNotifications(admin, { unread: true, page: 1 });
    const notice = notices.items.find((n) => n.kind === "ABSENCES");
    expect(notice).toBeDefined();
    expect(notice!.params).toMatchObject({ count: 1, day: TODAY });
    expect(notice!.href).toBe(`/absences?branchId=${branchId}&status=NO_CONTACT`);
    // Teachers have no say over students, so they are not told.
    const teacherNotices = await listNotifications(teacher, { unread: true, page: 1 });
    expect(teacherNotices.items.some((n) => n.kind === "ABSENCES")).toBe(false);
  });

  it("sends the Monday summary to the staff feed", async () => {
    expect(weeklyAbsenceSummaryDue(new Date("2026-10-12T04:30:00Z"))).toEqual({
      date: "2026-10-12",
      key: "absence-weekly:2026-10-12",
    });
    expect(weeklyAbsenceSummaryDue(new Date("2026-10-12T03:30:00Z"))).toBeNull();
    expect(weeklyAbsenceSummaryDue(new Date("2026-10-11T06:00:00Z"))).toBeNull();

    await prisma.botRecipient.create({
      data: {
        organizationId: DEMO_ORG_ID,
        userId: admin.userId,
        chatId: chat,
        branchIds: [branchId],
      },
    });
    // Other recipients of the demo centre who listen to every branch get it too.
    const queued = await runWeeklyAbsenceSummary(prisma, TODAY, { branchIds: [branchId] });
    expect(queued).toBeGreaterThanOrEqual(1);
    const jobs = await prisma.job.findMany({
      where: { type: "telegram.send", payload: { path: ["chatId"], equals: chat } },
    });
    expect(jobs).toHaveLength(1);
    const text = (jobs[0]!.payload as { text: string }).text;
    expect(text).toContain(`${TAG} Branch`);
    expect(text).toContain(`${TAG} Dan`);
    expect(text).toContain(`${TAG} Group`);
    expect(text).not.toContain(`${TAG} Alice`);
  });
});
