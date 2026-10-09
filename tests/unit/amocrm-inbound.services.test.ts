/**
 * Leads from amoCRM (A-115): the webhook is parsed and queued, the job files a
 * lead in the right column under "Instagram", repeats and known deals are
 * skipped, and a deal Kampus pushed itself is remembered. Runs in a centre of
 * its own so the demo centre's amoCRM settings stay untouched.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { prisma } from "@/server/db/prisma";
import { fakeAmoCrmRemoteLeads } from "@/server/integrations/amocrm/client";
import { registerJobHandlers } from "@/server/jobs/handlers";
import { enqueue, runDueJobs } from "@/server/jobs/queue";
import type { Actor } from "@/server/rbac/authorize";
import {
  assertWebhookSecret,
  updateIntegration,
} from "@/server/services/integrations/integrations.service";
import {
  importAmoCrmLead,
  normalizePhone,
  parseAmoCrmWebhook,
  receiveAmoCrmWebhook,
} from "@/server/services/leads/amocrm-inbound.service";
import { listColumnOptions } from "@/server/services/leads/boards.service";
import { createOrganization } from "@/server/services/settings/organizations.service";

import { DEMO_ORG_ID, demoBranchIds } from "./support/tenant";

const RUN = String(Date.now() % 100_000).padStart(5, "0");
const TAG = `am${RUN}`;
const phone = (n: number) => `+99895${RUN}${String(n).padStart(2, "0")}`;
const HOOK_SECRET = `hook-${TAG}`;
const deal = (n: number) => `${RUN}${n}`;

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
let branchId = "";
let ceo: Actor;
let firstColumnId = "";
let secondColumnId = "";

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
    ceoFullName: `${TAG} Ceo`,
    ceoPhone: phone(2),
    ceoPassword: "FirstPass!2026",
  });
  orgId = org.id;
  branchId = org.branches[0]?.id ?? "";
  const ceoUser = await prisma.user.findUniqueOrThrow({ where: { phone: phone(2) } });
  ceo = {
    userId: ceoUser.id,
    fullName: ceoUser.fullName,
    organizationId: orgId,
    roles: ["CEO"],
    permissions: ["*"],
    branchIds: [branchId],
    activeBranchId: branchId,
    isSiteOwner: false,
  };
  const board = await prisma.leadBoard.create({
    data: {
      branchId,
      name: `${TAG} Board`,
      columns: {
        create: [
          { name: "New", sortOrder: 0 },
          { name: "Talked", sortOrder: 1 },
        ],
      },
    },
    include: { columns: { orderBy: { sortOrder: "asc" } } },
  });
  firstColumnId = board.columns[0]?.id ?? "";
  secondColumnId = board.columns[1]?.id ?? "";
  await updateIntegration(ceo, "AMOCRM", {
    isEnabled: true,
    secretKey: "",
    integrationId: "",
    authorizationCode: "",
    subDomain: "kingston",
    webhookSecret: HOOK_SECRET,
    leadColumnId: "",
    leadSourceName: "Instagram",
  });
});

afterAll(async () => {
  await prisma.job.deleteMany({ where: { uniqueKey: { startsWith: `amocrm:in:${orgId}:` } } });
  await prisma.leadPhone.deleteMany({ where: { lead: { branchId } } });
  await prisma.lead.deleteMany({ where: { branchId } });
  await prisma.leadBoard.deleteMany({ where: { branchId } });
  await prisma.leadSource.deleteMany({ where: { organizationId: orgId } });
  await prisma.user.deleteMany({ where: { organizationId: orgId } });
  await prisma.branch.deleteMany({ where: { organizationId: orgId } });
  await prisma.organization.delete({ where: { id: orgId } });
  await prisma.user.deleteMany({ where: { id: owner.userId } });
  await prisma.$disconnect();
});

describe("leads from amoCRM (A-115)", () => {
  it("reads amoCRM's form fields, for plain deals and for items from Unsorted", () => {
    const params = new URLSearchParams();
    params.set("leads[add][0][id]", " 101 ");
    params.set("leads[add][0][name]", "Instagram: ali");
    params.set("leads[add][0][status_id]", "142");
    params.set("leads[add][1][id]", "102");
    params.set("unsorted[add][0][source_name]", "Instagram");
    params.set("unsorted[add][0][data][leads][0][id]", "103");
    params.set("unsorted[add][0][data][leads][0][name]", "Deal from a chat");
    params.set("unsorted[add][0][data][contacts][0][name]", "Ali Valiyev");
    params.set("unsorted[add][0][data][contacts][0][custom_fields][0][code]", "PHONE");
    params.set(
      "unsorted[add][0][data][contacts][0][custom_fields][0][values][0][value]",
      "+998 (90) 123-45-67",
    );
    params.set("unsorted[add][1][source_name]", "Instagram");
    params.set("account[subdomain]", "kingston");
    const hook = parseAmoCrmWebhook(params);
    expect(hook.subdomain).toBe("kingston");
    expect(hook.added).toEqual([
      { id: "101", name: "Instagram: ali", contactName: null, phones: [], sourceName: null },
      { id: "102", name: null, contactName: null, phones: [], sourceName: null },
      {
        id: "103",
        name: "Deal from a chat",
        contactName: "Ali Valiyev",
        phones: ["+998901234567"],
        sourceName: "Instagram",
      },
    ]);
    expect(normalizePhone("90 123 45 67")).toBe("+998901234567");
    expect(normalizePhone("998901234567")).toBe("+998901234567");
    expect(normalizePhone("+7 (999) 123-45-67")).toBe("+79991234567");
    expect(normalizePhone("ali@example.com")).toBeNull();
  });

  it("names the centre by the webhook secret and queues one import per deal, once", async () => {
    expect(await assertWebhookSecret(prisma, "AMOCRM", HOOK_SECRET)).toBe(orgId);
    await expect(
      assertWebhookSecret(prisma, "AMOCRM", `${HOOK_SECRET}-wrong`),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    const added = [
      { id: deal(1), name: `${TAG} One`, contactName: null, phones: [], sourceName: "Instagram" },
    ];
    await expect(
      receiveAmoCrmWebhook(prisma, orgId, { subdomain: "someoneelse", added }),
    ).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(await receiveAmoCrmWebhook(prisma, orgId, { subdomain: "kingston", added })).toEqual({
      queued: 1,
      ignored: 0,
    });
    expect(await receiveAmoCrmWebhook(prisma, orgId, { subdomain: null, added })).toEqual({
      queued: 0,
      ignored: 1,
    });
    const job = await prisma.job.findUnique({
      where: { uniqueKey: `amocrm:in:${orgId}:${deal(1)}` },
    });
    expect(job?.type).toBe("amocrm.importLead");
  });

  it("files the deal as a lead in the first column under Instagram, with the contact's name and phone", async () => {
    fakeAmoCrmRemoteLeads.set(deal(2), {
      id: deal(2),
      name: "Instagram: ali_v",
      contactName: `${TAG} Ali`,
      phones: ["998 93 111 22 33"],
      tags: ["instagram"],
    });
    const result = await importAmoCrmLead(prisma, {
      organizationId: orgId,
      lead: { id: deal(2), name: null, contactName: null, phones: [], sourceName: "Instagram" },
    });
    expect(result.skipped).toBeNull();
    const lead = await prisma.lead.findUniqueOrThrow({
      where: { id: result.leadId! },
      include: { phones: true, source: true },
    });
    expect(lead.fullName).toBe(`${TAG} Ali`);
    expect(lead.columnId).toBe(firstColumnId);
    expect(lead.branchId).toBe(branchId);
    expect(lead.source?.name).toBe("Instagram");
    expect(lead.phones.map((p) => p.phone)).toEqual(["+998931112233"]);
    expect(lead.amoCrmLeadId).toBe(deal(2));
    expect(lead.comment).toContain(`https://kingston.amocrm.ru/leads/detail/${deal(2)}`);
    expect(lead.comment).toContain("instagram");
    expect(lead.createdById).toBeNull();

    // The same deal again, and another deal of the same person: skipped.
    expect(
      await importAmoCrmLead(prisma, {
        organizationId: orgId,
        lead: { id: deal(2), name: null, contactName: null, phones: [], sourceName: null },
      }),
    ).toEqual({ leadId: null, skipped: "exists" });
    expect(
      await importAmoCrmLead(prisma, {
        organizationId: orgId,
        lead: {
          id: deal(3),
          name: "Again",
          contactName: null,
          phones: ["+998931112233"],
          sourceName: null,
        },
      }),
    ).toEqual({ leadId: null, skipped: "phone" });
  });

  it("uses the webhook's own fields when amoCRM has nothing more, and the configured column", async () => {
    await updateIntegration(ceo, "AMOCRM", {
      isEnabled: true,
      secretKey: "",
      integrationId: "",
      authorizationCode: "",
      subDomain: "kingston",
      webhookSecret: HOOK_SECRET,
      leadColumnId: secondColumnId,
      leadSourceName: "Instagram",
    });
    const result = await importAmoCrmLead(prisma, {
      organizationId: orgId,
      lead: { id: deal(4), name: `${TAG} Chat`, contactName: null, phones: [], sourceName: null },
    });
    const lead = await prisma.lead.findUniqueOrThrow({ where: { id: result.leadId! } });
    expect(lead.fullName).toBe(`${TAG} Chat`);
    expect(lead.columnId).toBe(secondColumnId);
    // A nameless deal still gets a name.
    const bare = await importAmoCrmLead(prisma, {
      organizationId: orgId,
      lead: { id: deal(5), name: null, contactName: null, phones: [], sourceName: null },
    });
    expect((await prisma.lead.findUniqueOrThrow({ where: { id: bare.leadId! } })).fullName).toBe(
      `amoCRM #${deal(5)}`,
    );
    expect((await listColumnOptions(ceo)).map((c) => c.label)).toEqual([
      `${TAG} Main · ${TAG} Board · New`,
      `${TAG} Main · ${TAG} Board · Talked`,
    ]);
  });

  it("runs through the queue, and a deal Kampus pushed is not imported back", async () => {
    registerJobHandlers();
    const pushed = await prisma.lead.create({
      data: {
        branchId,
        boardId: (await prisma.leadColumn.findUniqueOrThrow({ where: { id: firstColumnId } }))
          .boardId,
        columnId: firstColumnId,
        fullName: `${TAG} Pushed`,
      },
    });
    await enqueue(prisma, {
      type: "amocrm.pushLead",
      payload: {
        organizationId: orgId,
        leadId: pushed.id,
        name: pushed.fullName,
        phone: null,
        source: null,
      },
      uniqueKey: `amocrm:lead:${pushed.id}`,
    });
    // Another test file's pass may claim the job first: wait for whoever runs it.
    await expect
      .poll(
        async () => {
          await runDueJobs(50, prisma);
          return (await prisma.lead.findUniqueOrThrow({ where: { id: pushed.id } })).amoCrmLeadId;
        },
        { timeout: 15_000, interval: 250 },
      )
      .toMatch(/^fake-/);
    const after = await prisma.lead.findUniqueOrThrow({ where: { id: pushed.id } });
    expect(
      await importAmoCrmLead(prisma, {
        organizationId: orgId,
        lead: {
          id: after.amoCrmLeadId!,
          name: null,
          contactName: null,
          phones: [],
          sourceName: null,
        },
      }),
    ).toEqual({ leadId: null, skipped: "exists" });

    // The queued webhook import from the earlier test ran in that pass too.
    const fromQueue = await prisma.lead.findFirst({ where: { amoCrmLeadId: deal(1), branchId } });
    expect(fromQueue?.fullName).toBe(`${TAG} One`);

    // A switched-off integration imports nothing.
    await updateIntegration(ceo, "AMOCRM", {
      isEnabled: false,
      secretKey: "",
      integrationId: "",
      authorizationCode: "",
      subDomain: "kingston",
      webhookSecret: HOOK_SECRET,
      leadColumnId: "",
      leadSourceName: "Instagram",
    });
    expect(
      await importAmoCrmLead(prisma, {
        organizationId: orgId,
        lead: { id: deal(6), name: "x", contactName: null, phones: [], sourceName: null },
      }),
    ).toEqual({ leadId: null, skipped: "disabled" });
    await expect(assertWebhookSecret(prisma, "AMOCRM", HOOK_SECRET)).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
