import { createHash } from "node:crypto";

/*
 * Online fiscal receipts behind an interface (A-20, A-147). Uzbekistan's
 * online cash registers are reached through an OFD provider's HTTP API; which
 * provider a centre uses is its accountant's choice, so the real adapter talks
 * to one small, documented contract that any provider's API can be mapped to,
 * and the fake one records receipts in memory for development and tests.
 */

export type FiscalPaymentType = "CASH" | "CARD";

export interface FiscalReceiptRequest {
  kind: "SALE" | "REFUND";
  /** Kampus' own reference: the payment id, or the refund id for a refund. */
  reference: string;
  /** The sale this refund returns money for; empty on a sale. */
  originalReference: string | null;
  /** Whole so'm. */
  amount: number;
  paymentType: FiscalPaymentType;
  inn: string;
  cashRegisterId: string;
  vatPercent: number;
  /** The MXIK (ИКПУ) code of the service, when the centre has one. */
  ikpuCode: string;
  items: Array<{ name: string; price: number; quantity: number }>;
  customerPhone: string | null;
  issuedAt: string; // ISO
}

export interface FiscalReceiptResult {
  externalId: string;
  fiscalSign: string;
  receiptUrl: string | null;
  qrUrl: string | null;
}

export interface FiscalProvider {
  readonly name: "fake" | "http";
  issue(request: FiscalReceiptRequest): Promise<FiscalReceiptResult>;
}

export interface FiscalHttpConfig {
  apiUrl: string;
  apiKey: string;
}

/** Receipts the fake provider "issued" during this process, newest last. */
export const fakeFiscalOutbox: FiscalReceiptRequest[] = [];
/** Set by tests: the fake provider refuses the next receipt with this message. */
export let fakeFiscalFailNext: string | null = null;
export function failNextFiscalReceipt(message: string | null): void {
  fakeFiscalFailNext = message;
}

export class FakeFiscalProvider implements FiscalProvider {
  readonly name = "fake" as const;
  async issue(request: FiscalReceiptRequest): Promise<FiscalReceiptResult> {
    if (fakeFiscalFailNext) {
      const message = fakeFiscalFailNext;
      fakeFiscalFailNext = null;
      throw new Error(message);
    }
    fakeFiscalOutbox.push(request);
    if (fakeFiscalOutbox.length > 500) fakeFiscalOutbox.splice(0, fakeFiscalOutbox.length - 500);
    const sign = createHash("sha256")
      .update(`${request.kind}:${request.reference}:${request.amount}`)
      .digest("hex")
      .slice(0, 12)
      .toUpperCase();
    return {
      externalId: `fake-${request.kind.toLowerCase()}-${request.reference.slice(-8)}`,
      fiscalSign: sign,
      receiptUrl: null,
      qrUrl: null,
    };
  }
}

/**
 * The contract the real provider is mapped to: `POST {apiUrl}/receipts` with a
 * bearer key and the request as JSON; the answer carries `id`, `fiscalSign` and,
 * when the provider hosts a page for the receipt, `url` and `qrUrl`.
 */
export class HttpFiscalProvider implements FiscalProvider {
  readonly name = "http" as const;
  constructor(private readonly config: FiscalHttpConfig) {}

  async issue(request: FiscalReceiptRequest): Promise<FiscalReceiptResult> {
    const res = await fetch(`${this.config.apiUrl.replace(/\/$/, "")}/receipts`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
        authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(request),
    });
    const data = (await res.json().catch(() => null)) as {
      id?: string | number;
      fiscalSign?: string;
      url?: string;
      qrUrl?: string;
      message?: string;
      error?: string;
    } | null;
    if (!res.ok || !data || data.id === undefined || !data.fiscalSign) {
      const why = data?.message ?? data?.error ?? "";
      throw new Error(`fiscal: receipt refused (${res.status}) ${why}`.trim());
    }
    return {
      externalId: String(data.id),
      fiscalSign: data.fiscalSign,
      receiptUrl: data.url ?? null,
      qrUrl: data.qrUrl ?? null,
    };
  }
}

let fake: FakeFiscalProvider | undefined;

export function createFiscalProvider(
  config: { isEnabled: boolean; apiUrl: string; apiKey: string } | null,
): FiscalProvider {
  if (config?.isEnabled && config.apiUrl && config.apiKey) {
    return new HttpFiscalProvider({ apiUrl: config.apiUrl, apiKey: config.apiKey });
  }
  fake ??= new FakeFiscalProvider();
  return fake;
}
