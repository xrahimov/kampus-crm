/**
 * The parents' page (A-130), against the real database: the link is made on
 * first use, lists every child's groups with their own page tokens, and a new
 * link retires the old one.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/server/db/prisma";
import type { Actor } from "@/server/rbac/authorize";
import { createGroup } from "@/server/services/groups/groups.service";
import { addMember } from "@/server/services/groups/memberships.service";
import { createBranch } from "@/server/services/settings/branches.service";
import { createCourse } from "@/server/services/settings/courses.service";
import { linkSibling } from "@/server/services/students/families.service";
import { getFamilyLink, getFamilyPortal } from "@/server/services/students/family-portal.service";
import { listStudentLinks } from "@/server/services/video/video.service";
import { DEMO_ORG_ID, demoBranchIds } from "./support/tenant";

const RUN = String(Date.now() % 100_000).padStart(5, "0");
const TAG = `fp${RUN}`;
const phone = (n: number) => `+99896${RUN}${String(n).padStart(2, "0")}`;

const ceo: Actor = {
  userId: "",
  fullName: "CEO",
  roles: ["CEO"],
  permissions: ["*"],
  organizationId: DEMO_ORG_ID,
  branchIds: [],
  activeBranchId: null,
};

let branchId: string;
let groupId: string;
let one: string;
let two: string;
let three: string;

beforeAll(async () => {
  const user = await prisma.user.create({
    data: {
      phone: phone(1),
      fullName: `${TAG} CEO`,
      passwordHash: "x",
      organizationId: DEMO_ORG_ID,
    },
  });
  ceo.userId = user.id;
  branchId = (await createBranch(ceo, { name: `${TAG} A`, isActive: true })).id;
  ceo.branchIds = await demoBranchIds();
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
      teachers: [],
      startDate: "2026-09-01",
      endDate: null,
      status: "ACTIVE",
    })
  ).id;
  const member = (name: string, n: number) =>
    addMember(ceo, groupId, {
      newStudent: { fullName: `${TAG} ${name}`, phone: phone(n) },
      joinedAt: "2026-09-01",
      status: "ACTIVE",
      customPrice: null,
      note: null,
    });
  one = (await member("Ali", 11)).studentId;
  two = (await member("Vali", 12)).studentId;
  three = (await member("Zafar", 13)).studentId;
});

afterAll(async () => {
  await prisma.family.deleteMany({ where: { name: { startsWith: TAG } } });
});

describe("parents' page (A-130)", () => {
  it("has no link before a family exists", async () => {
    await expect(getFamilyLink(ceo, one)).resolves.toBeNull();
    await expect(getFamilyPortal("not-a-real-token-at-all-xx")).resolves.toBeNull();
  });

  it("makes the link on first use and lists every child's groups with their page tokens", async () => {
    await linkSibling(ceo, one, { studentId: two, name: `${TAG} Family` });
    const first = await getFamilyLink(ceo, one);
    expect(first!.url).toMatch(/\/family\/[A-Za-z0-9_-]{20,}$/);
    // The same link from the sibling's card.
    expect((await getFamilyLink(ceo, two))!.url).toBe(first!.url);
    const token = first!.url.split("/family/")[1]!;
    const page = await getFamilyPortal(token);
    expect(page).not.toBeNull();
    expect(page!.familyName).toBe(`${TAG} Family`);
    expect(page!.children.map((c) => c.fullName)).toEqual([`${TAG} Ali`, `${TAG} Vali`]);
    const links = await listStudentLinks(ceo, groupId);
    for (const child of page!.children) {
      expect(child.groups).toHaveLength(1);
      const g = child.groups[0]!;
      expect(g).toMatchObject({
        groupName: `${TAG} A1`,
        courseName: `${TAG} German`,
        status: "ACTIVE",
      });
      expect(g.token).toBe(links.find((l) => l.fullName === child.fullName)!.token);
      expect(g.nextLesson).not.toBeNull();
      expect(g.balance).toBeLessThanOrEqual(0);
    }
    // A third child who is not in the family stays off the page.
    expect(page!.children.some((c) => c.id === three)).toBe(false);
  });

  it("a new link retires the old one", async () => {
    const before = (await getFamilyLink(ceo, one))!.url.split("/family/")[1]!;
    const after = (await getFamilyLink(ceo, one, { reset: true }))!.url.split("/family/")[1]!;
    expect(after).not.toBe(before);
    await expect(getFamilyPortal(before)).resolves.toBeNull();
    await expect(getFamilyPortal(after)).resolves.not.toBeNull();
    await expect(
      getFamilyLink({ ...ceo, permissions: ["students.view"] }, one, { reset: true }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
