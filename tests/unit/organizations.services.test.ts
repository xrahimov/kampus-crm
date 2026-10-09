/**
 * Site owner creates a second centre (A-108): the new CEO signs in and sees
 * only their own branches, staff and catalogue; nobody else may create centres.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/server/db/prisma";
import type { Actor } from "@/server/rbac/authorize";
import {
  assertWebhookSecret,
  updateIntegration,
} from "@/server/services/integrations/integrations.service";
import { listRoles } from "@/server/services/staff/roles.service";
import { listStaff } from "@/server/services/staff/staff.service";
import { listBranches } from "@/server/services/settings/branches.service";
import {
  createOrganization,
  listOrganizations,
  updateOrganization,
} from "@/server/services/settings/organizations.service";
import { listPaymentMethods } from "@/server/services/settings/payment-methods.service";
import { login } from "@/server/services/auth.service";
import { resolveCurrentUser } from "@/server/auth/current-user";
import { handleStudentCommand } from "@/server/services/telegram/student-telegram.service";

import { DEMO_ORG_ID, demoBranchIds } from "./support/tenant";

const RUN = String(Date.now() % 100_000).padStart(5, "0");
const TAG = `o${RUN}`;
const phone = (n: number) => `+99893${RUN}${String(n).padStart(2, "0")}`;
const PASSWORD = "FirstPass!2026";

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
const demoCeo: Actor = { ...owner, fullName: "Demo CEO", isSiteOwner: false };

let createdOrgId = "";

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
  demoCeo.userId = user.id;
  owner.branchIds = await demoBranchIds();
  demoCeo.branchIds = owner.branchIds;
});

afterAll(async () => {
  if (createdOrgId) {
    await prisma.user.deleteMany({ where: { organizationId: createdOrgId } });
    await prisma.branch.deleteMany({ where: { organizationId: createdOrgId } });
    await prisma.organization.delete({ where: { id: createdOrgId } });
  }
  await prisma.user.deleteMany({ where: { phone: { in: [phone(1), phone(2)] } } });
  await prisma.$disconnect();
});

describe("organisations (site owner)", () => {
  it("refuses everyone who is not the site owner, whatever their role", async () => {
    await expect(listOrganizations(demoCeo)).rejects.toMatchObject({ code: "FORBIDDEN" });
    await expect(
      createOrganization(demoCeo, {
        name: "x",
        branches: ["y"],
        ceoFullName: "z",
        ceoPhone: phone(9),
        ceoPassword: PASSWORD,
      }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("creates a centre with branches, a cash method and a CEO who sees only their own centre", async () => {
    const org = await createOrganization(owner, {
      name: `${TAG} Centre`,
      branches: [`${TAG} North`, `${TAG} South`, `${TAG} North`],
      ceoFullName: `${TAG} Hakim`,
      ceoPhone: phone(2),
      ceoPassword: PASSWORD,
    });
    createdOrgId = org.id;
    expect(org.branches.map((b) => b.name).sort()).toEqual([`${TAG} North`, `${TAG} South`]);
    expect(org.ceo).toEqual({ fullName: `${TAG} Hakim`, phone: phone(2) });
    expect(org.staffCount).toBe(1);
    expect(org.studentsCount).toBe(0);

    const listed = await listOrganizations(owner);
    expect(listed.map((o) => o.id)).toContain(org.id);
    expect(listed.map((o) => o.id)).toContain(DEMO_ORG_ID);

    // The new CEO signs in like anyone else and lands inside their own centre only.
    const issued = await login({ phone: phone(2), password: PASSWORD }, { ip: "10.0.0.90" });
    const current = await resolveCurrentUser(issued.token);
    expect(current).not.toBeNull();
    const ceo = current!.actor;
    expect(ceo.organizationId).toBe(org.id);
    expect(ceo.isSiteOwner).toBe(false);
    expect(ceo.permissions).toContain("*");
    expect(new Set(ceo.branchIds)).toEqual(new Set(org.branches.map((b) => b.id)));
    expect((await listBranches(ceo)).map((b) => b.id).sort()).toEqual(
      org.branches.map((b) => b.id).sort(),
    );
    const staff = await listStaff(ceo, "staff", {
      page: 1,
      pageSize: 50,
      skip: 0,
      take: 50,
      sort: { field: "fullName", direction: "asc" },
      q: undefined,
    });
    expect(staff.items.map((s) => s.phone)).toEqual([phone(2)]);
    const methods = await listPaymentMethods(ceo);
    expect(methods.map((m) => m.name)).toEqual(["Naqd"]);
    // System roles are shared; the demo centre's custom roles are not.
    const roles = await listRoles(ceo);
    expect(roles.some((r) => r.code === "CEO")).toBe(true);
    expect(roles.every((r) => r.isSystem)).toBe(true);
    // The site owner is not a member of the new centre and cannot see its data from theirs.
    expect((await listBranches(owner)).some((b) => b.id === org.branches[0]!.id)).toBe(false);
  });

  it("routes a webhook to the centre whose secret it presents", async () => {
    const issued = await login({ phone: phone(2), password: PASSWORD }, { ip: "10.0.0.90" });
    const ceo = (await resolveCurrentUser(issued.token))!.actor;
    await updateIntegration(ceo, "TELEGRAM", {
      isEnabled: true,
      botToken: `${TAG}-token`,
      webhookSecret: `${TAG}-hook`,
      botUsername: `${TAG}_bot`,
      weeklyReport: true,
    });
    expect(await assertWebhookSecret(prisma, "TELEGRAM", `${TAG}-hook`)).toBe(createdOrgId);
    await expect(assertWebhookSecret(prisma, "TELEGRAM", `${TAG}-other`)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
    // A student of another centre cannot link through this centre's bot.
    const demoStudent = await prisma.student.findFirst({
      where: { branch: { organizationId: DEMO_ORG_ID }, isArchived: false },
      select: { id: true },
    });
    const code = `${TAG}codecodecode`;
    await prisma.student.update({ where: { id: demoStudent!.id }, data: { telegramCode: code } });
    expect(
      await handleStudentCommand(prisma, createdOrgId, {
        chatId: `${RUN}01`,
        text: `/start ${code}`,
        languageCode: "en",
      }),
    ).not.toMatch(/linked/i);
    expect(await prisma.studentTelegramChat.count({ where: { chatId: `${RUN}01` } })).toBe(0);
    await prisma.student.update({ where: { id: demoStudent!.id }, data: { telegramCode: null } });
  });

  it("rejects a CEO phone that already has an account anywhere on the server", async () => {
    await expect(
      createOrganization(owner, {
        name: `${TAG} Dup`,
        branches: ["A"],
        ceoFullName: "Dup",
        ceoPhone: phone(2),
        ceoPassword: PASSWORD,
      }),
    ).rejects.toMatchObject({ code: "VALIDATION", fields: { ceoPhone: ["validation.duplicate"] } });
  });

  it("renames a centre and audits it under the site owner's centre", async () => {
    const renamed = await updateOrganization(owner, createdOrgId, { name: `${TAG} Renamed` });
    expect(renamed.name).toBe(`${TAG} Renamed`);
    const audit = await prisma.auditLog.findFirst({
      where: { action: "organization.update", entityId: createdOrgId },
    });
    expect(audit?.organizationId).toBe(DEMO_ORG_ID);
  });
});
