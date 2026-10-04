"use client";

import { ArrowLeft, MoreHorizontal, Pencil, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import { ConfirmDialog } from "@/components/data/confirm-dialog";
import { EmptyState } from "@/components/data/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api-client";
import { parseDateOnly } from "@/lib/dates";
import { useDateFormat } from "@/lib/use-date-format";
import { useMoneyFormat } from "@/lib/use-money-format";
import {
  CATEGORY_ENTRY_TYPES,
  STAFF_ENTRY_TYPES,
  type FinanceEntryType,
} from "@/lib/validation/finance";
import type {
  FinanceEntryDto,
  FinanceEntryListDto,
  FinanceOptions,
} from "@/server/services/finance/entries.service";

import { EntryDialog } from "./entry-dialog";

const ALL = "ALL";

/** EXP §9 sub-pages: /finance/advance, /marketing, /bonus, /penalty, /investment, /costs/:categoryId. */
export function EntriesPage({
  type,
  category,
  list,
  filters,
  options,
  years,
  defaultBranchId,
  can,
}: {
  type: FinanceEntryType;
  category: { id: string; name: string } | null;
  list: FinanceEntryListDto;
  filters: {
    year: number;
    month: number | null;
    paymentMethodId: string | null;
    staffId: string | null;
  };
  options: FinanceOptions;
  years: number[];
  defaultBranchId: string;
  can: { create: boolean; update: boolean; delete: boolean };
}) {
  const t = useTranslations("finance");
  const tc = useTranslations("common");
  const fmt = useDateFormat();
  const money = useMoneyFormat();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [dialog, setDialog] = useState<{ open: boolean; entry: FinanceEntryDto | null }>({
    open: false,
    entry: null,
  });
  const [deleting, setDeleting] = useState<FinanceEntryDto | null>(null);
  const refresh = () => startTransition(() => router.refresh());

  function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== ALL) params.set(key, value);
    else params.delete(key);
    router.replace(`${pathname}?${params.toString()}`);
  }

  const staffOnly = STAFF_ENTRY_TYPES.includes(type);
  const inCategory = CATEGORY_ENTRY_TYPES.includes(type);
  const showMethod = type !== "INVESTMENT";
  const monthNames = Array.from({ length: 12 }, (_, i) =>
    fmt(parseDateOnly(`2026-${String(i + 1).padStart(2, "0")}-01`), {
      month: "short",
      year: "numeric",
    }).replace(/[\s,]*2026[\s,]*/g, ""),
  );
  const title = category
    ? category.name
    : t(`sections.${type === "EXPENSE" ? "expense" : type.toLowerCase()}`);

  return (
    <div className="space-y-4">
      <Link
        href="/finance"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground"
      >
        <ArrowLeft className="size-4" /> {t("title")}
      </Link>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <h1 className="flex items-center gap-3 text-2xl font-semibold tracking-tight">
          {title}
          <Badge variant="secondary" data-testid="entries-total">
            {money(list.total)}
          </Badge>
        </h1>
        {can.create && (
          <Button onClick={() => setDialog({ open: true, entry: null })} data-testid="add-button">
            {t(`add.${type}`)}
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <Select value={String(filters.year)} onValueChange={(v) => setParam("year", v)}>
          <SelectTrigger className="w-28" aria-label={t("filters.year")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {years.map((y) => (
              <SelectItem key={y} value={String(y)}>
                {y}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={filters.month ? String(filters.month) : ALL}
          onValueChange={(v) => setParam("month", v)}
        >
          <SelectTrigger className="w-36" aria-label={t("filters.month")}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL}>{t("filters.wholeYear")}</SelectItem>
            {monthNames.map((name, i) => (
              <SelectItem key={name} value={String(i + 1)}>
                {name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {showMethod && (
          <Select
            value={filters.paymentMethodId ?? ALL}
            onValueChange={(v) => setParam("paymentMethodId", v)}
          >
            <SelectTrigger className="w-36" aria-label={t("filters.method")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("filters.anyMethod")}</SelectItem>
              {options.paymentMethods.map((m) => (
                <SelectItem key={m.id} value={m.id}>
                  {m.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        {(staffOnly || inCategory) && (
          <Select value={filters.staffId ?? ALL} onValueChange={(v) => setParam("staffId", v)}>
            <SelectTrigger className="w-44" aria-label={t("form.staff")}>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("filters.anyStaff")}</SelectItem>
              {options.staff.map((s) => (
                <SelectItem key={s.id} value={s.id}>
                  {s.fullName}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
      </div>

      <Card>
        {list.items.length === 0 ? (
          <EmptyState title={tc("nothingFound")} />
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-8">#</TableHead>
                  {(staffOnly || inCategory) && <TableHead>{t("columns.counterparty")}</TableHead>}
                  {type === "INVESTMENT" && <TableHead>{t("form.counterparty")}</TableHead>}
                  {showMethod && <TableHead>{t("columns.method")}</TableHead>}
                  <TableHead className="text-right">{t("columns.amount")}</TableHead>
                  <TableHead>{t("columns.date")}</TableHead>
                  <TableHead>{t("columns.comment")}</TableHead>
                  {inCategory && <TableHead>{t("columns.createdBy")}</TableHead>}
                  <TableHead className="w-12" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {list.items.map((e, i) => (
                  <TableRow key={e.id} data-testid="entry-row">
                    <TableCell className="text-muted-foreground">{i + 1}</TableCell>
                    {(staffOnly || inCategory) && (
                      <TableCell>{e.staffName ?? e.studentName ?? "—"}</TableCell>
                    )}
                    {type === "INVESTMENT" && <TableCell>{e.counterparty ?? "—"}</TableCell>}
                    {showMethod && <TableCell>{e.paymentMethodName ?? "—"}</TableCell>}
                    <TableCell className="text-right font-medium tabular-nums">
                      {money(e.amount)}
                    </TableCell>
                    <TableCell className="whitespace-nowrap">
                      {fmt(parseDateOnly(e.date), { dateStyle: "medium" })}
                    </TableCell>
                    <TableCell className="max-w-xs truncate">{e.comment ?? "—"}</TableCell>
                    {inCategory && <TableCell>{e.createdByName ?? "—"}</TableCell>}
                    <TableCell>
                      {(can.update || can.delete) && (
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button
                              variant="ghost"
                              size="icon"
                              aria-label={tc("actionsFor", { name: money(e.amount) })}
                            >
                              <MoreHorizontal />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            {can.update && (
                              <DropdownMenuItem
                                onSelect={() => setDialog({ open: true, entry: e })}
                              >
                                <Pencil /> {tc("edit")}
                              </DropdownMenuItem>
                            )}
                            {can.delete && (
                              <DropdownMenuItem
                                onSelect={() => setDeleting(e)}
                                className="text-destructive focus:text-destructive"
                              >
                                <Trash2 /> {tc("delete")}
                              </DropdownMenuItem>
                            )}
                          </DropdownMenuContent>
                        </DropdownMenu>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </Card>

      <EntryDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        type={type}
        categoryId={category?.id ?? null}
        entry={dialog.entry}
        options={options}
        defaultBranchId={defaultBranchId}
        onSaved={refresh}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t("deleteTitle")}
        description={t("deleteText", { amount: deleting ? money(deleting.amount) : "" })}
        confirmLabel={tc("delete")}
        onConfirm={async () => {
          if (!deleting) return;
          await api(`/finance/entries/${deleting.id}`, { method: "DELETE" });
          setDeleting(null);
          refresh();
        }}
      />
    </div>
  );
}
