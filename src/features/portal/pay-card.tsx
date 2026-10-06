"use client";

import { CreditCard } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useRouter } from "@/i18n/navigation";
import type { ApiErrorBody } from "@/lib/api-client";
import { parseDateOnly } from "@/lib/dates";
import { useDateFormat } from "@/lib/use-date-format";
import { useMoneyFormat } from "@/lib/use-money-format";
import type {
  OnlinePaymentStatusDto,
  PortalPayOptionsDto,
} from "@/server/services/payments/online-payments.service";

const PROVIDER_NAME = { PAYME: "Payme", CLICK: "Click" } as const;
const POLL_MS = 3000;
const POLL_LIMIT = 40;

/**
 * "Pay online" on the student's money tab (A-106): amount and month, one
 * button per provider the centre switched on. After the provider sends the
 * student back with `?paid=<order>`, the card polls until the payment lands.
 */
export function PayCard({ token, options }: { token: string; options: PortalPayOptionsDto }) {
  const t = useTranslations("portal.pay");
  const fmt = useDateFormat();
  const money = useMoneyFormat();
  const te = useTranslations();
  const router = useRouter();
  const [amount, setAmount] = useState(String(options.suggestedAmount || ""));
  const [month, setMonth] = useState(options.suggestedMonth);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [outcome, setOutcome] = useState<OnlinePaymentStatusDto | "checking" | null>(null);

  // Back from the provider: ask until the webhook has confirmed (or given up).
  useEffect(() => {
    const paid = new URLSearchParams(window.location.search).get("paid");
    if (!paid) return;
    let tries = 0;
    let stopped = false;
    const check = async () => {
      tries += 1;
      const r = await fetch(
        `/api/v1/public/class/${encodeURIComponent(token)}/pay/${encodeURIComponent(paid)}`,
        { headers: { Accept: "application/json" } },
      ).catch(() => null);
      if (stopped) return;
      const status = r?.ok ? ((await r.json()) as OnlinePaymentStatusDto) : null;
      if (status && status.status !== "PENDING") {
        setOutcome(status);
        if (status.status === "PAID") router.refresh();
        window.history.replaceState(null, "", window.location.pathname);
        return;
      }
      if (tries >= POLL_LIMIT) {
        setOutcome(status ?? null);
        return;
      }
      timer = setTimeout(() => void check(), POLL_MS);
    };
    let timer = setTimeout(() => {
      setOutcome("checking");
      void check();
    }, 0);
    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [token, router]);

  async function pay(provider: PortalPayOptionsDto["providers"][number]) {
    setBusy(provider);
    setError(null);
    try {
      const response = await fetch(`/api/v1/public/class/${encodeURIComponent(token)}/pay`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify({ provider, amount: Number(amount), effectiveMonth: month }),
      });
      if (!response.ok) {
        const body = (await response.json().catch(() => null)) as ApiErrorBody | null;
        const fieldError = body?.error.fields
          ? Object.values(body.error.fields).flat()[0]
          : undefined;
        throw new Error(fieldError ?? body?.error.message ?? "failed");
      }
      const { url } = (await response.json()) as { id: string; url: string };
      window.location.assign(url);
    } catch (e) {
      setError(e instanceof Error ? e.message : "failed");
      setBusy(null);
    }
  }

  if (options.providers.length === 0) return null;
  const errorText = error ? (te.has(error) ? te(error) : t("failed")) : null;

  return (
    <section className="space-y-3 rounded-lg border p-4" data-testid="portal-pay">
      <h3 className="flex items-center gap-2 text-sm font-medium">
        <CreditCard className="size-4" /> {t("title")}
      </h3>
      {outcome === "checking" ? (
        <Alert data-testid="pay-outcome">{t("checking")}</Alert>
      ) : outcome?.status === "PAID" ? (
        <Alert variant="success" data-testid="pay-outcome">
          {t("paid", { amount: money(outcome.amount) })}
        </Alert>
      ) : outcome?.status === "CANCELLED" ? (
        <Alert variant="destructive" data-testid="pay-outcome">
          {t("cancelled")}
        </Alert>
      ) : outcome?.status === "PENDING" ? (
        <Alert data-testid="pay-outcome">{t("pending")}</Alert>
      ) : null}
      <p className="text-sm text-muted-foreground">{t("intro")}</p>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="pay-amount">{t("amount")}</Label>
          <Input
            id="pay-amount"
            type="number"
            min={1000}
            step={1000}
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            data-testid="pay-amount"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="pay-month">{t("month")}</Label>
          <Select value={month} onValueChange={setMonth}>
            <SelectTrigger id="pay-month" data-testid="pay-month">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {options.months.map((m) => (
                <SelectItem key={m} value={m}>
                  {fmt(parseDateOnly(m), { month: "short", year: "numeric" })}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>
      {errorText && (
        <p role="alert" className="text-sm text-destructive">
          {errorText}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        {options.providers.map((p) => (
          <Button
            key={p}
            onClick={() => void pay(p)}
            disabled={busy !== null || Number(amount) < 1000}
            data-testid={`pay-${p.toLowerCase()}`}
          >
            {busy === p
              ? t("redirecting", { provider: PROVIDER_NAME[p] })
              : t("payWith", { provider: PROVIDER_NAME[p] })}
          </Button>
        ))}
      </div>
    </section>
  );
}
