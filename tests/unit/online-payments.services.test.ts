/**
 * Online payments against the real database (A-106): a student starts a Payme
 * or Click payment from their link, the provider's callbacks confirm it, and a
 * regular Payment with the provider's method appears on the membership.
 * Rows carry a run-specific tag and are removed at the end.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { clickIntegrationSchema, paymeIntegrationSchema } from "@/lib/validation/integrations";
import { prisma } from "@/server/db/prisma";
import type { Actor } from "@/server/rbac/authorize";
import { createGroup } from "@/server/services/groups/groups.service";
import { addMember } from "@/server/services/groups/memberships.service";
import { updateIntegration } from "@/server/services/integrations/integrations.service";
import {
  clickSignature,
  createOnlinePayment,
  getOnlinePaymentStatus,
  getPortalPayOptions,
  handleClick,
  handlePayme,
} from "@/server/services/payments/online-payments.service";
import { createBranch } from "@/server/services/settings/branches.service";
import { createCourse } from "@/server/services/settings/courses.service";
import { membershipBalances } from "@/server/services/students/balances";
import { listStudentLinks } from "@/server/services/video/video.service";

const RUN = String(Date.now() % 100_000).padStart(5, "0");
const TAG = `op${RUN}`;
const phone = (n: number) => `+99892${RUN}${String(n).padStart(2, "0")}`;
const PAYME_KEY = `payme-key-${RUN}`;
const CLICK_SECRET = `click-secret-${RUN}`;
const CLICK_SERVICE = `99${RUN}`;
const auth = `Basic ${Buffer.from(`Paycom:${PAYME_KEY}`).toString("base64")}`;

const ceo: Actor = {
  userId: "",
  fullName: "CEO",
  roles: ["CEO"],
  permissions: ["*"],
  branchIds: [],
  activeBranchId: null,
};

let branchId: string;
let groupId: string;
let membershipId: string;
let token: string;
let previous: Array<{ provider: "PAYME" | "CLICK"; isEnabled: boolean; config: unknown } | null> =
  [];

beforeAll(async () => {
  const user = await prisma.user.create({
    data: { phone: phone(1), fullName: `${TAG} CEO`, passwordHash: "x" },
  });
  ceo.userId = user.id;
  branchId = (await createBranch(ceo, { name: `${TAG} A`, isActive: true })).id;
  ceo.activeBranchId = branchId;
  const courseId = (
    await createCourse(ceo, {
      branchId,
      name: `${TAG} German`,
      description: undefined,
      price: 500_000,
      durationMonths: 3,
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
  membershipId = (
    await addMember(ceo, groupId, {
      newStudent: { fullName: `${TAG} Student`, phone: phone(11) },
      joinedAt: "2026-09-01",
      status: "ACTIVE",
      customPrice: null,
      note: null,
    })
  ).id;
  token = (await listStudentLinks(ceo, groupId)).find(
    (l) => l.membershipId === membershipId,
  )!.token;

  // Remember the providers' settings so the run leaves them as they were.
  previous = await Promise.all(
    (["PAYME", "CLICK"] as const).map(async (provider) => {
      const org = await prisma.organization.findFirstOrThrow({ orderBy: { createdAt: "asc" } });
      const row = await prisma.integrationSetting.findUnique({
        where: { organizationId_provider: { organizationId: org.id, provider } },
      });
      return row ? { provider, isEnabled: row.isEnabled, config: row.config } : null;
    }),
  );
  await updateIntegration(
    ceo,
    "PAYME",
    paymeIntegrationSchema.parse({ isEnabled: true, merchantId: "m-test", key: PAYME_KEY }),
  );
  await updateIntegration(
    ceo,
    "CLICK",
    clickIntegrationSchema.parse({
      isEnabled: true,
      serviceId: CLICK_SERVICE,
      merchantId: "77",
      merchantUserId: "5",
      secretKey: CLICK_SECRET,
    }),
  );
});

afterAll(async () => {
  const org = await prisma.organization.findFirstOrThrow({ orderBy: { createdAt: "asc" } });
  for (const provider of ["PAYME", "CLICK"] as const) {
    const saved = previous.find((p) => p?.provider === provider);
    if (saved) {
      await prisma.integrationSetting.update({
        where: { organizationId_provider: { organizationId: org.id, provider } },
        data: { isEnabled: saved.isEnabled, config: saved.config as never },
      });
    } else {
      await prisma.integrationSetting.deleteMany({ where: { organizationId: org.id, provider } });
    }
  }
  if (membershipId) {
    await prisma.payment.deleteMany({ where: { membershipId } });
    await prisma.onlinePayment.deleteMany({ where: { membershipId } });
  }
  if (groupId) await prisma.group.deleteMany({ where: { id: groupId } });
  await prisma.student.deleteMany({ where: { fullName: { startsWith: TAG } } });
  await prisma.course.deleteMany({ where: { name: { startsWith: TAG } } });
  await prisma.user.deleteMany({ where: { fullName: { startsWith: TAG } } });
  if (branchId) await prisma.branch.deleteMany({ where: { id: branchId } });
});

describe("online payments", () => {
  it("offers both providers with the balance's suggestion", async () => {
    const options = (await getPortalPayOptions(token))!;
    expect(options.providers).toEqual(["PAYME", "CLICK"]);
    // The debt so far (one 500 000 charge per month since September), never zero.
    expect(options.suggestedAmount).toBeGreaterThanOrEqual(500_000);
    expect(options.suggestedAmount % 500_000).toBe(0);
    expect(options.months[0]).toBe("2026-09-01");
    expect(options.months.length).toBeGreaterThanOrEqual(3);
    expect(await getPortalPayOptions("nope")).toBeNull();
  });

  it("takes a Payme payment through the Merchant API", async () => {
    const { id, url } = await createOnlinePayment(
      token,
      { provider: "PAYME", amount: 500_000, effectiveMonth: "2026-09-01" },
      "https://kampus.test",
    );
    const encoded = url.slice("https://checkout.paycom.uz/".length);
    expect(Buffer.from(encoded, "base64").toString("utf8")).toBe(
      `m=m-test;ac.order_id=${id};a=50000000;c=https://kampus.test/class/${token}?paid=${id}`,
    );
    await expect(
      createOnlinePayment(
        token,
        { provider: "PAYME", amount: 1000, effectiveMonth: "2027-05-01" },
        "https://kampus.test",
      ),
    ).rejects.toMatchObject({ code: "VALIDATION" });

    const call = (method: string, params: Record<string, unknown>, a = auth) =>
      handlePayme(prisma, a, { id: 7, method, params });
    expect(await call("CheckPerformTransaction", {}, "Basic nope")).toMatchObject({
      error: { code: -32504 },
    });
    expect(
      await call("CheckPerformTransaction", { amount: 1, account: { order_id: id } }),
    ).toMatchObject({ error: { code: -31001 } });
    expect(
      await call("CheckPerformTransaction", { amount: 50_000_000, account: { order_id: "x" } }),
    ).toMatchObject({ error: { code: -31050 } });
    expect(
      await call("CheckPerformTransaction", { amount: 50_000_000, account: { order_id: id } }),
    ).toEqual({ id: 7, result: { allow: true } });

    const trx = `trx-${RUN}`;
    const created = await call("CreateTransaction", {
      id: trx,
      time: 1_760_000_000_000,
      amount: 50_000_000,
      account: { order_id: id },
    });
    expect(created).toMatchObject({
      result: { transaction: id, state: 1, create_time: 1_760_000_000_000 },
    });
    // Idempotent, and a second transaction for the same order is refused.
    expect(
      await call("CreateTransaction", {
        id: trx,
        time: 1,
        amount: 50_000_000,
        account: { order_id: id },
      }),
    ).toMatchObject({ result: { state: 1 } });
    expect(
      await call("CreateTransaction", {
        id: "other",
        time: 1,
        amount: 50_000_000,
        account: { order_id: id },
      }),
    ).toMatchObject({ error: { code: -31050 } });

    const performed = await call("PerformTransaction", { id: trx });
    expect(performed).toMatchObject({ result: { transaction: id, state: 2 } });
    expect(await call("PerformTransaction", { id: trx })).toMatchObject({
      result: { state: 2 },
    });
    expect(await call("CancelTransaction", { id: trx, reason: 5 })).toMatchObject({
      error: { code: -31007 },
    });
    expect(await call("CheckTransaction", { id: trx })).toMatchObject({
      result: { state: 2, transaction: id },
    });
    const statement = await call("GetStatement", { from: 0, to: Date.now() });
    expect(
      (statement.result as { transactions: Array<{ id: string }> }).transactions.map((t) => t.id),
    ).toContain(trx);

    // The money landed as a regular payment with the "Payme" method.
    const status = (await getOnlinePaymentStatus(token, id))!;
    expect(status).toMatchObject({ status: "PAID", amount: 500_000 });
    const payment = await prisma.payment.findFirstOrThrow({
      where: { membershipId },
      include: { paymentMethod: true },
    });
    expect(payment.paymentMethod?.name).toBe("Payme");
    expect(payment.comment).toBe(`Payme ${trx}`);
    expect((await membershipBalances(prisma, [membershipId])).get(membershipId)!.paid).toBe(
      500_000,
    );
    expect(await call("Nope", {})).toMatchObject({ error: { code: -32601 } });
  });

  it("cancels an unperformed Payme transaction", async () => {
    const { id } = await createOnlinePayment(
      token,
      { provider: "PAYME", amount: 250_000, effectiveMonth: "2026-10-01" },
      "https://kampus.test",
    );
    const trx = `trx-cancel-${RUN}`;
    await handlePayme(prisma, auth, {
      id: 1,
      method: "CreateTransaction",
      params: { id: trx, time: 2, amount: 25_000_000, account: { order_id: id } },
    });
    expect(
      await handlePayme(prisma, auth, {
        id: 2,
        method: "CancelTransaction",
        params: { id: trx, reason: 3 },
      }),
    ).toMatchObject({ result: { state: -1, reason: 3 } });
    expect((await getOnlinePaymentStatus(token, id))!.status).toBe("CANCELLED");
    expect(
      await handlePayme(prisma, auth, {
        id: 3,
        method: "PerformTransaction",
        params: { id: trx },
      }),
    ).toMatchObject({ error: { code: -31008 } });
  });

  it("takes a Click payment through prepare and complete", async () => {
    const { id, url } = await createOnlinePayment(
      token,
      { provider: "CLICK", amount: 300_000, effectiveMonth: "2026-10-01" },
      "https://kampus.test",
    );
    const q = new URL(url).searchParams;
    expect(url.startsWith("https://my.click.uz/services/pay?")).toBe(true);
    expect(q.get("service_id")).toBe(CLICK_SERVICE);
    expect(q.get("amount")).toBe("300000.00");
    expect(q.get("transaction_param")).toBe(id);

    const base = {
      click_trans_id: `ct-${RUN}`,
      service_id: CLICK_SERVICE,
      click_paydoc_id: "1",
      merchant_trans_id: id,
      amount: "300000.00",
      sign_time: "2026-10-06 12:00:00",
      error: "0",
      error_note: "Success",
    };
    const prepare = { ...base, action: "0" };
    expect(await handleClick(prisma, { ...prepare, sign_string: "bad" })).toMatchObject({
      error: -1,
    });
    expect(
      await handleClick(prisma, {
        ...prepare,
        amount: "1.00",
        sign_string: clickSignature(CLICK_SECRET, { ...prepare, amount: "1.00" }, false),
      }),
    ).toMatchObject({ error: -2 });
    const prepared = await handleClick(prisma, {
      ...prepare,
      sign_string: clickSignature(CLICK_SECRET, prepare, false),
    });
    expect(prepared).toMatchObject({ error: 0, merchant_prepare_id: id });

    const complete = { ...base, action: "1", merchant_prepare_id: id };
    const completed = await handleClick(prisma, {
      ...complete,
      sign_string: clickSignature(CLICK_SECRET, complete, true),
    });
    expect(completed).toMatchObject({ error: 0, merchant_confirm_id: id });
    expect((await getOnlinePaymentStatus(token, id))!.status).toBe("PAID");
    // Click retries the same complete: already paid, no second payment.
    expect(
      await handleClick(prisma, {
        ...complete,
        sign_string: clickSignature(CLICK_SECRET, complete, true),
      }),
    ).toMatchObject({ error: -4 });
    const payments = await prisma.payment.findMany({
      where: { membershipId },
      include: { paymentMethod: true },
    });
    expect(payments.map((p) => p.paymentMethod?.name).sort()).toEqual(["Click", "Payme"]);
  });

  it("marks a Click payment cancelled when complete reports an error", async () => {
    const { id } = await createOnlinePayment(
      token,
      { provider: "CLICK", amount: 100_000, effectiveMonth: "2026-11-01" },
      "https://kampus.test",
    );
    const base = {
      click_trans_id: `ct-fail-${RUN}`,
      service_id: CLICK_SERVICE,
      click_paydoc_id: "2",
      merchant_trans_id: id,
      amount: "100000.00",
      sign_time: "2026-10-06 12:05:00",
    };
    const prepare = { ...base, action: "0", error: "0", error_note: "Success" };
    await handleClick(prisma, {
      ...prepare,
      sign_string: clickSignature(CLICK_SECRET, prepare, false),
    });
    const complete = {
      ...base,
      action: "1",
      merchant_prepare_id: id,
      error: "-5017",
      error_note: "Cancelled by user",
    };
    expect(
      await handleClick(prisma, {
        ...complete,
        sign_string: clickSignature(CLICK_SECRET, complete, true),
      }),
    ).toMatchObject({ error: -9 });
    expect((await getOnlinePaymentStatus(token, id))!.status).toBe("CANCELLED");
  });
});
