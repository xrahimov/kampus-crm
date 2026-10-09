/**
 * A centre's own address (A-114): the site owner claims a host name for a
 * centre, the login page and Caddy's certificate check recognise it, and the
 * links sent to that centre's students use it.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { domainSchema, organizationUpdateSchema } from "@/lib/validation/settings";
import { prisma } from "@/server/db/prisma";
import type { Actor } from "@/server/rbac/authorize";
import {
  appOriginFor,
  appOriginForGroup,
  isServedHost,
  normalizeHost,
  organizationForHost,
  serverOrigin,
} from "@/server/services/settings/domains.service";
import {
  createOrganization,
  updateOrganization,
} from "@/server/services/settings/organizations.service";

import { DEMO_ORG_ID, demoBranchIds } from "./support/tenant";

const RUN = String(Date.now() % 100_000).padStart(5, "0");
const TAG = `d${RUN}`;
const phone = (n: number) => `+99894${RUN}${String(n).padStart(2, "0")}`;
const DOMAIN = `${TAG}.kampus.test`;
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

let orgA = "";
let orgB = "";
let courseId = "";
let groupId = "";

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
  const a = await createOrganization(owner, {
    name: `${TAG} Alpha`,
    branches: [`${TAG} A`],
    ceoFullName: `${TAG} Ceo A`,
    ceoPhone: phone(2),
    ceoPassword: PASSWORD,
  });
  orgA = a.id;
  orgB = (
    await createOrganization(owner, {
      name: `${TAG} Beta`,
      branches: [`${TAG} B`],
      ceoFullName: `${TAG} Ceo B`,
      ceoPhone: phone(3),
      ceoPassword: PASSWORD,
    })
  ).id;
  // A bare group in Alpha's branch: enough for the branch → centre lookup.
  const branchId = a.branches[0]?.id;
  if (!branchId) throw new Error("the new centre has no branch");
  courseId = (
    await prisma.course.create({
      data: { branchId, name: `${TAG} Course`, price: 100_000, durationMonths: 1 },
    })
  ).id;
  groupId = (
    await prisma.group.create({
      data: {
        branchId,
        courseId,
        name: `${TAG} Group`,
        startDate: new Date("2026-10-01"),
        endDate: new Date("2026-11-01"),
      },
    })
  ).id;
});

afterAll(async () => {
  await prisma.group.deleteMany({ where: { id: groupId } });
  await prisma.course.deleteMany({ where: { id: courseId } });
  for (const id of [orgA, orgB].filter(Boolean)) {
    await prisma.user.deleteMany({ where: { organizationId: id } });
    await prisma.branch.deleteMany({ where: { organizationId: id } });
    await prisma.organization.delete({ where: { id } });
  }
  await prisma.user.deleteMany({ where: { id: owner.userId } });
  await prisma.$disconnect();
});

describe("own address per centre (A-114)", () => {
  it("validates the host name: trims, lower-cases, empty clears, junk is refused", () => {
    expect(
      organizationUpdateSchema.parse({ name: "X", domain: " Kingston.Kampus.UZ " }).domain,
    ).toBe("kingston.kampus.uz");
    expect(organizationUpdateSchema.parse({ name: "X", domain: "" }).domain).toBeNull();
    expect(organizationUpdateSchema.parse({ name: "X" }).domain).toBeUndefined();
    for (const bad of [
      "https://kingston.kampus.uz",
      "kingston.kampus.uz/login",
      "kampus",
      "-bad.uz",
      "kingston.kampus.uz:443",
      "a b.uz",
      "kampus.123",
    ]) {
      expect(domainSchema.safeParse(bad).success, bad).toBe(false);
    }
  });

  it("normalises hosts and knows the server's own address", async () => {
    expect(normalizeHost(" Kingston.Kampus.UZ:443 ")).toBe("kingston.kampus.uz");
    expect(normalizeHost("kampus.uz.")).toBe("kampus.uz");
    expect(normalizeHost("")).toBeNull();
    expect(normalizeHost(undefined)).toBeNull();
    expect(normalizeHost("bad host")).toBeNull();
    const own = new URL(serverOrigin()).hostname;
    expect(await isServedHost(own)).toBe(true);
    expect(await isServedHost(`${own}:3000`)).toBe(true);
    expect(await isServedHost("nobody.example.com")).toBe(false);
    expect(await isServedHost("2.31.30.140")).toBe(false);
    expect(await isServedHost(null)).toBe(false);
  });

  it("lets the site owner claim an address that brands the login, passes the certificate check and shapes student links", async () => {
    expect(await appOriginFor(orgA)).toBe(serverOrigin());
    expect(await appOriginForGroup(groupId)).toBe(serverOrigin());

    const dto = await updateOrganization(owner, orgA, { name: `${TAG} Alpha`, domain: DOMAIN });
    expect(dto.domain).toBe(DOMAIN);
    expect(await organizationForHost(`${DOMAIN.toUpperCase()}:443`)).toMatchObject({
      organizationId: orgA,
      name: `${TAG} Alpha`,
      logoUrl: null,
    });
    expect(await isServedHost(DOMAIN)).toBe(true);
    expect(await appOriginFor(orgA)).toBe(`https://${DOMAIN}`);
    expect(await appOriginForGroup(groupId)).toBe(`https://${DOMAIN}`);
    expect(await appOriginFor(orgB)).toBe(serverOrigin());
    expect(await appOriginFor(null)).toBe(serverOrigin());
  });

  it("refuses the same address for two centres and frees it when cleared", async () => {
    await expect(
      updateOrganization(owner, orgB, { name: `${TAG} Beta`, domain: DOMAIN }),
    ).rejects.toMatchObject({ code: "VALIDATION", fields: { domain: ["validation.duplicate"] } });

    const cleared = await updateOrganization(owner, orgA, { name: `${TAG} Alpha`, domain: null });
    expect(cleared.domain).toBeNull();
    expect(await organizationForHost(DOMAIN)).toBeNull();
    expect(await isServedHost(DOMAIN)).toBe(false);

    const moved = await updateOrganization(owner, orgB, { name: `${TAG} Beta`, domain: DOMAIN });
    expect(moved.domain).toBe(DOMAIN);
    // A rename alone leaves the address untouched.
    expect((await updateOrganization(owner, orgB, { name: `${TAG} Beta 2` })).domain).toBe(DOMAIN);
  });

  it("is the site owner's alone", async () => {
    const ceo: Actor = { ...owner, isSiteOwner: false };
    await expect(
      updateOrganization(ceo, orgA, { name: `${TAG} Alpha`, domain: null }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
