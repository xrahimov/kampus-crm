import { createHash } from "node:crypto";

import type { OnlinePaymentProvider, Prisma } from "@/generated/prisma/client";
import type { OnlinePaymentInput } from "@/lib/validation/students";
import { recordAudit } from "@/server/audit/audit";
import { prisma, type DbClient } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";
import { notifyUsers } from "@/server/services/dashboard/notifications.service";
import { notifyStaff } from "@/server/services/integrations/bot-recipients.service";
import {
  findOrganizationByConfig,
  loadIntegrationConfig,
} from "@/server/services/integrations/integrations.service";
import {
  dateToIso,
  decimalToNumber,
  organizationOfBranch,
  isoToDate,
} from "@/server/services/settings/shared";
import { queueAutoSms } from "@/server/services/sms/auto-sms.service";
import { membershipBalances } from "@/server/services/students/balances";
import { notifyStudents } from "@/server/services/telegram/student-telegram.service";
import { appOriginFor } from "@/server/services/settings/domains.service";
import { classLink, membershipByToken } from "@/server/services/video/video.service";

/*
 * Online payments (A-106): a student pays from their personal link through
 * Payme or Click. Kampus creates an order (OnlinePayment, PENDING), sends the
 * browser to the provider's checkout with the order id, and the provider calls
 * back: Payme through its JSON-RPC Merchant API, Click through SHOP API's
 * prepare/complete. A confirmed order becomes a regular Payment, received by
 * nobody, with a payment method named after the provider.
 */

export interface PortalPayOptionsDto {
  /** Providers the centre has switched on, in the order to show them. */
  providers: OnlinePaymentProvider[];
  suggestedAmount: number;
  suggestedMonth: string;
  /** Course months the payment may be for. */
  months: string[];
}

export interface OnlinePaymentStatusDto {
  id: string;
  provider: OnlinePaymentProvider;
  status: "PENDING" | "PAID" | "CANCELLED";
  amount: number;
  effectiveMonth: string;
}

type PaymeConfig = { isEnabled: boolean; merchantId: string; key: string; checkoutUrl: string };
type ClickConfig = {
  isEnabled: boolean;
  serviceId: string;
  merchantId: string;
  merchantUserId: string;
  secretKey: string;
};

async function paymeConfig(db: DbClient, organizationId: string): Promise<PaymeConfig | null> {
  const c = (await loadIntegrationConfig(db, "PAYME", organizationId)) as PaymeConfig | null;
  return c?.isEnabled && c.merchantId && c.key ? c : null;
}

async function clickConfig(db: DbClient, organizationId: string): Promise<ClickConfig | null> {
  const c = (await loadIntegrationConfig(db, "CLICK", organizationId)) as ClickConfig | null;
  return c?.isEnabled && c.serviceId && c.merchantId && c.secretKey ? c : null;
}

/**
 * A provider's call carries no session, so its merchant credentials say which
 * centre it is for (A-108): Payme by the key behind `Paycom:<key>`, Click by the
 * service id. Returns the centre and its configuration, or null.
 */
async function paymeConfigByKey(
  db: DbClient,
  key: string,
): Promise<{ organizationId: string; config: PaymeConfig } | null> {
  if (!key) return null;
  const organizationId = await findOrganizationByConfig(
    db,
    "PAYME",
    (c) => Boolean(c.merchantId) && c.key === key,
  );
  const config = organizationId ? await paymeConfig(db, organizationId) : null;
  return organizationId && config ? { organizationId, config } : null;
}

async function clickConfigByServiceId(
  db: DbClient,
  serviceId: string,
): Promise<{ organizationId: string; config: ClickConfig } | null> {
  if (!serviceId) return null;
  const organizationId = await findOrganizationByConfig(
    db,
    "CLICK",
    (c) => Boolean(c.merchantId) && Boolean(c.secretKey) && c.serviceId === serviceId,
  );
  const config = organizationId ? await clickConfig(db, organizationId) : null;
  return organizationId && config ? { organizationId, config } : null;
}

function courseMonths(start: Date, end: Date): string[] {
  const months: string[] = [];
  let x = `${dateToIso(start).slice(0, 7)}-01`;
  const last = `${dateToIso(end).slice(0, 7)}-01`;
  while (x <= last) {
    months.push(x);
    const [y, mo] = x.split("-").map(Number) as [number, number];
    x = mo === 12 ? `${y + 1}-01-01` : `${y}-${String(mo + 1).padStart(2, "0")}-01`;
  }
  return months;
}

/** What the student's money tab needs to offer a payment. */
export async function getPortalPayOptions(
  token: string,
  db: DbClient = prisma,
): Promise<PortalPayOptionsDto | null> {
  const membership = await membershipByToken(db, token);
  if (!membership) return null;
  const organizationId = await organizationOfBranch(db, membership.group.branchId);
  const [payme, click, balance, group] = await Promise.all([
    paymeConfig(db, organizationId),
    clickConfig(db, organizationId),
    membershipBalances(db, [membership.id]).then((m) => m.get(membership.id)),
    db.group.findUniqueOrThrow({
      where: { id: membership.groupId },
      select: { startDate: true, endDate: true },
    }),
  ]);
  const providers: OnlinePaymentProvider[] = [];
  if (payme) providers.push("PAYME");
  if (click) providers.push("CLICK");
  return {
    providers,
    suggestedAmount: Math.max(0, Math.round(balance?.suggestedAmount ?? 0)),
    suggestedMonth: balance?.suggestedMonth ?? `${dateToIso(new Date()).slice(0, 7)}-01`,
    months: courseMonths(group.startDate, group.endDate),
  };
}

/** Payme's checkout wants `m=…;ac.order_id=…;a=<tiyin>;c=<return url>` base64-encoded. */
export function paymeCheckoutUrl(
  config: Pick<PaymeConfig, "merchantId" | "checkoutUrl">,
  orderId: string,
  amount: number,
  returnUrl: string,
): string {
  const params = [
    `m=${config.merchantId}`,
    `ac.order_id=${orderId}`,
    `a=${Math.round(amount * 100)}`,
    `c=${returnUrl}`,
  ].join(";");
  return `${config.checkoutUrl.replace(/\/$/, "")}/${Buffer.from(params, "utf8").toString("base64")}`;
}

export function clickCheckoutUrl(
  config: Pick<ClickConfig, "serviceId" | "merchantId" | "merchantUserId">,
  orderId: string,
  amount: number,
  returnUrl: string,
): string {
  const q = new URLSearchParams({
    service_id: config.serviceId,
    merchant_id: config.merchantId,
    amount: amount.toFixed(2),
    transaction_param: orderId,
    return_url: returnUrl,
  });
  if (config.merchantUserId) q.set("merchant_user_id", config.merchantUserId);
  return `https://my.click.uz/services/pay?${q.toString()}`;
}

/** The student starts a payment: an order row and the provider's checkout URL. */
export async function createOnlinePayment(
  token: string,
  input: OnlinePaymentInput,
  origin: string,
  db: DbClient = prisma,
): Promise<{ id: string; url: string }> {
  const membership = await membershipByToken(db, token);
  if (!membership) throw AppError.notFound();
  const organizationId = await organizationOfBranch(db, membership.group.branchId);
  const config =
    input.provider === "PAYME"
      ? await paymeConfig(db, organizationId)
      : await clickConfig(db, organizationId);
  if (!config) throw AppError.conflict("errors.onlinePaymentsOff");
  const group = await db.group.findUniqueOrThrow({
    where: { id: membership.groupId },
    select: { branchId: true, startDate: true, endDate: true },
  });
  if (!courseMonths(group.startDate, group.endDate).includes(input.effectiveMonth)) {
    throw AppError.validation({ effectiveMonth: ["validation.date"] });
  }
  const order = await db.onlinePayment.create({
    data: {
      provider: input.provider,
      studentId: membership.student.id,
      membershipId: membership.id,
      branchId: group.branchId,
      amount: input.amount,
      effectiveMonth: isoToDate(input.effectiveMonth),
    },
  });
  const returnUrl = `${origin}/class/${encodeURIComponent(token)}?paid=${order.id}`;
  const url =
    input.provider === "PAYME"
      ? paymeCheckoutUrl(config as PaymeConfig, order.id, input.amount, returnUrl)
      : clickCheckoutUrl(config as ClickConfig, order.id, input.amount, returnUrl);
  return { id: order.id, url };
}

/** Providers a centre has switched on, Payme first. */
export async function enabledPaymentProviders(
  db: DbClient,
  organizationId: string,
): Promise<OnlinePaymentProvider[]> {
  const [payme, click] = await Promise.all([
    paymeConfig(db, organizationId),
    clickConfig(db, organizationId),
  ]);
  const providers: OnlinePaymentProvider[] = [];
  if (payme) providers.push("PAYME");
  if (click) providers.push("CLICK");
  return providers;
}

/**
 * The links a linked Telegram chat gets on "pay" (A-119): one order per enabled
 * provider for the amount due on the membership, with the student's page as
 * the return address. Nothing when the centre takes no online payments.
 */
export async function botPaymentLinks(
  db: DbClient,
  organizationId: string,
  membership: { id: string; studentId: string; branchId: string; videoToken: string | null },
  amount: number,
  effectiveMonth: string,
): Promise<Array<{ provider: OnlinePaymentProvider; url: string }>> {
  const [payme, click, origin] = await Promise.all([
    paymeConfig(db, organizationId),
    clickConfig(db, organizationId),
    appOriginFor(organizationId, db),
  ]);
  const page = membership.videoToken ? classLink(origin, membership.videoToken) : origin;
  const links: Array<{ provider: OnlinePaymentProvider; url: string }> = [];
  for (const provider of ["PAYME", "CLICK"] as const) {
    const config = provider === "PAYME" ? payme : click;
    if (!config) continue;
    const order = await db.onlinePayment.create({
      data: {
        provider,
        studentId: membership.studentId,
        membershipId: membership.id,
        branchId: membership.branchId,
        amount,
        effectiveMonth: isoToDate(effectiveMonth),
      },
    });
    const returnUrl = `${page}?paid=${order.id}`;
    links.push({
      provider,
      url:
        provider === "PAYME"
          ? paymeCheckoutUrl(config as PaymeConfig, order.id, amount, returnUrl)
          : clickCheckoutUrl(config as ClickConfig, order.id, amount, returnUrl),
    });
  }
  return links;
}

/** The portal polls this after the provider sends the student back. */
export async function getOnlinePaymentStatus(
  token: string,
  id: string,
  db: DbClient = prisma,
): Promise<OnlinePaymentStatusDto | null> {
  const membership = await membershipByToken(db, token);
  if (!membership) return null;
  const order = await db.onlinePayment.findFirst({ where: { id, membershipId: membership.id } });
  if (!order) return null;
  return {
    id: order.id,
    provider: order.provider,
    status: order.status,
    amount: decimalToNumber(order.amount),
    effectiveMonth: dateToIso(order.effectiveMonth),
  };
}

/* ----- settling ----------------------------------------------------------------------------- */

const METHOD_NAME: Record<OnlinePaymentProvider, string> = { PAYME: "Payme", CLICK: "Click" };

/** Writes the Payment for a confirmed order; the row stays PENDING if anything fails. */
async function settle(tx: DbClient, orderId: string, performedAt: Date): Promise<void> {
  const order = await tx.onlinePayment.findUniqueOrThrow({
    where: { id: orderId },
    include: {
      student: { select: { fullName: true } },
      membership: { select: { group: { select: { name: true } } } },
    },
  });
  if (order.paymentId) return;
  const organizationId = await organizationOfBranch(tx, order.branchId);
  const name = METHOD_NAME[order.provider];
  const method =
    (await tx.paymentMethod.findUnique({
      where: { organizationId_name: { organizationId, name } },
    })) ?? (await tx.paymentMethod.create({ data: { organizationId, name, sortOrder: 90 } }));
  if (!method.isActive) {
    await tx.paymentMethod.update({ where: { id: method.id }, data: { isActive: true } });
  }
  const payment = await tx.payment.create({
    data: {
      studentId: order.studentId,
      membershipId: order.membershipId,
      branchId: order.branchId,
      paymentMethodId: method.id,
      amount: order.amount,
      bonus: 0,
      effectiveMonth: order.effectiveMonth,
      paidAt: isoToDate(dateToIso(performedAt)),
      comment: `${name} ${order.externalId ?? ""}`.trim(),
      receivedById: null,
    },
  });
  await tx.onlinePayment.update({
    where: { id: order.id },
    data: { status: "PAID", paymentId: payment.id, performedAt },
  });
  const amount = decimalToNumber(order.amount);
  const groupName = order.membership.group.name;
  await recordAudit(tx, null, {
    action: "payment.create",
    entity: "Payment",
    entityId: payment.id,
    after: {
      amount,
      bonus: 0,
      effectiveMonth: dateToIso(order.effectiveMonth),
      paidAt: dateToIso(payment.paidAt),
      groupId: null,
      method: name,
      online: order.id,
    },
    branchId: order.branchId,
  });
  await queueAutoSms(tx, {
    event: "PAYMENT_MADE",
    studentId: order.studentId,
    refKey: `payment:${payment.id}`,
    vars: { groupName, amount: String(amount), date: dateToIso(payment.paidAt) },
  });
  await notifyStudents(tx, {
    studentIds: [order.studentId],
    kind: "paymentReceived",
    refKey: `payment-received:${payment.id}`,
    values: { group: groupName, amount: amount.toLocaleString("ru-RU") },
  });
  await notifyStaff(tx, {
    organizationId,
    branchId: order.branchId,
    text: `To'lov (${name}): ${order.student.fullName} — ${amount} (${groupName})`,
  });
  await notifyUsers(tx, {
    kind: "PAYMENT",
    params: { name: order.student.fullName, amount, group: groupName, by: name },
    href: `/students/${order.studentId}`,
    branchId: order.branchId,
    permission: "payments.create",
  });
}

/* ----- Payme Merchant API (JSON-RPC) -------------------------------------------------------- */

interface PaymeRequest {
  id?: number | string;
  method?: string;
  params?: Record<string, unknown>;
}

const PAYME_ERRORS = {
  auth: -32504,
  parse: -32700,
  method: -32601,
  amount: -31001,
  transaction: -31003,
  cannotPerform: -31008,
  cannotCancel: -31007,
  order: -31050,
} as const;

function paymeError(id: PaymeRequest["id"], code: number, message: string, data?: string) {
  return {
    id: id ?? null,
    error: { code, message: { uz: message, ru: message, en: message }, data },
  };
}

const paymeState = (state: number | null | undefined) => state ?? 0;

/**
 * One Payme Merchant API call. Payme authenticates with `Paycom:<key>` and
 * expects JSON-RPC 2.0 answers; amounts are in tiyin (1/100 sum).
 */
export async function handlePayme(
  db: DbClient,
  authorization: string | null,
  body: unknown,
): Promise<Record<string, unknown>> {
  const request = (body ?? {}) as PaymeRequest;
  const presented = authorization?.startsWith("Basic ")
    ? Buffer.from(authorization.slice(6), "base64").toString("utf8")
    : "";
  const matched = presented.startsWith("Paycom:")
    ? await paymeConfigByKey(db, presented.slice("Paycom:".length))
    : null;
  if (!matched) {
    return paymeError(
      request.id,
      PAYME_ERRORS.auth,
      "Insufficient privilege to perform this method.",
    );
  }
  const params = request.params ?? {};
  const account = (params.account ?? {}) as { order_id?: string };
  const now = Date.now();

  // Only this centre's orders: the key that authenticated the call names it.
  const own = {
    provider: "PAYME" as const,
    student: { branch: { organizationId: matched.organizationId } },
  };
  const findOrder = async () => {
    const id = typeof account.order_id === "string" ? account.order_id : "";
    return id ? db.onlinePayment.findFirst({ where: { id, ...own } }) : null;
  };
  const checkAmount = (order: { amount: Prisma.Decimal }) =>
    Math.round(decimalToNumber(order.amount) * 100) === Number(params.amount);
  const findTransaction = async () =>
    typeof params.id === "string"
      ? db.onlinePayment.findFirst({ where: { externalId: params.id, ...own } })
      : null;
  const transactionDto = (t: {
    id: string;
    externalTime: bigint | null;
    performedAt: Date | null;
    cancelledAt: Date | null;
    externalState: number | null;
    cancelReason: number | null;
  }) => ({
    create_time: Number(t.externalTime ?? 0),
    perform_time: t.performedAt?.getTime() ?? 0,
    cancel_time: t.cancelledAt?.getTime() ?? 0,
    transaction: t.id,
    state: paymeState(t.externalState),
    reason: t.cancelReason,
  });

  switch (request.method) {
    case "CheckPerformTransaction": {
      const order = await findOrder();
      if (!order || order.status !== "PENDING") {
        return paymeError(request.id, PAYME_ERRORS.order, "Order not found.", "order_id");
      }
      if (!checkAmount(order)) return paymeError(request.id, PAYME_ERRORS.amount, "Wrong amount.");
      return { id: request.id ?? null, result: { allow: true } };
    }
    case "CreateTransaction": {
      const existing = await findTransaction();
      if (existing) {
        if (paymeState(existing.externalState) !== 1) {
          return paymeError(request.id, PAYME_ERRORS.cannotPerform, "Transaction is not active.");
        }
        return { id: request.id ?? null, result: transactionDto(existing) };
      }
      const order = await findOrder();
      if (!order || order.status !== "PENDING") {
        return paymeError(request.id, PAYME_ERRORS.order, "Order not found.", "order_id");
      }
      if (!checkAmount(order)) return paymeError(request.id, PAYME_ERRORS.amount, "Wrong amount.");
      if (order.externalId && order.externalId !== params.id) {
        return paymeError(
          request.id,
          PAYME_ERRORS.order,
          "Order is being paid already.",
          "order_id",
        );
      }
      const row = await db.onlinePayment.update({
        where: { id: order.id },
        data: {
          externalId: String(params.id),
          externalState: 1,
          externalTime: BigInt(typeof params.time === "number" ? params.time : now),
        },
      });
      return { id: request.id ?? null, result: transactionDto(row) };
    }
    case "PerformTransaction": {
      const t = await findTransaction();
      if (!t) return paymeError(request.id, PAYME_ERRORS.transaction, "Transaction not found.");
      if (paymeState(t.externalState) === 2) {
        return { id: request.id ?? null, result: transactionDto(t) };
      }
      if (paymeState(t.externalState) !== 1) {
        return paymeError(request.id, PAYME_ERRORS.cannotPerform, "Transaction is not active.");
      }
      const performedAt = new Date(now);
      const row = await db.$transaction(async (tx) => {
        await settle(tx, t.id, performedAt);
        return tx.onlinePayment.update({ where: { id: t.id }, data: { externalState: 2 } });
      });
      return { id: request.id ?? null, result: transactionDto(row) };
    }
    case "CancelTransaction": {
      const t = await findTransaction();
      if (!t) return paymeError(request.id, PAYME_ERRORS.transaction, "Transaction not found.");
      const state = paymeState(t.externalState);
      if (state === 2) {
        // Money already booked as a payment; refunds go through the cashier (A-106).
        return paymeError(
          request.id,
          PAYME_ERRORS.cannotCancel,
          "Cannot cancel a performed transaction.",
        );
      }
      if (state < 0) return { id: request.id ?? null, result: transactionDto(t) };
      const row = await db.onlinePayment.update({
        where: { id: t.id },
        data: {
          externalState: -1,
          status: "CANCELLED",
          cancelledAt: new Date(now),
          cancelReason: typeof params.reason === "number" ? params.reason : null,
        },
      });
      return { id: request.id ?? null, result: transactionDto(row) };
    }
    case "CheckTransaction": {
      const t = await findTransaction();
      if (!t) return paymeError(request.id, PAYME_ERRORS.transaction, "Transaction not found.");
      return { id: request.id ?? null, result: transactionDto(t) };
    }
    case "GetStatement": {
      const from = typeof params.from === "number" ? params.from : 0;
      const to = typeof params.to === "number" ? params.to : now;
      const rows = await db.onlinePayment.findMany({
        where: {
          provider: "PAYME",
          externalId: { not: null },
          externalTime: { gte: BigInt(from), lte: BigInt(to) },
        },
        orderBy: { externalTime: "asc" },
      });
      return {
        id: request.id ?? null,
        result: {
          transactions: rows.map((t) => ({
            id: t.externalId,
            time: Number(t.externalTime ?? 0),
            amount: Math.round(decimalToNumber(t.amount) * 100),
            account: { order_id: t.id },
            ...transactionDto(t),
          })),
        },
      };
    }
    default:
      return paymeError(request.id, PAYME_ERRORS.method, "Method not found.");
  }
}

/* ----- Click SHOP API ----------------------------------------------------------------------- */

const CLICK_ERRORS = {
  ok: 0,
  sign: -1,
  amount: -2,
  action: -3,
  alreadyPaid: -4,
  order: -5,
  transaction: -6,
  update: -7,
  request: -8,
  cancelled: -9,
} as const;

export function clickSignature(
  secretKey: string,
  f: Record<string, string>,
  withPrepareId: boolean,
): string {
  const parts = [
    f.click_trans_id,
    f.service_id,
    secretKey,
    f.merchant_trans_id,
    ...(withPrepareId ? [f.merchant_prepare_id] : []),
    f.amount,
    f.action,
    f.sign_time,
  ];
  return createHash("md5")
    .update(parts.map((p) => p ?? "").join(""))
    .digest("hex");
}

/**
 * One Click SHOP API call (form fields). Action 0 is "prepare" (hold the
 * order), action 1 "complete" (money moved, or `error` < 0 when it failed).
 */
export async function handleClick(
  db: DbClient,
  fields: Record<string, string>,
): Promise<Record<string, unknown>> {
  const reply = (error: number, note: string, extra: Record<string, unknown> = {}) => ({
    click_trans_id: fields.click_trans_id ?? "",
    merchant_trans_id: fields.merchant_trans_id ?? "",
    error,
    error_note: note,
    ...extra,
  });
  const matched = await clickConfigByServiceId(db, fields.service_id ?? "");
  if (!matched) return reply(CLICK_ERRORS.sign, "SIGN CHECK FAILED!");
  const { config } = matched;
  const action = fields.action;
  if (action !== "0" && action !== "1") return reply(CLICK_ERRORS.action, "Action not found");
  if (clickSignature(config.secretKey, fields, action === "1") !== fields.sign_string) {
    return reply(CLICK_ERRORS.sign, "SIGN CHECK FAILED!");
  }
  const order = fields.merchant_trans_id
    ? await db.onlinePayment.findFirst({
        where: {
          id: fields.merchant_trans_id,
          provider: "CLICK",
          student: { branch: { organizationId: matched.organizationId } },
        },
      })
    : null;
  if (!order) return reply(CLICK_ERRORS.order, "User does not exist");
  if (order.status === "PAID") {
    return reply(CLICK_ERRORS.alreadyPaid, "Already paid", {
      merchant_prepare_id: order.id,
      merchant_confirm_id: order.id,
    });
  }
  if (order.status === "CANCELLED") return reply(CLICK_ERRORS.cancelled, "Transaction cancelled");
  if (Math.abs(Number(fields.amount) - decimalToNumber(order.amount)) > 0.01) {
    return reply(CLICK_ERRORS.amount, "Incorrect parameter amount");
  }

  if (action === "0") {
    await db.onlinePayment.update({
      where: { id: order.id },
      data: { externalId: fields.click_trans_id, externalState: 0 },
    });
    return reply(CLICK_ERRORS.ok, "Success", { merchant_prepare_id: order.id });
  }

  if (fields.merchant_prepare_id !== order.id || order.externalId !== fields.click_trans_id) {
    return reply(CLICK_ERRORS.transaction, "Transaction does not exist");
  }
  if (Number(fields.error ?? 0) < 0) {
    await db.onlinePayment.update({
      where: { id: order.id },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancelReason: Number(fields.error),
      },
    });
    return reply(CLICK_ERRORS.cancelled, "Transaction cancelled");
  }
  await db.$transaction(async (tx) => {
    await settle(tx, order.id, new Date());
    await tx.onlinePayment.update({ where: { id: order.id }, data: { externalState: 1 } });
  });
  return reply(CLICK_ERRORS.ok, "Success", { merchant_confirm_id: order.id });
}
