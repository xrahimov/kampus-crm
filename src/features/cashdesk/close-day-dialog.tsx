"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Controller, useForm, useWatch, type Resolver } from "react-hook-form";
import type { z } from "zod";

import { FieldError } from "@/components/data/field-error";
import { Alert } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import type { BranchOption } from "@/features/settings/shared/branch-select";
import { FormDialog } from "@/features/settings/shared/form-dialog";
import { api, ApiError } from "@/lib/api-client";
import { applyApiError } from "@/lib/api-errors";
import { useMoneyFormat } from "@/lib/use-money-format";
import { cashCloseSchema, type CashCloseInput } from "@/lib/validation/finance";
import type { CashDayPreviewDto } from "@/server/services/finance/cash-close.service";

type Input = z.input<typeof cashCloseSchema>;
type Preview = { key: string; day: CashDayPreviewDto | null; error: string | null };

/**
 * "Close the day" (A-122): shows what the cashier recorded that day by payment type and the
 * cash the drawer should hold; the cashier counts the money and enters it.
 */
export function CloseDayDialog({
  open,
  onOpenChange,
  branches,
  defaultBranchId,
  today,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  branches: BranchOption[];
  defaultBranchId: string;
  today: string;
  onSaved: () => void;
}) {
  const t = useTranslations("cashdesk");
  const money = useMoneyFormat();
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);

  const empty = (): Input => ({
    branchId: defaultBranchId,
    date: today,
    countedCash: "",
    note: "",
  });
  const form = useForm<Input, unknown, CashCloseInput>({
    resolver: zodResolver(cashCloseSchema) as unknown as Resolver<Input, unknown, CashCloseInput>,
    defaultValues: empty(),
  });
  const branchId = useWatch({ control: form.control, name: "branchId" });
  const date = useWatch({ control: form.control, name: "date" });
  const counted = useWatch({ control: form.control, name: "countedCash" });

  useEffect(() => {
    if (!open) return;
    form.reset(empty());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const key = `${branchId}|${date}`;
  useEffect(() => {
    if (!open || !branchId || !/^\d{4}-\d{2}-\d{2}$/.test(date ?? "")) return;
    let cancelled = false;
    api<CashDayPreviewDto>(
      `/cashdesk/preview?branchId=${encodeURIComponent(branchId)}&date=${encodeURIComponent(date)}`,
    )
      .then((day) => {
        if (!cancelled) setPreview({ key, day, error: null });
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setPreview({
            key,
            day: null,
            error: e instanceof ApiError ? e.message : "errors.internal",
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, branchId, date, key]);

  const current = preview?.key === key ? preview : null;
  const day = current?.day ?? null;
  const loading = open && !current;
  const countedNumber = counted === "" || counted === undefined ? 0 : Number(counted);
  const difference =
    day && Number.isFinite(countedNumber)
      ? Math.round((countedNumber - day.expectedCash) * 100) / 100
      : null;
  const accepted = !!day?.existing?.acceptedAt;

  async function onSubmit(values: CashCloseInput) {
    setError(null);
    try {
      await api("/cashdesk", { method: "POST", body: values });
      onOpenChange(false);
      onSaved();
    } catch (e) {
      setError(applyApiError(e, form.setError));
    }
  }

  const { errors, isSubmitting } = form.formState;
  const signed = (v: number) => (v > 0 ? `+${money(v)}` : money(v));

  return (
    <FormDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) setError(null);
        onOpenChange(next);
      }}
      title={t("dialog.title")}
      description={t("dialog.hint")}
      onSubmit={form.handleSubmit(onSubmit)}
      submitting={isSubmitting}
      error={error}
      submitLabel={t("dialog.save")}
      testId="close-day-dialog"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="close-branch">{t("dialog.branch")}</Label>
          <Controller
            control={form.control}
            name="branchId"
            render={({ field }) => (
              <Select
                value={field.value ?? ""}
                onValueChange={field.onChange}
                disabled={branches.length <= 1}
              >
                <SelectTrigger id="close-branch" aria-invalid={!!errors.branchId}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {branches.map((b) => (
                    <SelectItem key={b.id} value={b.id}>
                      {b.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
          />
          <FieldError id="close-branch-error" message={errors.branchId?.message} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="close-date">{t("dialog.date")}</Label>
          <Input
            id="close-date"
            type="date"
            max={today}
            aria-invalid={!!errors.date}
            {...form.register("date")}
          />
          <FieldError id="close-date-error" message={errors.date?.message} />
        </div>
      </div>

      <div className="rounded-md border" data-testid="close-preview">
        {loading ? (
          <p className="p-4 text-sm text-muted-foreground">{t("dialog.loading")}</p>
        ) : current?.error ? (
          <p className="p-4 text-sm text-destructive">
            {t.has(current.error) ? t(current.error) : current.error}
          </p>
        ) : day ? (
          <>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("dialog.method")}</TableHead>
                  <TableHead className="text-right">{t("dialog.payments")}</TableHead>
                  <TableHead className="text-right">{t("dialog.refunds")}</TableHead>
                  <TableHead className="text-right">{t("dialog.expenses")}</TableHead>
                  <TableHead className="text-right">{t("dialog.net")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {day.methods.map((m) => (
                  <TableRow key={m.methodId ?? "none"} data-testid="close-method">
                    <TableCell className="font-medium">
                      {m.name ?? t("noMethod")}
                      {m.isCash && (
                        <span className="ml-1 text-xs text-muted-foreground">({t("cash")})</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right tabular-nums">{money(m.payments)}</TableCell>
                    <TableCell className="text-right tabular-nums">{money(m.refunds)}</TableCell>
                    <TableCell className="text-right tabular-nums">
                      {m.income > 0
                        ? `${money(m.expenses)} / +${money(m.income)}`
                        : money(m.expenses)}
                    </TableCell>
                    <TableCell className="text-right font-medium tabular-nums">
                      {money(m.net)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <div className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3 text-sm">
              <span className="text-muted-foreground">
                {t("paymentsCount", { count: day.paymentsCount })} · {money(day.received)}
              </span>
              <span>
                {t("dialog.expectedCash")}:{" "}
                <strong className="tabular-nums" data-testid="close-expected">
                  {money(day.expectedCash)}
                </strong>
              </span>
            </div>
          </>
        ) : null}
      </div>
      {day && !day.hasCashMethod && <Alert>{t("dialog.noCashMethod")}</Alert>}
      {day?.existing && !accepted && <Alert>{t("dialog.reclose")}</Alert>}
      {accepted && <Alert variant="destructive">{t("errors.cashCloseAccepted")}</Alert>}

      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="close-counted">{t("dialog.countedCash")}</Label>
          <Input
            id="close-counted"
            type="number"
            min={0}
            step={1000}
            inputMode="numeric"
            aria-invalid={!!errors.countedCash}
            data-testid="close-counted"
            {...form.register("countedCash")}
          />
          <FieldError id="close-counted-error" message={errors.countedCash?.message} />
        </div>
        <div className="space-y-2">
          <Label>{t("dialog.difference")}</Label>
          <div
            className={`flex h-9 items-center text-lg font-semibold tabular-nums ${
              difference !== null && difference < 0 ? "text-destructive" : ""
            }`}
            data-testid="close-difference"
          >
            {difference === null ? "—" : signed(difference)}
          </div>
        </div>
      </div>
      <div className="space-y-2">
        <Label htmlFor="close-note">{t("dialog.note")}</Label>
        <Textarea
          id="close-note"
          rows={2}
          placeholder={t("dialog.notePlaceholder")}
          aria-invalid={!!errors.note}
          {...form.register("note")}
        />
        <FieldError id="close-note-error" message={errors.note?.message} />
      </div>
    </FormDialog>
  );
}
