/**
 * The setup checklist on the home page (A-128), against the real database: a
 * fresh centre has almost everything to do, the demo centre has most of it done,
 * and the card can be hidden and brought back.
 */
import { afterAll, describe, expect, it } from "vitest";

import { prisma } from "@/server/db/prisma";
import type { Actor } from "@/server/rbac/authorize";
import {
  getSetupChecklist,
  SETUP_STEPS,
  setSetupChecklistShown,
} from "@/server/services/dashboard/setup.service";
import { DEMO_ORG_ID } from "./support/tenant";

const TAG = `sc${String(Date.now() % 100_000).padStart(5, "0")}`;

const actor = (organizationId: string, permissions: string[]): Actor => ({
  userId: "",
  fullName: "CEO",
  roles: ["CEO"],
  permissions,
  organizationId,
  branchIds: [],
  activeBranchId: null,
});

let freshOrgId: string;

afterAll(async () => {
  if (!freshOrgId) return;
  await prisma.orgSettings.deleteMany({ where: { organizationId: freshOrgId } });
  await prisma.branch.deleteMany({ where: { organizationId: freshOrgId } });
  await prisma.organization.delete({ where: { id: freshOrgId } });
});

describe("setup checklist (A-128)", () => {
  it("lists what a fresh centre still has to add, with links", async () => {
    const org = await prisma.organization.create({
      data: { name: `${TAG} Centre`, branches: { create: { name: `${TAG} Main` } } },
    });
    freshOrgId = org.id;
    const list = await getSetupChecklist(actor(org.id, ["*"]));
    expect(list).not.toBeNull();
    expect(list!.total).toBe(SETUP_STEPS.length);
    expect(list!.steps.map((s) => s.key)).toEqual([...SETUP_STEPS]);
    expect(list!.shown).toBe(true);
    const byKey = Object.fromEntries(list!.steps.map((s) => [s.key, s]));
    expect(byKey.branches).toMatchObject({ done: true, count: 1, href: "/settings/general" });
    expect(byKey.courses).toMatchObject({ done: false, count: 0, href: "/settings/courses" });
    expect(byKey.staff).toMatchObject({ done: false, count: 0 });
    expect(byKey.telegram).toMatchObject({
      done: false,
      count: null,
      href: "/settings/integrations",
    });
    expect(byKey.onlinePayments).toMatchObject({ done: false, count: null });
    expect(list!.done).toBe(1);
  });

  it("ticks what the demo centre has and mirrors its integration rows", async () => {
    const list = await getSetupChecklist(actor(DEMO_ORG_ID, ["settings.org"]));
    expect(list).not.toBeNull();
    const byKey = Object.fromEntries(list!.steps.map((s) => [s.key, s]));
    for (const key of ["branches", "courses", "rooms", "staff", "groups", "students"] as const) {
      expect(byKey[key]!.done, key).toBe(true);
      expect(byKey[key]!.count).toBeGreaterThan(0);
    }
    const telegram = await prisma.integrationSetting.findUnique({
      where: { organizationId_provider: { organizationId: DEMO_ORG_ID, provider: "TELEGRAM" } },
    });
    const token = (telegram?.config as { botToken?: string } | null)?.botToken ?? "";
    expect(byKey.telegram!.done).toBe(Boolean(telegram?.isEnabled && token.length > 0));
    expect(list!.done).toBe(list!.steps.filter((s) => s.done).length);
  });

  it("can be hidden and brought back; others get nothing", async () => {
    const ceo = actor(DEMO_ORG_ID, ["*"]);
    const before = (await getSetupChecklist(ceo))!.shown;
    try {
      expect((await setSetupChecklistShown(ceo, false)).shown).toBe(false);
      expect((await getSetupChecklist(ceo))!.shown).toBe(false);
      expect((await setSetupChecklistShown(ceo, true)).shown).toBe(true);
    } finally {
      await setSetupChecklistShown(ceo, before);
    }
    await expect(getSetupChecklist(actor(DEMO_ORG_ID, ["dashboard.view"]))).resolves.toBeNull();
    await expect(
      setSetupChecklistShown(actor(DEMO_ORG_ID, ["dashboard.view"]), false),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});
