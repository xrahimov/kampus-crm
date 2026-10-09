import type { Prisma } from "@/generated/prisma/client";
import { recordAudit } from "@/server/audit/audit";
import { prisma, type DbClient } from "@/server/db/prisma";
import { AppError } from "@/server/errors/app-error";
import type { FiscalReceiptRequest } from "@/server/integrations/fiscal/provider";
import { enqueue } from "@/server/jobs/queue";
import { authorize, type Actor } from "@/server/rbac/authorize";
import {
  fiscalConfigFor,
  getFiscalProvider,
} from "@/server/services/integrations/integrations.service";
import { decimalToNumber } from "@/server/services/settings/shared";

/*
 * Fiscal receipts (round 2 item C6, A-147). When the centre has switched the
 * fiscal integration on, every cash-desk payment and refund gets a
 * `FiscalReceipt` row and a `fiscal.issue` job; the job sends the receipt to
 * the OFD provider and keeps the fiscal sign, which the printable receipt
 * shows. A failed receipt stays visible with its error and can be retried.
 */

export interface FiscalReceiptDto {
  id: string;
  kind: "SALE" | "REFUND";
  status: "PENDING" | "ISSUED" | "FAILED";
  provider: string;
  externalId: string | null;
  fiscalSign: string | null;
  receiptUrl: string | null;
  qrUrl: string | null;
  error: string | null;
  attempts: number;
  issuedAt: string | null;
}

export function fiscalToDto(row: {
  id: string;
  kind: "SALE" | "REFUND";
  status: "PENDING" | "ISSUED" | "FAILED";
  provider: string;
  externalId: string | null;
  fiscalSign: string | null;
  receiptUrl: string | null;
  qrUrl: string | null;
  error: string | null;
  attempts: number;
  issuedAt: Date | null;
}): FiscalReceiptDto {
  return {
    id: row.id,
    kind: row.kind,
    status: row.status,
    provider: row.provider,
    externalId: row.externalId,
    fiscalSign: row.fiscalSign,
    receiptUrl: row.receiptUrl,
    qrUrl: row.qrUrl,
    error: row.error,
    attempts: row.attempts,
    issuedAt: row.issuedAt?.toISOString() ?? null,
  };
}

/**
 * Called inside the payment's own transaction: files the receipt row and queues
 * the job when the centre fiscalises by itself. Nothing happens when the
 * integration is off, so centres without an OFD contract see no change.
 */
export async function queueFiscalReceipt(
  tx: DbClient,
  input: {
    organizationId: string;
    paymentId: string;
    kind: "SALE" | "REFUND";
    refundId?: string | null;
  },
): Promise<string | null> {
  const config = await fiscalConfigFor(tx, input.organizationId);
  if (!config?.autoIssue) return null;
  return fileReceipt(tx, { ...input, provider: getFiscalProvider(config).name });
}

async function fileReceipt(
  tx: DbClient,
  input: {
    organizationId: string;
    paymentId: string;
    kind: "SALE" | "REFUND";
    refundId?: string | null;
    provider: string;
  },
): Promise<string> {
  const row = await tx.fiscalReceipt.create({
    data: {
      organizationId: input.organizationId,
      paymentId: input.paymentId,
      refundId: input.refundId ?? null,
      kind: input.kind,
      provider: input.provider,
    },
    select: { id: true },
  });
  await enqueue(tx, {
    type: "fiscal.issue",
    payload: { receiptId: row.id },
    uniqueKey: `fiscal:${row.id}`,
  });
  return row.id;
}

const receiptInclude = {
  payment: {
    include: {
      student: { select: { fullName: true, phone: true } },
      membership: {
        select: { group: { select: { name: true, course: { select: { name: true } } } } },
      },
      paymentMethod: { select: { isCash: true } },
    },
  },
  refund: { select: { amount: true } },
} satisfies Prisma.FiscalReceiptInclude;

function requestFor(
  row: Prisma.FiscalReceiptGetPayload<{ include: typeof receiptInclude }>,
  config: { inn: string; cashRegisterId: string; vatPercent: number; ikpuCode: string },
): FiscalReceiptRequest {
  const amount =
    row.kind === "REFUND" && row.refund
      ? decimalToNumber(row.refund.amount)
      : decimalToNumber(row.payment.amount);
  const name = `${row.payment.membership.group.course.name} · ${row.payment.membership.group.name}`;
  return {
    kind: row.kind,
    reference: row.kind === "REFUND" ? (row.refundId ?? row.paymentId) : row.paymentId,
    originalReference: row.kind === "REFUND" ? row.paymentId : null,
    amount,
    paymentType: row.payment.paymentMethod?.isCash ? "CASH" : "CARD",
    inn: config.inn,
    cashRegisterId: config.cashRegisterId,
    vatPercent: config.vatPercent,
    ikpuCode: config.ikpuCode,
    items: [{ name, price: amount, quantity: 1 }],
    customerPhone: row.payment.student.phone || null,
    issuedAt: new Date().toISOString(),
  };
}

/** The job: sends one receipt to the provider; a failure is kept on the row and rethrown for a retry. */
export async function issueFiscalReceipt(
  db: DbClient,
  receiptId: string,
): Promise<FiscalReceiptDto | null> {
  const row = await db.fiscalReceipt.findUnique({
    where: { id: receiptId },
    include: receiptInclude,
  });
  if (!row || row.status === "ISSUED") return row ? fiscalToDto(row) : null;
  const config = await fiscalConfigFor(db, row.organizationId);
  if (!config) {
    const off = await db.fiscalReceipt.update({
      where: { id: receiptId },
      data: { status: "FAILED", error: "errors.fiscalDisabled", attempts: { increment: 1 } },
    });
    return fiscalToDto(off);
  }
  const provider = getFiscalProvider(config);
  try {
    const result = await provider.issue(requestFor(row, config));
    const issued = await db.fiscalReceipt.update({
      where: { id: receiptId },
      data: {
        status: "ISSUED",
        provider: provider.name,
        externalId: result.externalId,
        fiscalSign: result.fiscalSign,
        receiptUrl: result.receiptUrl,
        qrUrl: result.qrUrl,
        error: null,
        attempts: { increment: 1 },
        issuedAt: new Date(),
      },
    });
    await recordAudit(db, null, {
      organizationId: row.organizationId,
      branchId: row.payment.branchId,
      action: "payment.fiscal",
      entity: "Payment",
      entityId: row.paymentId,
      after: { kind: row.kind, externalId: result.externalId, fiscalSign: result.fiscalSign },
    });
    return fiscalToDto(issued);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await db.fiscalReceipt.update({
      where: { id: receiptId },
      data: { status: "FAILED", error: message.slice(0, 500), attempts: { increment: 1 } },
    });
    throw error;
  }
}

/**
 * "Issue fiscal receipt" on a payment: files the sale receipt when there is
 * none (the integration was off, or auto-issue is), retries a failed one, and
 * runs it at once so the cashier sees the outcome.
 */
export async function issueFiscalReceiptNow(
  actor: Actor,
  paymentId: string,
  db: DbClient = prisma,
): Promise<FiscalReceiptDto> {
  authorize(actor, "payments.create");
  const payment = await db.payment.findFirst({
    where: { id: paymentId, branch: { organizationId: actor.organizationId } },
    select: { id: true, branchId: true },
  });
  if (!payment || !actor.branchIds.includes(payment.branchId)) throw AppError.notFound();
  const config = await fiscalConfigFor(db, actor.organizationId);
  if (!config) throw AppError.conflict("errors.fiscalDisabled");
  let receipt = await db.fiscalReceipt.findFirst({
    where: { paymentId, kind: "SALE" },
    orderBy: { createdAt: "desc" },
    select: { id: true, status: true },
  });
  if (receipt?.status === "ISSUED") throw AppError.conflict("errors.fiscalIssued");
  if (!receipt) {
    const id = await fileReceipt(db, {
      organizationId: actor.organizationId,
      paymentId,
      kind: "SALE",
      provider: getFiscalProvider(config).name,
    });
    receipt = { id, status: "PENDING" };
  }
  try {
    const dto = await issueFiscalReceipt(db, receipt.id);
    if (!dto) throw AppError.notFound();
    // The queued job finds the row issued and does nothing.
    return dto;
  } catch (error) {
    if (error instanceof AppError) throw error;
    const failed = await db.fiscalReceipt.findUniqueOrThrow({ where: { id: receipt.id } });
    return fiscalToDto(failed);
  }
}
