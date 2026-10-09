/**
 * Public page per centre (A-121) against the real database, inside a centre of
 * its own: switched off it is nowhere; switched on it lists courses with prices,
 * the running groups with days, times, teachers and seats, the teachers and the
 * sign-up form, by slug and at the root of the centre's own address.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { orgSettingsSchema } from "@/lib/validation/settings";
import { prisma } from "@/server/db/prisma";
import type { Actor } from "@/server/rbac/authorize";
import { createGroup } from "@/server/services/groups/groups.service";
import { createForm } from "@/server/services/leads/forms.service";
import {
  getPublicCentreBySlug,
  getPublicCentreForHost,
} from "@/server/services/public/centre-page.service";
import { createCourse } from "@/server/services/settings/courses.service";
import { getOrgSettings, updateOrgSettings } from "@/server/services/settings/org-settings.service";
import { createOrganization } from "@/server/services/settings/organizations.service";
import { createRoom } from "@/server/services/settings/rooms.service";
import { createStudent } from "@/server/services/students/students.service";

import { DEMO_ORG_ID, demoBranchIds } from "./support/tenant";

const RUN = String(Date.now() % 100_000).padStart(5, "0");
const TAG = `pp${RUN}`;
const SLUG = `pp-${RUN}`;
const HOST = `${TAG}.kampus.test`;
const phone = (n: number) => `+99891${RUN}${String(n).padStart(2, "0")}`;
const today = new Date(Date.now() + 5 * 60 * 60 * 1000).toISOString().slice(0, 10);

const owner: Actor = {
  userId: "",
  fullName: "Owner",
  organizationId: DEMO_ORG_ID,
  roles: ["CEO"],
  permissions: ["*"],
  branchIds: [],
  activeBranchId: null,
  isSiteOwner: true,
};
let ceo: Actor;
let organizationId: string;
let otherOrganizationId: string;
let branchId: string;
let formId: string;
let teacherId: string;

const director = (orgId: string, userId: string, branch: string): Actor => ({
  userId,
  fullName: `${TAG} Director`,
  organizationId: orgId,
  roles: ["CEO"],
  permissions: ["*"],
  branchIds: [branch],
  activeBranchId: branch,
});

beforeAll(async () => {
  const user = await prisma.user.create({
    data: {
      phone: phone(1),
      fullName: `${TAG} Owner`,
      passwordHash: "x",
      organizationId: DEMO_ORG_ID,
      isSiteOwner: true,
    },
  });
  owner.userId = user.id;
  owner.branchIds = await demoBranchIds();
  const org = await createOrganization(owner, {
    name: `${TAG} Centre`,
    branches: [`${TAG} Main`],
    ceoFullName: `${TAG} Director`,
    ceoPhone: phone(2),
    ceoPassword: "FirstPass!2026",
  });
  organizationId = org.id;
  branchId = org.branches[0]!.id;
  const ceoUser = await prisma.user.findUniqueOrThrow({ where: { phone: phone(2) } });
  ceo = director(organizationId, ceoUser.id, branchId);
  const other = await createOrganization(owner, {
    name: `${TAG} Other`,
    branches: [`${TAG} Other main`],
    ceoFullName: `${TAG} Other director`,
    ceoPhone: phone(3),
    ceoPassword: "FirstPass!2026",
  });
  otherOrganizationId = other.id;

  // A teacher, a room for ten, a course and a group on Tuesdays and Thursdays.
  const teacherRole = await prisma.role.findUniqueOrThrow({ where: { code: "TEACHER" } });
  const teacher = await prisma.user.create({
    data: {
      phone: phone(4),
      fullName: `${TAG} Teacher`,
      passwordHash: "x",
      organizationId,
      roles: { create: { roleId: teacherRole.id } },
      branches: { create: { branchId } },
    },
  });
  teacherId = teacher.id;
  const room = await createRoom(ceo, { branchId, name: `${TAG} Room`, capacity: 10 });
  const courseId = (
    await createCourse(ceo, {
      branchId,
      name: `${TAG} English`,
      description: "Evenings, small groups",
      price: 450_000,
      durationMonths: 4,
      gradingSystemId: null,
      color: "#0F766E",
    })
  ).id;
  await createCourse(ceo, {
    branchId,
    name: `${TAG} Archived`,
    description: undefined,
    price: 100_000,
    durationMonths: 1,
    gradingSystemId: null,
    color: null,
  }).then((c) => prisma.course.update({ where: { id: c.id }, data: { isArchived: true } }));
  const groupId = (
    await createGroup(ceo, {
      branchId,
      name: `${TAG} Evening`,
      courseId,
      gradingSystemId: null,
      weekdayPattern: "CUSTOM",
      slots: [2, 4].map((weekday) => ({
        weekday,
        startTime: "18:00",
        endTime: "19:30",
        roomId: room.id,
      })),
      teachers: [{ userId: teacherId, role: "MAIN", shareType: "PERCENT", shareValue: 40 }],
      startDate: today,
      endDate: null,
      status: "ACTIVE",
    })
  ).id;
  for (const n of [11, 12]) {
    await createStudent(ceo, {
      branchId,
      fullName: `${TAG} Student ${n}`,
      phone: phone(n),
      birthDate: null,
      gender: "MALE",
      photoUrl: null,
      password: null,
      sourceId: null,
      schoolId: null,
      note: null,
      membership: { groupId, joinedAt: today, customPrice: null, note: null, status: "ACTIVE" },
    });
  }
  const board = await prisma.leadBoard.create({ data: { branchId, name: `${TAG} Board` } });
  const column = await prisma.leadColumn.create({ data: { boardId: board.id, name: "New" } });
  formId = (
    await createForm(ceo, {
      name: `${TAG} Form`,
      slug: `${TAG}-signup`,
      columnId: column.id,
      sourceId: null,
      integration: null,
      isActive: true,
    })
  ).id;
  await prisma.organization.update({ where: { id: organizationId }, data: { domain: HOST } });
});

afterAll(async () => {
  // A failed set-up leaves the ids unset; an unset filter would match every centre.
  if (!organizationId) return;
  await prisma.user.deleteMany({ where: { id: owner.userId } });
  for (const orgId of [organizationId, otherOrganizationId]) {
    const branches = (await prisma.branch.findMany({ where: { organizationId: orgId } })).map(
      (b) => b.id,
    );
    await prisma.auditLog.deleteMany({
      where: { OR: [{ branchId: { in: branches } }, { organizationId: orgId }] },
    });
    await prisma.leadForm.deleteMany({ where: { organizationId: orgId } });
    await prisma.leadColumn.deleteMany({ where: { board: { branchId: { in: branches } } } });
    await prisma.leadBoard.deleteMany({ where: { branchId: { in: branches } } });
    await prisma.group.deleteMany({ where: { branchId: { in: branches } } });
    await prisma.student.deleteMany({ where: { branchId: { in: branches } } });
    await prisma.course.deleteMany({ where: { branchId: { in: branches } } });
    await prisma.room.deleteMany({ where: { branchId: { in: branches } } });
    await prisma.paymentMethod.deleteMany({ where: { organizationId: orgId } });
    await prisma.user.deleteMany({ where: { organizationId: orgId } });
    await prisma.branch.deleteMany({ where: { organizationId: orgId } });
    await prisma.organization.deleteMany({ where: { id: orgId } });
  }
  await prisma.$disconnect();
});

describe("a centre's public page", () => {
  it("is nowhere while the switch is off", async () => {
    const settings = await getOrgSettings(ceo);
    expect(settings.publicPage).toBe(false);
    await updateOrgSettings(ceo, { ...settings, publicSlug: SLUG });
    expect(await getPublicCentreBySlug(SLUG)).toBeNull();
    expect(await getPublicCentreForHost(HOST)).toBeNull();
  });

  it("refuses a bad address, a taken address and another centre's form", async () => {
    // The address is checked at the API boundary; a spaced or punctuated one never gets through.
    const { organizationId: _o, logoUrl: _l, ...form } = await getOrgSettings(ceo);
    const parsed = orgSettingsSchema.safeParse({ ...form, publicSlug: "Bad Slug!" });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.map((i) => i.path.join("."))).toContain("publicSlug");
    expect(
      orgSettingsSchema.safeParse({ ...form, publicSlug: " My-Centre " }).data?.publicSlug,
    ).toBe("my-centre");
    const otherCeo = await prisma.user.findUniqueOrThrow({ where: { phone: phone(3) } });
    const otherBranch = await prisma.branch.findFirstOrThrow({
      where: { organizationId: otherOrganizationId },
    });
    const other = director(otherOrganizationId, otherCeo.id, otherBranch.id);
    await expect(
      updateOrgSettings(other, { ...(await getOrgSettings(other)), publicSlug: SLUG }),
    ).rejects.toMatchObject({ fields: { publicSlug: ["validation.duplicate"] } });
    await expect(
      updateOrgSettings(other, { ...(await getOrgSettings(other)), publicFormId: formId }),
    ).rejects.toMatchObject({ fields: { publicFormId: ["validation.formUnknown"] } });
  });

  it("shows courses, the timetable, teachers and the form once switched on", async () => {
    const saved = await updateOrgSettings(ceo, {
      ...(await getOrgSettings(ceo)),
      publicPage: true,
      publicSlug: SLUG,
      publicIntro: "English for everyone",
      publicPhone: "+998 90 123 45 67",
      publicAddress: "Urganch, Al-Xorazmiy 1",
      publicInstagram: "@centre",
      publicTelegram: "https://t.me/centre",
      publicFormId: formId,
    });
    expect(saved.publicPage).toBe(true);
    expect(saved.publicSlug).toBe(SLUG);

    const page = await getPublicCentreBySlug(SLUG.toUpperCase());
    expect(page).not.toBeNull();
    expect(page!.name).toBe(`${TAG} Centre`);
    expect(page!.intro).toBe("English for everyone");
    expect(page!.instagram).toBe("@centre");
    expect(page!.branches).toEqual([`${TAG} Main`]);
    expect(page!.formSlug).toBe(`${TAG}-signup`);
    // The archived course is not on the page; the live one carries its price and its group.
    expect(page!.courses.map((c) => c.name)).toEqual([`${TAG} English`]);
    expect(page!.courses[0]).toMatchObject({ price: 450_000, durationMonths: 4, groups: 1 });
    expect(page!.groups).toHaveLength(1);
    expect(page!.groups[0]).toMatchObject({
      name: `${TAG} Evening`,
      courseName: `${TAG} English`,
      weekdays: [2, 4],
      times: ["18:00–19:30"],
      teachers: [`${TAG} Teacher`],
      startDate: today,
      seatsLeft: 8,
    });
    expect(page!.teachers).toEqual([
      { id: teacherId, fullName: `${TAG} Teacher`, photoUrl: null, courses: [`${TAG} English`] },
    ]);
    // The same page answers at the root of the centre's own address.
    const byHost = await getPublicCentreForHost(`${HOST.toUpperCase()}:443`);
    expect(byHost?.organizationId).toBe(organizationId);
    expect(await getPublicCentreForHost("nobody.kampus.test")).toBeNull();
    expect(await getPublicCentreBySlug("no-such-page")).toBeNull();
  });

  it("falls back to the first active form and hides archived teachers", async () => {
    await prisma.leadForm.update({ where: { id: formId }, data: { isActive: false } });
    await prisma.user.update({ where: { id: teacherId }, data: { isArchived: true } });
    const page = await getPublicCentreBySlug(SLUG);
    expect(page?.formSlug).toBeNull();
    expect(page?.teachers).toEqual([]);
    expect(page?.groups[0]?.teachers).toEqual([]);
  });
});
