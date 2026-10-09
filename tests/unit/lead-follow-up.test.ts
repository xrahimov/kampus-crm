/**
 * Lead follow-up (A-126): owners, next-contact dates, the contact log, the
 * "Calls today" list and the morning reminder, against the real database.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { shiftDate } from "@/lib/lead-follow-up";
import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/rbac/default-roles";
import type { LeadCallSortField } from "@/lib/validation/leads";
import { prisma } from "@/server/db/prisma";
import type { ParsedList } from "@/server/http/list-query";
import type { Actor } from "@/server/rbac/authorize";
import { createBoard } from "@/server/services/leads/boards.service";
import {
  leadFollowUpDue,
  listLeadCalls,
  listLeadContacts,
  logLeadContact,
  runDailyLeadFollowUp,
} from "@/server/services/leads/follow-up.service";
import {
  createLead,
  getBoardView,
  getLeadOptions,
  setLeadArchived,
  updateLead,
} from "@/server/services/leads/leads.service";
import { tashkentToday } from "@/server/services/leads/shared";
import { createBranch } from "@/server/services/settings/branches.service";
import { DEMO_ORG_ID, demoBranchIds } from "./support/tenant";

const RUN = String(Date.now() % 100_000).padStart(5, "0");
const TAG = `lf${RUN}`;
const phone = (n: number) => `+99893${RUN}${String(n).padStart(2, "0")}`;

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
const admin = actor("Admin", ["ADMIN"], [...DEFAULT_ROLE_PERMISSIONS.ADMIN]);
const watcher = actor("Watcher", ["WATCHER"], ["leads.view"]);
const outsider = actor("Outsider", ["ADMIN"], [...DEFAULT_ROLE_PERMISSIONS.ADMIN]);

const today = tashkentToday();
const yesterday = shiftDate(today, -1);
const tomorrow = shiftDate(today, 1);

let branch: string;
let branchB: string;
let boardId: string;
let columnId: string;
const leads = {} as Record<"alice" | "bob" | "carl" | "dan", string>;

const query = (
  sort: { field: LeadCallSortField; direction: "asc" | "desc" } = {
    field: "nextContactAt",
    direction: "asc",
  },
  q?: string,
): ParsedList<LeadCallSortField> => ({
  page: 1,
  pageSize: 50,
  skip: 0,
  take: 50,
  q,
  sort,
});

const leadInput = (name: string, n: number) => ({
  columnId,
  fullName: `${TAG} ${name}`,
  phones: [phone(n)],
  birthDate: null,
  age: null,
  sourceId: null,
  teacherId: null,
  days: null,
  lessonTime: null,
  status: "NEW" as const,
  temperature: null,
  comment: null,
});

beforeAll(async () => {
  const adminRole = await prisma.role.findUniqueOrThrow({ where: { code: "ADMIN" } });
  for (const [a, n] of [
    [ceo, 1],
    [admin, 2],
    [watcher, 3],
    [outsider, 4],
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
  await prisma.userRole.createMany({
    data: [
      { userId: admin.userId, roleId: adminRole.id },
      { userId: outsider.userId, roleId: adminRole.id },
    ],
  });
  branch = (await createBranch(ceo, { name: `${TAG} A`, isActive: true })).id;
  branchB = (await createBranch(ceo, { name: `${TAG} B`, isActive: true })).id;
  ceo.branchIds = await demoBranchIds();
  ceo.activeBranchId = branch;
  await prisma.userBranch.createMany({
    data: [
      { userId: admin.userId, branchId: branch },
      { userId: watcher.userId, branchId: branch },
      { userId: outsider.userId, branchId: branchB },
    ],
  });
  admin.branchIds = [branch];
  watcher.branchIds = [branch];
  outsider.branchIds = [branchB];
  boardId = (await createBoard(ceo, { name: `${TAG} Board`, branchId: branch })).id;
  columnId = (await prisma.leadColumn.findFirstOrThrow({ where: { boardId } })).id;
  await prisma.botRecipient.create({
    data: {
      organizationId: DEMO_ORG_ID,
      userId: admin.userId,
      chatId: `${TAG}chat`,
      branchIds: [],
    },
  });
});

afterAll(async () => {
  const users = [ceo, admin, watcher, outsider].map((a) => a.userId);
  const branches = [branch, branchB];
  const rows = await prisma.lead.findMany({ where: { branchId: { in: branches } } });
  await prisma.auditLog.deleteMany({
    where: { OR: [{ branchId: { in: branches } }, { entityId: { in: rows.map((l) => l.id) } }] },
  });
  await prisma.job.deleteMany({ where: { uniqueKey: { startsWith: `lead-calls:${today}:` } } });
  await prisma.notification.deleteMany({ where: { userId: { in: users } } });
  await prisma.botRecipient.deleteMany({ where: { userId: { in: users } } });
  await prisma.lead.deleteMany({ where: { branchId: { in: branches } } });
  await prisma.leadBoard.deleteMany({ where: { branchId: { in: branches } } });
  await prisma.auditLog.deleteMany({ where: { actorId: { in: users } } });
  await prisma.user.deleteMany({ where: { id: { in: users } } });
  await prisma.branch.deleteMany({ where: { id: { in: branches } } });
  await prisma.$disconnect();
});

describe("owners and next-contact dates", () => {
  it("defaults the owner to the creator, offers the branch's lead handlers and validates them", async () => {
    const options = await getLeadOptions(ceo);
    expect(options.owners.map((o) => o.id)).toContain(admin.userId);
    expect(options.owners.map((o) => o.id)).not.toContain(watcher.userId);
    expect(options.owners.map((o) => o.id)).not.toContain(outsider.userId);

    const alice = await createLead(admin, { ...leadInput("Alice", 10), nextContactAt: yesterday });
    expect(alice.ownerId).toBe(admin.userId);
    expect(alice.ownerName).toBe(`${TAG} Admin`);
    expect(alice.nextContactAt).toBe(yesterday);
    leads.alice = alice.id;
    const bob = await createLead(admin, { ...leadInput("Bob", 11), nextContactAt: today });
    leads.bob = bob.id;
    // A form lead has nobody to follow it up yet.
    const carl = await createLead(ceo, leadInput("Carl", 12), { createdById: null });
    expect(carl.ownerId).toBeNull();
    leads.carl = carl.id;
    const dan = await createLead(ceo, leadInput("Dan", 13), { createdById: null });
    leads.dan = dan.id;

    // Only people who may work leads in the branch can own them.
    await expect(
      createLead(ceo, { ...leadInput("Eve", 14), ownerId: watcher.userId }),
    ).rejects.toMatchObject({ code: "VALIDATION" });
    await expect(updateLead(ceo, carl.id, { ownerId: outsider.userId })).rejects.toMatchObject({
      code: "VALIDATION",
    });
    const updated = await updateLead(ceo, carl.id, { nextContactAt: tomorrow });
    expect(updated.nextContactAt).toBe(tomorrow);
    expect(updated.ownerId).toBeNull();

    const mine = await getBoardView(ceo, { boardId, ownerId: admin.userId });
    expect(mine.columns[0]?.leads.map((l) => l.id).sort()).toEqual([alice.id, bob.id].sort());
    const nobody = await getBoardView(ceo, { boardId, ownerId: "none" });
    expect(nobody.columns[0]?.leads.map((l) => l.id).sort()).toEqual([carl.id, dan.id].sort());
    // Alice is overdue and Bob is due today.
    expect(mine.due).toBe(2);
    expect(mine.today).toBe(today);
  });

  it("lists the calls by range and owner with the day's counts", async () => {
    const due = await listLeadCalls(ceo, query(), {}, prisma, today);
    expect(due.items.map((l) => l.id)).toEqual([leads.alice, leads.bob]);
    expect(due.summary).toEqual({ overdue: 1, today: 1, upcoming: 1, none: 1 });
    expect(due.today).toBe(today);
    expect(due.items[0]).toMatchObject({
      overdueDays: 1,
      ownerName: `${TAG} Admin`,
      boardName: `${TAG} Board`,
      lastContactBy: null,
    });
    expect(due.items[1]?.overdueDays).toBe(0);

    const overdue = await listLeadCalls(ceo, query(), { range: "OVERDUE" }, prisma, today);
    expect(overdue.items.map((l) => l.id)).toEqual([leads.alice]);
    const todays = await listLeadCalls(ceo, query(), { range: "TODAY" }, prisma, today);
    expect(todays.items.map((l) => l.id)).toEqual([leads.bob]);
    const upcoming = await listLeadCalls(ceo, query(), { range: "UPCOMING" }, prisma, today);
    expect(upcoming.items.map((l) => l.id)).toEqual([leads.carl]);
    expect(upcoming.items[0]?.overdueDays).toBeNull();
    const none = await listLeadCalls(ceo, query(), { range: "NONE" }, prisma, today);
    expect(none.items.map((l) => l.id)).toEqual([leads.dan]);

    const unowned = await listLeadCalls(ceo, query(), { ownerId: "none" }, prisma, today);
    expect(unowned.total).toBe(0);
    expect(unowned.summary).toEqual({ overdue: 0, today: 0, upcoming: 1, none: 1 });
    const mine = await listLeadCalls(admin, query(), { ownerId: "me" }, prisma, today);
    expect(mine.items.map((l) => l.id)).toEqual([leads.alice, leads.bob]);
    const byName = await listLeadCalls(
      ceo,
      query({ field: "fullName", direction: "desc" }, "Carl"),
      { range: "UPCOMING" },
      prisma,
      today,
    );
    expect(byName.items.map((l) => l.id)).toEqual([leads.carl]);

    // Viewers may read the list; another branch sees nothing of it.
    expect((await listLeadCalls(watcher, query(), {}, prisma, today)).total).toBe(2);
    expect((await listLeadCalls(outsider, query(), {}, prisma, today)).total).toBe(0);
  });
});

describe("logging contacts", () => {
  it("moves the status, sets the next date, keeps a history and gives ownerless leads to the caller", async () => {
    await expect(
      logLeadContact(watcher, leads.alice, { channel: "CALL", outcome: "NO_ANSWER" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      logLeadContact(outsider, leads.alice, { channel: "CALL", outcome: "NO_ANSWER" }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    // No answer on a new lead: "Could not reach", call again tomorrow.
    const alice = await logLeadContact(admin, leads.alice, {
      channel: "CALL",
      outcome: "NO_ANSWER",
      nextContactAt: tomorrow,
    });
    expect(alice.status).toBe("UNREACHABLE");
    expect(alice.lastOutcome).toBe("NO_ANSWER");
    expect(alice.nextContactAt).toBe(tomorrow);
    expect(alice.lastContactAt).not.toBeNull();

    // Reached: "Contacted"; the date is cleared on purpose.
    const bob = await logLeadContact(admin, leads.bob, {
      channel: "TELEGRAM",
      outcome: "WILL_COME",
      note: "Trial lesson on Monday",
      nextContactAt: null,
    });
    expect(bob.status).toBe("CONTACTED");
    expect(bob.nextContactAt).toBeNull();

    // Staff may pick the status themselves; the caller becomes the owner.
    const carl = await logLeadContact(ceo, leads.carl, {
      channel: "NOTE",
      outcome: "THINKING",
      status: "NEW",
    });
    expect(carl.status).toBe("NEW");
    expect(carl.ownerId).toBe(ceo.userId);
    expect(carl.nextContactAt).toBe(tomorrow);

    const dan = await logLeadContact(admin, leads.dan, {
      channel: "CALL",
      outcome: "NOT_INTERESTED",
    });
    expect(dan.status).toBe("LOST");
    expect(dan.ownerId).toBe(admin.userId);

    const history = await listLeadContacts(ceo, leads.alice);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      channel: "CALL",
      outcome: "NO_ANSWER",
      nextContactAt: tomorrow,
      createdBy: `${TAG} Admin`,
    });
    const audit = await prisma.auditLog.findFirst({
      where: { entityId: leads.alice, action: "lead.contact" },
    });
    expect(audit).not.toBeNull();

    const calls = await listLeadCalls(ceo, query(), { range: "UPCOMING" }, prisma, today);
    const row = calls.items.find((l) => l.id === leads.alice);
    expect(row?.lastContactBy).toBe(`${TAG} Admin`);

    // Nothing is logged on an archived lead.
    await setLeadArchived(ceo, leads.dan, true);
    await expect(
      logLeadContact(admin, leads.dan, { channel: "CALL", outcome: "OTHER" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await setLeadArchived(ceo, leads.dan, false);
  });
});

describe("the morning reminder", () => {
  it("is due once a day from 09:00 Tashkent time", () => {
    expect(leadFollowUpDue(new Date("2026-10-12T03:30:00Z"))).toBeNull();
    expect(leadFollowUpDue(new Date("2026-10-12T04:00:00Z"))).toEqual({
      date: "2026-10-12",
      key: "lead-calls:2026-10-12",
    });
  });

  it("tells each owner about their calls, on the bell and on Telegram, and the branch about ownerless leads", async () => {
    // Alice overdue and Bob today for the admin; Carl today for the CEO; Dan today with nobody.
    await updateLead(ceo, leads.alice, { nextContactAt: yesterday });
    await updateLead(ceo, leads.bob, { nextContactAt: today });
    await updateLead(ceo, leads.carl, { nextContactAt: today });
    await updateLead(ceo, leads.dan, { nextContactAt: today, ownerId: null });

    const run = await runDailyLeadFollowUp(prisma, today, { branchIds: [branch] });
    expect(run.queued).toBe(1);
    expect(run.notified).toBeGreaterThanOrEqual(3);

    const adminNotices = await prisma.notification.findMany({
      where: { userId: admin.userId, kind: "LEAD_FOLLOW_UP" },
      orderBy: { createdAt: "asc" },
    });
    const params = adminNotices.map((n) => n.params as { count: number; overdue: number });
    expect(params).toContainEqual({ count: 2, overdue: 1 });
    // The admin also hears about Dan, whom nobody owns.
    expect(params).toContainEqual({ count: 1, overdue: 0 });
    expect(adminNotices.map((n) => n.href)).toContain("/leads/calls?ownerId=me");
    expect(adminNotices.map((n) => n.href)).toContain("/leads/calls?ownerId=none");
    const ceoNotice = await prisma.notification.findFirst({
      where: { userId: ceo.userId, kind: "LEAD_FOLLOW_UP", href: "/leads/calls?ownerId=me" },
    });
    expect(ceoNotice?.params).toEqual({ count: 1, overdue: 0 });
    // Nobody who may not work leads is told.
    expect(
      await prisma.notification.count({
        where: { userId: watcher.userId, kind: "LEAD_FOLLOW_UP" },
      }),
    ).toBe(0);

    const job = await prisma.job.findUnique({
      where: { uniqueKey: `lead-calls:${today}:${admin.userId}` },
    });
    const payload = job?.payload as { chatId: string; text: string; organizationId: string };
    expect(payload.chatId).toBe(`${TAG}chat`);
    expect(payload.organizationId).toBe(DEMO_ORG_ID);
    expect(payload.text).toContain(`${TAG} Alice`);
    expect(payload.text).toContain(`${TAG} Bob`);
    expect(payload.text).not.toContain(`${TAG} Carl`);
  });
});
