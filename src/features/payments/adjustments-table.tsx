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
import type { AdjustmentDto } from "@/server/services/students/adjustments.service";

/** Opening balances and corrections under the payment history (A-109). */
export function AdjustmentsTable({
  adjustments,
  canRemove,
  onChanged,
}: {
  adjustments: AdjustmentDto[];
  canRemove: boolean;
  onChanged: () => void;
}) {
  const t = useTranslations("payments.adjustments");
  const money = useMoneyFormat();
  const fmt = useDateFormat();
  const [removing, setRemoving] = useState<AdjustmentDto | null>(null);
  if (adjustments.length === 0) return null;
  return (
    <div className="space-y-2" data-testid="adjustments">
      <h3 className="text-sm font-medium">{t("title")}</h3>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("date")}</TableHead>
              <TableHead>{t("group")}</TableHead>
              <TableHead>{t("kind")}</TableHead>
              <TableHead className="text-right">{t("amount")}</TableHead>
              <TableHead>{t("comment")}</TableHead>
              <TableHead>{t("by")}</TableHead>
              {canRemove && <TableHead className="w-12" />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {adjustments.map((a) => (
              <TableRow key={a.id} data-testid="adjustment-row">
                <TableCell className="tabular-nums">
                  {fmt(parseDateOnly(a.date), { dateStyle: "medium" })}
                </TableCell>
                <TableCell>{a.groupName}</TableCell>
                <TableCell>{t(`kinds.${a.kind}`)}</TableCell>
                <TableCell
                  className={cn(
                    "text-right font-medium tabular-nums",
                    a.amount < 0 ? "text-destructive" : "text-success",
                  )}
                >
                  {a.amount > 0 ? "+" : ""}
                  {money(a.amount)}
                </TableCell>
                <TableCell className="max-w-56 truncate text-muted-foreground">
                  {a.comment ?? "—"}
                </TableCell>
                <TableCell className="text-muted-foreground">{a.createdByName ?? "—"}</TableCell>
                {canRemove && (
                  <TableCell>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={t("remove")}
                      title={t("remove")}
                      onClick={() => setRemoving(a)}
                      data-testid="remove-adjustment"
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
          await api(`/adjustments/${removing.id}`, { method: "DELETE" });
          setRemoving(null);
          onChanged();
        }}
      />
    </div>
  );
}
