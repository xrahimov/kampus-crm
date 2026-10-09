/**
 * Announcements (A-129), against the real database: who may post where, who
 * is addressed, what gets queued, what the student's page shows and how reads
 * are counted. Rows carry a run-specific tag and are removed at the end.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { DEFAULT_ROLE_PERMISSIONS } from "@/lib/rbac/default-roles";
import type { AnnouncementSortField } from "@/lib/validation/announcements";
import { prisma } from "@/server/db/prisma";
import type { ParsedList } from "@/server/http/list-query";
import type { Actor } from "@/server/rbac/authorize";
import {
  announcementGroupOptions,
  createAnnouncement,
  deleteAnnouncement,
  listAnnouncements,
  listPortalAnnouncements,
  markPortalAnnouncementsRead,
} from "@/server/services/announcements/announcements.service";
import { createGroup } from "@/server/services/groups/groups.service";
import { addMember } from "@/server/services/groups/memberships.service";
import { createBranch } from "@/server/services/settings/branches.service";
import { createCourse } from "@/server/services/settings/courses.service";
import { listStudentLinks } from "@/server/services/video/video.service";
import { DEMO_ORG_ID, demoBranchIds } from "./support/tenant";

const RUN = String(Date.now() % 100_000).padStart(5, "0");
const TAG = `an${RUN}`;
const phone = (n: number) => `+99897${RUN}${String(n).padStart(2, "0")}`;

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
const outsider = actor("Outsider", ["ADMIN"], [...DEFAULT_ROLE_PERMISSIONS.ADMIN]);

let branchId: string;
let groupId: string;
let token: string;
const created: string[] = [];

const query: ParsedList<AnnouncementSortField> = {
  page: 1,
  pageSize: 50,
  skip: 0,
  take: 50,
  q: undefined,
  sort: { field: "createdAt", direction: "desc" },
};

beforeAll(async () => {
  const teacherRole = await prisma.role.findFirstOrThrow({ where: { code: "TEACHER" } });
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
  await prisma.userRole.create({ data: { userId: teacher.userId, roleId: teacherRole.id } });
  branchId = (await createBranch(ceo, { name: `${TAG} A`, isActive: true })).id;
  const otherBranch = (await createBranch(ceo, { name: `${TAG} B`, isActive: true })).id;
  ceo.branchIds = await demoBranchIds();
  await prisma.userBranch.create({ data: { userId: teacher.userId, branchId } });
  teacher.branchIds = [branchId];
  await prisma.userBranch.create({ data: { userId: outsider.userId, branchId: otherBranch } });
  outsider.branchIds = [otherBranch];
  const courseId = (
    await createCourse(ceo, {
      branchId,
      name: `${TAG} German`,
      description: undefined,
      price: 300_000,
      durationMonths: 2,
      gradingSystemId: null,
      color: null,
    })
  ).id;
  groupId = (
    await createGroup(ceo, {
      branchId,
      name: `${TAG} A1`,
      courseId,
      gradingSystemId: null,
      weekdayPattern: "ODD",
      slots: [1, 3, 5].map((weekday) => ({
        weekday,
        startTime: "18:00",
        endTime: "19:30",
        roomId: null,
      })),
      teachers: [{ userId: teacher.userId, role: "MAIN", shareType: "PERCENT", shareValue: 40 }],
      startDate: "2026-09-01",
      endDate: null,
      status: "ACTIVE",
    })
  ).id;
  await addMember(ceo, groupId, {
    newStudent: { fullName: `${TAG} Student One`, phone: phone(11) },
    joinedAt: "2026-09-01",
    status: "ACTIVE",
    customPrice: null,
    note: null,
  });
  await addMember(ceo, groupId, {
    newStudent: { fullName: `${TAG} Student Two` },
    joinedAt: "2026-09-01",
    status: "ACTIVE",
    customPrice: null,
    note: null,
  });
  const links = await listStudentLinks(ceo, groupId);
  token = links.find((l) => l.fullName === `${TAG} Student One`)!.token;
});

afterAll(async () => {
  await prisma.announcement.deleteMany({ where: { title: { startsWith: TAG } } });
  await prisma.smsMessage.deleteMany({ where: { text: { startsWith: TAG } } });
});

const input = (over: Record<string, unknown>) => ({
  audience: "GROUP" as const,
  branchId: null,
  groupId,
  title: `${TAG} notice`,
  body: "Lessons move to 19:00 next week.",
  sendSms: false,
  ...over,
});

describe("announcements (A-129)", () => {
  it("a teacher posts to their own group; the whole centre is not theirs to address", async () => {
    expect((await announcementGroupOptions(teacher)).map((g) => g.id)).toEqual([groupId]);
    const row = await createAnnouncement(teacher, input({ title: `${TAG} group notice` }));
    created.push(row.id);
    expect(row).toMatchObject({
      audience: "GROUP",
      groupName: `${TAG} A1`,
      branchId,
      recipients: 2,
      telegramQueued: 0,
      smsQueued: 0,
      reads: 0,
      createdByName: `${TAG} Teacher`,
    });
    await expect(
      createAnnouncement(teacher, input({ audience: "CENTRE", groupId: null })),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      createAnnouncement(
        outsider,
        input({ audience: "BRANCH", groupId: null, branchId, title: `${TAG} x` }),
      ),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("a branch notice with SMS queues one message per student with a phone", async () => {
    const row = await createAnnouncement(
      ceo,
      input({ audience: "BRANCH", groupId: null, branchId, title: `${TAG} branch`, sendSms: true }),
    );
    created.push(row.id);
    expect(row).toMatchObject({ branchName: `${TAG} A`, recipients: 2, smsQueued: 1 });
    const sms = await prisma.smsMessage.findMany({ where: { text: { startsWith: TAG } } });
    expect(sms).toHaveLength(1);
    expect(sms[0]).toMatchObject({
      phone: phone(11),
      recipientType: "STUDENT",
      refKey: `announcement:${row.id}:${sms[0]!.studentId}`,
    });
    const centre = await createAnnouncement(
      ceo,
      input({ audience: "CENTRE", groupId: null, title: `${TAG} centre` }),
    );
    created.push(centre.id);
    expect(centre.recipients).toBeGreaterThanOrEqual(2);
    expect(centre.branchId).toBeNull();
  });

  it("lists what each person may see", async () => {
    const mine = (await listAnnouncements(teacher, query, {})).items.filter((a) =>
      a.title.startsWith(TAG),
    );
    expect(mine.map((a) => a.title).sort()).toEqual(
      [`${TAG} branch`, `${TAG} centre`, `${TAG} group notice`].sort(),
    );
    const theirs = (await listAnnouncements(outsider, query, {})).items.filter((a) =>
      a.title.startsWith(TAG),
    );
    expect(theirs.map((a) => a.title)).toEqual([`${TAG} centre`]);
    const groupsOnly = await listAnnouncements(ceo, query, { audience: "GROUP", groupId });
    expect(groupsOnly.items.map((a) => a.title)).toEqual([`${TAG} group notice`]);
    await expect(
      listAnnouncements(actor("Nobody", ["WATCHER"], ["students.view"]), query, {}),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("the student's page shows the three notices and counts a read once", async () => {
    const list = await listPortalAnnouncements(token);
    expect(list).not.toBeNull();
    const mine = list!.filter((a) => a.title.startsWith(TAG));
    expect(mine.map((a) => a.title)).toEqual([
      `${TAG} centre`,
      `${TAG} branch`,
      `${TAG} group notice`,
    ]);
    expect(mine.map((a) => a.from)).toEqual([expect.any(String), `${TAG} A`, `${TAG} A1`]);
    expect(mine.every((a) => !a.read)).toBe(true);
    const groupNotice = mine.find((a) => a.audience === "GROUP")!;
    const after = await markPortalAnnouncementsRead(token, [groupNotice.id, groupNotice.id]);
    expect(after!.unread).toBe(list!.length - 1);
    await markPortalAnnouncementsRead(token, [groupNotice.id]);
    const row = (await listAnnouncements(ceo, query, { groupId })).items[0]!;
    expect(row.reads).toBe(1);
    expect((await listPortalAnnouncements(token))!.find((a) => a.id === groupNotice.id)!.read).toBe(
      true,
    );
    await expect(listPortalAnnouncements("not-a-real-token-at-all")).resolves.toBeNull();
  });

  it("deletes within scope only", async () => {
    const [groupNotice, branchNotice] = created as [string, string, string];
    await expect(deleteAnnouncement(outsider, branchNotice)).rejects.toMatchObject({
      code: "NOT_FOUND",
    });
    await deleteAnnouncement(teacher, groupNotice);
    expect(await prisma.announcement.findUnique({ where: { id: groupNotice } })).toBeNull();
  });
});
