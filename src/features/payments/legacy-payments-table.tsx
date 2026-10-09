"use client";

import { Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { ConfirmDialog } from "@/components/data/confirm-dialog";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { api } from "@/lib/api-client";
import { parseDateOnly } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { useDateFormat } from "@/lib/use-date-format";
import { useMoneyFormat } from "@/lib/use-money-format";
import type { LegacyPaymentDto } from "@/server/services/students/history-import.service";

/** Payments made in the previous system, under the payment history (A-142). */
export function LegacyPaymentsTable({
  rows,
  canRemove,
  onChanged,
}: {
  rows: LegacyPaymentDto[];
  canRemove: boolean;
  onChanged: () => void;
}) {
  const t = useTranslations("payments.legacy");
  const money = useMoneyFormat();
  const fmt = useDateFormat();
  const [removing, setRemoving] = useState<LegacyPaymentDto | null>(null);
  if (rows.length === 0) return null;
  const total = rows.reduce((sum, r) => sum + r.amount, 0);
  return (
    <div className="space-y-2" data-testid="legacy-payments">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-medium">{t("title")}</h3>
        <span className="text-sm text-muted-foreground tabular-nums">
          {t("total", { amount: money(total) })}
        </span>
      </div>
      <p className="text-xs text-muted-foreground">{t("hint")}</p>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("date")}</TableHead>
              <TableHead>{t("group")}</TableHead>
              <TableHead className="text-right">{t("amount")}</TableHead>
              <TableHead>{t("method")}</TableHead>
              <TableHead>{t("comment")}</TableHead>
              {canRemove && <TableHead className="w-12" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((r) => (
              <TableRow key={r.id} data-testid="legacy-payment-row">
                <TableCell className="tabular-nums">
                  {fmt(parseDateOnly(r.paidAt), { dateStyle: "medium" })}
                </TableCell>
                <TableCell>{r.groupName ?? "—"}</TableCell>
                <TableCell
                  className={cn(
                    "text-right font-medium tabular-nums",
                    r.amount < 0 && "text-destructive",
                  )}
                >
                  {money(r.amount)}
                </TableCell>
                <TableCell className="text-muted-foreground">{r.method ?? "—"}</TableCell>
                <TableCell className="max-w-56 truncate text-muted-foreground">
                  {r.comment ?? "—"}
                </TableCell>
                {canRemove && (
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t("remove")}
                      title={t("remove")}
                      onClick={() => setRemoving(r)}
                      data-testid="remove-legacy-payment"
                    >
                      <Trash2 />
                    </Button>
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <ConfirmDialog
        open={!!removing}
        onOpenChange={(open) => !open && setRemoving(null)}
        title={t("removeTitle")}
        description={t("removeText")}
        confirmLabel={t("remove")}
        onConfirm={async () => {
          if (!removing) return;
          await api(`/payment-history/${removing.id}`, { method: "DELETE" });
          setRemoving(null);
          onChanged();
        }}
      />
    </div>
  );
}
