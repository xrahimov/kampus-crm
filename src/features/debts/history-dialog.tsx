"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { api } from "@/lib/api-client";
import { parseDateOnly } from "@/lib/dates";
import { useDateFormat } from "@/lib/use-date-format";
import { useMoneyFormat } from "@/lib/use-money-format";
import type { DebtCaseDto, DebtContactDto } from "@/server/services/debts/debts.service";

/** "History" on a debtor row: every staff contact and automatic message, newest first. */
export function HistoryDialog({
  item,
  onOpenChange,
}: {
  item: DebtCaseDto | null;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("debts");
  const fmt = useDateFormat();
  const money = useMoneyFormat();
  const [rows, setRows] = useState<DebtContactDto[] | null>(null);
  const id = item?.id ?? null;

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    api<DebtContactDto[]>(`/debts/${id}/contacts`)
      .then((r) => {
        if (!cancelled) setRows(r);
      })
      .catch(() => {
        if (!cancelled) setRows([]);
      });
    return () => {
      cancelled = true;
    };
  }, [id]);

  return (
    <Dialog
      open={!!item}
      onOpenChange={(open) => {
        if (!open) setRows(null);
        onOpenChange(open);
      }}
    >
      <DialogContent data-testid="debt-history-dialog">
        <DialogHeader>
          <DialogTitle>{t("history.title", { name: item?.studentName ?? "" })}</DialogTitle>
          {item && (
            <DialogDescription>
              {money(item.amount)} · {t("days", { count: item.daysOverdue })}
              {item.brokenPromises > 0 &&
                ` · ${t("brokenPromises", { count: item.brokenPromises })}`}
            </DialogDescription>
          )}
        </DialogHeader>
        {rows === null ? (
          <p className="text-sm text-muted-foreground">{t("history.loading")}</p>
        ) : rows.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("history.empty")}</p>
        ) : (
          <ul className="max-h-96 divide-y overflow-y-auto text-sm">
            {rows.map((c) => (
              <li key={c.id} className="space-y-1 py-2" data-testid="debt-contact">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant={c.auto ? "outline" : "secondary"}>
                    {t(`channels.${c.channel}`)}
                  </Badge>
                  {c.outcome && (
                    <span
                      className={
                        c.outcome === "PROMISE_BROKEN" || c.outcome === "REFUSED"
                          ? "text-destructive"
                          : ""
                      }
                    >
                      {t(`outcomes.${c.outcome}`)}
                    </span>
                  )}
                  {c.promisedAt && (
                    <span className="text-muted-foreground">
                      {t("history.promise", {
                        date: fmt(parseDateOnly(c.promisedAt), { dateStyle: "medium" }),
                      })}
                      {c.promisedAmount ? `, ${money(c.promisedAmount)}` : ""}
                    </span>
                  )}
                </div>
                {c.note && <p className="whitespace-pre-wrap">{c.note}</p>}
                <p className="text-xs text-muted-foreground">
                  {fmt(new Date(c.createdAt), { dateStyle: "medium", timeStyle: "short" })}
                  {" · "}
                  {c.auto ? t("auto") : c.createdBy ? t("by", { name: c.createdBy }) : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
