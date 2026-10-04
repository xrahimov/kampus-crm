"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import { Controller, useForm, useWatch, type Resolver } from "react-hook-form";
import type { z } from "zod";

import { FieldError } from "@/components/data/field-error";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { SegmentedGroup, SegmentedItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormDialog } from "@/features/settings/shared/form-dialog";
import { api } from "@/lib/api-client";
import { applyApiError } from "@/lib/api-errors";
import {
  CATEGORY_ENTRY_TYPES,
  STAFF_ENTRY_TYPES,
  financeEntrySchema,
  type FinanceEntryInput,
  type FinanceEntryType,
} from "@/lib/validation/finance";
import type { FinanceEntryDto, FinanceOptions } from "@/server/services/finance/entries.service";

type Input = z.input<typeof financeEntrySchema>;
type Student = { id: string; fullName: string; phone: string | null; branchId: string };

const NONE = "__none";
const today = () => new Date().toISOString().slice(0, 10);

/**
 * One dialog for every EXP §9 money row: "Avans berish", "Marketing yaratish",
 * "Chiqim/Kirim kiritish" (with the XODIM / TALABA toggle), "Bonus berish",
 * "Jarima berish", "Investitsiya yaratish".
 */
export function EntryDialog({
  open,
  onOpenChange,
  type,
  categoryId,
  entry,
  options,
  defaultBranchId,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  type: FinanceEntryType;
  categoryId: string | null;
  entry: FinanceEntryDto | null;
  options: FinanceOptions;
  defaultBranchId: string;
  onSaved: () => void;
}) {
  const t = useTranslations();
  const tf = useTranslations("finance.form");
  const [error, setError] = useState<string | null>(null);
  const [party, setParty] = useState<"STAFF" | "STUDENT">("STAFF");
  const [query, setQuery] = useState("");
  const [students, setStudents] = useState<Student[]>([]);
  const [picked, setPicked] = useState<Student | null>(null);

  const staffOnly = STAFF_ENTRY_TYPES.includes(type);
  const inCategory = CATEGORY_ENTRY_TYPES.includes(type);

  const empty = (): Input => ({
    type,
    branchId: defaultBranchId,
    categoryId: categoryId ?? "",
    paymentMethodId: options.paymentMethods[0]?.id ?? "",
    amount: "",
    date: today(),
    comment: "",
    staffId: "",
    studentId: "",
    counterparty: "",
  });

  const form = useForm<Input, unknown, FinanceEntryInput>({
    resolver: zodResolver(financeEntrySchema) as unknown as Resolver<
      Input,
      unknown,
      FinanceEntryInput
    >,
    defaultValues: empty(),
  });

  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setError(null);
      setParty(entry?.studentId ? "STUDENT" : "STAFF");
      setQuery("");
      setStudents([]);
      setPicked(
        entry?.studentId
          ? {
              id: entry.studentId,
              fullName: entry.studentName ?? "",
              phone: null,
              branchId: entry.branchId,
            }
          : null,
      );
    }
  }

  useEffect(() => {
    if (!open) return;
    form.reset(
      entry
        ? {
            type: entry.type,
            branchId: entry.branchId,
            categoryId: entry.categoryId ?? "",
            paymentMethodId: entry.paymentMethodId ?? "",
            amount: entry.amount,
            date: entry.date,
            comment: entry.comment ?? "",
            staffId: entry.staffId ?? "",
            studentId: entry.studentId ?? "",
            counterparty: entry.counterparty ?? "",
          }
        : empty(),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, entry]);

  useEffect(() => {
    if (query.trim().length < 2) return;
    const handle = setTimeout(() => {
      api<Student[]>(`/finance/students?q=${encodeURIComponent(query)}`)
        .then(setStudents)
        .catch(() => setStudents([]));
    }, 250);
    return () => clearTimeout(handle);
  }, [query]);

  const branchId = useWatch({ control: form.control, name: "branchId" });

  async function onSubmit(values: FinanceEntryInput) {
    setError(null);
    const body = {
      ...values,
      staffId: party === "STAFF" || staffOnly ? values.staffId : null,
      studentId: party === "STUDENT" && !staffOnly ? values.studentId : null,
    };
    try {
      if (entry) await api(`/finance/entries/${entry.id}`, { method: "PATCH", body });
      else await api("/finance/entries", { method: "POST", body });
      onOpenChange(false);
      onSaved();
    } catch (e) {
      setError(applyApiError(e, form.setError));
    }
  }

  const { errors, isSubmitting } = form.formState;
  const msg = (key: keyof Input) => errors[key]?.message as string | undefined;

  const select = (
    name: "paymentMethodId" | "staffId" | "branchId",
    label: string,
    items: Array<{ id: string; name: string }>,
    noneLabel?: string,
  ) => (
    <div className="space-y-2">
      <Label htmlFor={`entry-${name}`}>{label}</Label>
      <Controller
        control={form.control}
        name={name}
        render={({ field }) => (
          <Select
            value={field.value ? String(field.value) : NONE}
            onValueChange={(v) => field.onChange(v === NONE ? "" : v)}
          >
            <SelectTrigger id={`entry-${name}`} aria-invalid={!!errors[name]}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {noneLabel && <SelectItem value={NONE}>{noneLabel}</SelectItem>}
              {items.map((i) => (
                <SelectItem key={i.id} value={i.id}>
                  {i.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      />
      <FieldError id={`entry-${name}-error`} message={msg(name)} />
    </div>
  );

  const titleKey = entry ? "editTitle" : (`titles.${type}` as const);

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title={t(`finance.${titleKey}`)}
      onSubmit={form.handleSubmit(onSubmit)}
      submitting={isSubmitting}
      error={error}
      testId="entry-dialog"
    >
      {options.branches.length > 1 && select("branchId", tf("branch"), options.branches)}

      {type !== "INVESTMENT" &&
        select("paymentMethodId", tf("method"), options.paymentMethods, "----")}

      {inCategory && !categoryId && (
        <div className="space-y-2">
          <Label htmlFor="entry-categoryId">{tf("category")}</Label>
          <Controller
            control={form.control}
            name="categoryId"
            render={({ field }) => (
              <Select
                value={field.value ? String(field.value) : NONE}
                onValueChange={(v) => field.onChange(v === NONE ? "" : v)}
              >
                <SelectTrigger id="entry-categoryId" aria-invalid={!!errors.categoryId}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>----</SelectItem>
                  {options.categories
                    .filter((c) => c.kind === type)
                    .map((c) => (
                      <SelectItem key={c.id} value={c.id}>
                        {c.name}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            )}
          />
          <FieldError id="entry-categoryId-error" message={msg("categoryId")} />
        </div>
      )}

      {inCategory && (
        <SegmentedGroup
          value={party}
          onValueChange={(v) => setParty(v as "STAFF" | "STUDENT")}
          aria-label={tf("party")}
          data-testid="entry-party"
        >
          <SegmentedItem value="STAFF" id="entry-party-staff">
            {tf("staff")}
          </SegmentedItem>
          <SegmentedItem value="STUDENT" id="entry-party-student">
            {tf("student")}
          </SegmentedItem>
        </SegmentedGroup>
      )}

      {(staffOnly || (inCategory && party === "STAFF")) &&
        select(
          "staffId",
          tf("staff"),
          options.staff.map((s) => ({ id: s.id, name: s.fullName })),
          staffOnly ? undefined : "----",
        )}

      {inCategory && party === "STUDENT" && (
        <div className="space-y-2">
          <Label htmlFor="entry-student">{tf("student")}</Label>
          {picked ? (
            <div className="flex items-center justify-between rounded-md border px-3 py-2 text-sm">
              <span>{picked.fullName}</span>
              <button
                type="button"
                className="text-muted-foreground hover:underline"
                onClick={() => {
                  setPicked(null);
                  form.setValue("studentId", "");
                }}
              >
                {t("common.remove")}
              </button>
            </div>
          ) : (
            <>
              <Input
                id="entry-student"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={tf("studentSearch")}
              />
              {query.trim().length >= 2 && (
                <ul className="divide-y rounded-md border">
                  {students
                    .filter((s) => !branchId || s.branchId === branchId)
                    .map((s) => (
                      <li key={s.id}>
                        <button
                          type="button"
                          className="flex w-full justify-between px-3 py-2 text-left text-sm hover:bg-muted"
                          onClick={() => {
                            setPicked(s);
                            form.setValue("studentId", s.id, { shouldValidate: true });
                            setQuery("");
                          }}
                        >
                          <span>{s.fullName}</span>
                          <span className="text-muted-foreground">{s.phone}</span>
                        </button>
                      </li>
                    ))}
                </ul>
              )}
            </>
          )}
          <FieldError id="entry-student-error" message={msg("studentId")} />
        </div>
      )}

      {type === "INVESTMENT" && (
        <div className="space-y-2">
          <Label htmlFor="entry-counterparty">{tf("counterparty")}</Label>
          <Input
            id="entry-counterparty"
            aria-invalid={!!errors.counterparty}
            {...form.register("counterparty")}
          />
          <FieldError id="entry-counterparty-error" message={msg("counterparty")} />
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="entry-amount">{tf("amount")}</Label>
          <Input
            id="entry-amount"
            type="number"
            min={0}
            step="any"
            aria-invalid={!!errors.amount}
            {...form.register("amount")}
          />
          <FieldError id="entry-amount-error" message={msg("amount")} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="entry-date">{tf("date")}</Label>
          <Input
            id="entry-date"
            type="date"
            aria-invalid={!!errors.date}
            {...form.register("date")}
          />
          <FieldError id="entry-date-error" message={msg("date")} />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="entry-comment">{tf("comment")}</Label>
        <Textarea id="entry-comment" rows={2} {...form.register("comment")} />
        <FieldError id="entry-comment-error" message={msg("comment")} />
      </div>
    </FormDialog>
  );
}
