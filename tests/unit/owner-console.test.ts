import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { resolveCurrentUser } from "@/server/auth/current-user";
import { prisma } from "@/server/db/prisma";
import type { Actor } from "@/server/rbac/authorize";
import { login } from "@/server/services/auth.service";
import {
  exportOrganization,
  setOrganizationSuspended,
} from "@/server/services/settings/owner-console.service";
import {
  createOrganization,
  listOrganizations,
} from "@/server/services/settings/organizations.service";

import { DEMO_ORG_ID } from "./support/tenant";

const RUN = String(Date.now() % 100_000).padStart(5, "0");
const TAG = `oc${RUN}`;
const phone = (n: number) => `+99892${RUN}${String(n).padStart(2, "0")}`;
const PASSWORD = "FirstPass!2026";
const ctx = { ip: "127.0.0.1", userAgent: "vitest" };

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

let orgId = "";

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
  const org = await createOrganization(owner, {
    name: `${TAG} Centre`,
    branches: [`${TAG} Main`],
    ceoFullName: `${TAG} Boss`,
    ceoPhone: phone(2),
    ceoPassword: PASSWORD,
  });
  orgId = org.id;
});

afterAll(async () => {
  if (orgId) {
    await prisma.auditLog.deleteMany({ where: { organizationId: orgId } });
    await prisma.loginLog.deleteMany({ where: { user: { organizationId: orgId } } });
    await prisma.session.deleteMany({ where: { user: { organizationId: orgId } } });
    await prisma.userRole.deleteMany({ where: { user: { organizationId: orgId } } });
    await prisma.userBranch.deleteMany({ where: { user: { organizationId: orgId } } });
    await prisma.user.deleteMany({ where: { organizationId: orgId } });
    await prisma.branch.deleteMany({ where: { organizationId: orgId } });
    await prisma.organization.delete({ where: { id: orgId } });
  }
  await prisma.auditLog.deleteMany({ where: { actorId: owner.userId } });
  await prisma.user.deleteMany({ where: { phone: phone(1) } });
  await prisma.$disconnect();
});

describe("site-owner console (A-144)", () => {
  it("shows usage per centre, suspends and resumes it", async () => {
    const first = await login({ phone: phone(2), password: PASSWORD }, ctx);
    expect(first.kind).toBe("session");
    const token = first.kind === "session" ? first.issued.token : "";
    expect(await resolveCurrentUser(token)).not.toBeNull();

    const before = (await listOrganizations(owner)).find((o) => o.id === orgId)!;
    expect(before).toMatchObject({
      suspendedAt: null,
      groupsCount: 0,
      archivedStudentsCount: 0,
      storageBytes: 0,
      integrations: [],
    });
    expect(before.lastSignInAt).not.toBeNull();

    await expect(
      setOrganizationSuspended(owner, DEMO_ORG_ID, { suspended: true }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
    await expect(
      setOrganizationSuspended({ ...owner, isSiteOwner: false }, orgId, { suspended: true }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });

    const suspended = await setOrganizationSuspended(owner, orgId, {
      suspended: true,
      reason: "unpaid",
    });
    expect(suspended.suspendedAt).not.toBeNull();
    expect(suspended.suspendedReason).toBe("unpaid");
    // Signed out at once, and kept out.
    expect(await resolveCurrentUser(token)).toBeNull();
    await expect(login({ phone: phone(2), password: PASSWORD }, ctx)).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "errors.organizationSuspended",
    });
    const during = (await listOrganizations(owner)).find((o) => o.id === orgId)!;
    expect(during.suspendedAt).toBe(suspended.suspendedAt);

    const resumed = await setOrganizationSuspended(owner, orgId, { suspended: false });
    expect(resumed).toEqual({ suspendedAt: null, suspendedReason: null });
    const again = await login({ phone: phone(2), password: PASSWORD }, ctx);
    expect(again.kind).toBe("session");
  });

  it("exports a centre's data without secrets", async () => {
    await expect(exportOrganization({ ...owner, isSiteOwner: false }, orgId)).rejects.toMatchObject(
      { code: "FORBIDDEN" },
    );
    const data = await exportOrganization(owner, orgId);
    expect(data.format).toBe("kampus-organization/1");
    expect(data.organization).toMatchObject({ id: orgId, name: `${TAG} Centre` });
    expect(data.tables.branches).toHaveLength(1);
    expect(data.tables.users).toHaveLength(1);
    const user = data.tables.users![0] as Record<string, unknown>;
    expect(user.phone).toBe(phone(2));
    expect(user).not.toHaveProperty("passwordHash");
    expect((user.roles as Array<{ role: { code: string } }>)[0]!.role.code).toBe("CEO");
    expect(data.tables.paymentMethods).toHaveLength(1);
    expect(data.tables.students).toEqual([]);
    expect(JSON.stringify(data)).not.toContain("passwordHash");
    const audit = await prisma.auditLog.findFirst({
      where: { entityId: orgId, action: "organization.export" },
    });
    expect(audit).not.toBeNull();
  });
});
