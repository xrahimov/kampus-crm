"use client";

import { Plus, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
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
import { FormDialog } from "@/features/settings/shared/form-dialog";
import { todayIso } from "@/features/staff/password";
import { api, ApiError } from "@/lib/api-client";
import { parseDateOnly } from "@/lib/dates";
import { useDateFormat } from "@/lib/use-date-format";
import { useMoneyFormat } from "@/lib/use-money-format";
import type { InstalmentPlanDto } from "@/server/services/students/instalments.service";

interface PartDraft {
  dueDate: string;
  amount: string;
  paid: boolean;
}
type Loaded = { key: string; plan: InstalmentPlanDto | null; error: string | null };

const addDays = (iso: string, days: number) => {
  const d = parseDateOnly(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
};

/** Whole soʻm, the last part taking the remainder. */
function equalParts(amount: number, count: number): string[] {
  const base = Math.floor(amount / count);
  return Array.from({ length: count }, (_, i) =>
    String(i === count - 1 ? amount - base * (count - 1) : base),
  );
}

function draftFrom(plan: InstalmentPlanDto): PartDraft[] {
  if (plan.parts.length > 0) {
    return plan.parts.map((p) => ({ dueDate: p.dueDate, amount: String(p.amount), paid: p.paid }));
  }
  const today = todayIso();
  const first = plan.month > today ? plan.month : today;
  const amounts = equalParts(plan.amount, 2);
  return [
    { dueDate: first, amount: amounts[0]!, paid: false },
    { dueDate: addDays(first, 15), amount: amounts[1]!, paid: false },
  ];
}

/**
 * "Bo'lib to'lash" (A-123): one month's fee in two or three parts, each with its
 * own day; a part is a debt only once its day has passed.
 */
export function InstalmentsDialog({
  open,
  onOpenChange,
  membershipId,
  groupName,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  membershipId: string | null;
  groupName: string;
  onSaved: () => void;
}) {
  const t = useTranslations("students.instalments");
  const tc = useTranslations();
  const money = useMoneyFormat();
  const fmt = useDateFormat();
  const [month, setMonth] = useState<string | null>(null);
  const [loaded, setLoaded] = useState<Loaded | null>(null);
  const [parts, setParts] = useState<PartDraft[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fields, setFields] = useState<Record<string, string[]>>({});

  const key = `${membershipId ?? ""}|${month ?? ""}`;
  useEffect(() => {
    if (!open || !membershipId) return;
    let cancelled = false;
    const q = month ? `?month=${encodeURIComponent(month)}` : "";
    api<InstalmentPlanDto>(`/memberships/${membershipId}/instalments${q}`)
      .then((plan) => {
        if (cancelled) return;
        setLoaded({ key, plan, error: null });
        setParts(draftFrom(plan));
      })
      .catch((e: unknown) => {
        if (cancelled) return;
        setLoaded({
          key,
          plan: null,
          error: e instanceof ApiError ? e.message : "errors.internal",
        });
      });
    return () => {
      cancelled = true;
    };
  }, [open, membershipId, month, key]);

  const current = loaded?.key === key ? loaded : null;
  const plan = current?.plan ?? null;
  const allocated = parts.reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const left = plan ? Math.round((plan.amount - allocated) * 100) / 100 : 0;

  function reset() {
    setMonth(null);
    setLoaded(null);
    setParts([]);
    setError(null);
    setFields({});
  }

  function change(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  function update(index: number, patch: Partial<PartDraft>) {
    setParts((list) => list.map((p, i) => (i === index ? { ...p, ...patch } : p)));
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!membershipId || !plan) return;
    setBusy(true);
    setError(null);
    setFields({});
    try {
      await api(`/memberships/${membershipId}/instalments`, {
        method: "PUT",
        body: {
          month: plan.month,
          parts: parts.map((p) => ({ dueDate: p.dueDate, amount: p.amount })),
        },
      });
      change(false);
      onSaved();
    } catch (e) {
      if (e instanceof ApiError && e.fields) setFields(e.fields);
      setError(e instanceof ApiError ? e.message : "errors.internal");
    } finally {
      setBusy(false);
    }
  }

  async function clear() {
    if (!membershipId || !plan) return;
    setBusy(true);
    setError(null);
    try {
      await api(
        `/memberships/${membershipId}/instalments?month=${encodeURIComponent(plan.month)}`,
        {
          method: "DELETE",
        },
      );
      change(false);
      onSaved();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "errors.internal");
    } finally {
      setBusy(false);
    }
  }

  const partsError = fields.parts?.[0] ?? fields.month?.[0] ?? null;

  return (
    <FormDialog
      open={open}
      onOpenChange={change}
      title={`${t("title")} · ${groupName}`}
      description={t("hint")}
      onSubmit={submit}
      submitting={busy}
      error={error}
      submitLabel={t("save")}
      testId="instalments-dialog"
    >
      {!current ? (
        <p className="text-sm text-muted-foreground">{t("loading")}</p>
      ) : current.error ? (
        <Alert variant="destructive">
          {tc.has(current.error) ? tc(current.error) : tc("errors.internal")}
        </Alert>
      ) : plan ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label htmlFor="inst-month">{t("month")}</Label>
              <Select value={plan.month} onValueChange={(v) => setMonth(v)}>
                <SelectTrigger id="inst-month">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {plan.months.map((m) => (
                    <SelectItem key={m} value={m}>
                      {fmt(parseDateOnly(m), { month: "short", year: "numeric" })}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>{t("amount")}</Label>
              <div className="flex h-9 items-center text-lg font-semibold tabular-nums">
                <span data-testid="inst-amount">{money(plan.amount)}</span>
              </div>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {t("balance", { balance: money(plan.balance) })}
          </p>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2">
              <Label>{t("parts")}</Label>
              <div className="flex gap-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    const amounts = equalParts(plan.amount, parts.length);
                    setParts((list) => list.map((p, i) => ({ ...p, amount: amounts[i]! })));
                  }}
                  data-testid="inst-equal"
                >
                  {t("equal")}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  disabled={parts.length >= 3}
                  onClick={() =>
                    setParts((list) => [
                      ...list,
                      {
                        dueDate: addDays(list.at(-1)?.dueDate ?? todayIso(), 10),
                        amount: "0",
                        paid: false,
                      },
                    ])
                  }
                  data-testid="inst-add"
                >
                  <Plus /> {t("addPart")}
                </Button>
              </div>
            </div>
            <ul className="space-y-2">
              {parts.map((p, i) => (
                <li
                  key={i}
                  className="grid grid-cols-[1fr_1fr_auto] items-end gap-2"
                  data-testid="inst-part"
                >
                  <div className="space-y-1">
                    <Label htmlFor={`inst-date-${i}`} className="text-xs text-muted-foreground">
                      {t("part", { n: i + 1 })} · {t("dueDate")}
                    </Label>
                    <Input
                      id={`inst-date-${i}`}
                      type="date"
                      value={p.dueDate}
                      onChange={(e) => update(i, { dueDate: e.target.value })}
                      aria-label={`${t("part", { n: i + 1 })} ${t("dueDate")}`}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor={`inst-amount-${i}`} className="text-xs text-muted-foreground">
                      {t("partAmount")}
                      {p.paid && (
                        <Badge variant="success" className="ml-1">
                          {t("paid")}
                        </Badge>
                      )}
                    </Label>
                    <Input
                      id={`inst-amount-${i}`}
                      type="number"
                      min={0}
                      step={1000}
                      inputMode="numeric"
                      value={p.amount}
                      onChange={(e) => update(i, { amount: e.target.value })}
                      aria-label={`${t("part", { n: i + 1 })} ${t("partAmount")}`}
                    />
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    disabled={parts.length <= 2}
                    aria-label={t("removePart")}
                    onClick={() => setParts((list) => list.filter((_, j) => j !== i))}
                  >
                    <Trash2 />
                  </Button>
                </li>
              ))}
            </ul>
            <p
              className={`text-sm ${left !== 0 ? "text-destructive" : "text-muted-foreground"}`}
              data-testid="inst-remaining"
            >
              {t("remaining", { amount: money(left) })}
            </p>
            {partsError && (
              <p className="text-sm text-destructive" role="alert">
                {tc.has(partsError) ? tc(partsError) : tc("validation.required")}
              </p>
            )}
          </div>
          {plan.parts.length > 0 && (
            <Button
              type="button"
              variant="outline"
              className="text-destructive"
              disabled={busy}
              onClick={() => void clear()}
              data-testid="inst-clear"
            >
              {t("clear")}
            </Button>
          )}
        </>
      ) : null}
    </FormDialog>
  );
}
