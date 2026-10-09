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
import { useDateFormat } from "@/lib/use-date-format";
import type {
  AbsenceCaseDto,
  AbsenceContactDto,
} from "@/server/services/absences/absences.service";

/** "History" on an absence row: every contact staff recorded, newest first. */
export function HistoryDialog({
  item,
  onOpenChange,
}: {
  item: AbsenceCaseDto | null;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("absences");
  const fmt = useDateFormat();
  const [rows, setRows] = useState<AbsenceContactDto[] | null>(null);
  const id = item?.id ?? null;

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    api<AbsenceContactDto[]>(`/absences/${id}/contacts`)
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
      <DialogContent data-testid="absence-history-dialog">
        <DialogHeader>
          <DialogTitle>{t("history.title", { name: item?.studentName ?? "" })}</DialogTitle>
          {item && (
            <DialogDescription>
              {item.groupName} · {t(`reason.${item.reason}`, { count: item.missed })} ·{" "}
              {t("days", { count: item.days })}
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
              <li key={c.id} className="space-y-1 py-2" data-testid="absence-contact">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{t(`channels.${c.channel}`)}</Badge>
                  {c.outcome && (
                    <span className={c.outcome === "LEAVING" ? "text-destructive" : ""}>
                      {t(`outcomes.${c.outcome}`)}
                    </span>
                  )}
                </div>
                {c.note && <p className="whitespace-pre-wrap">{c.note}</p>}
                <p className="text-xs text-muted-foreground">
                  {fmt(new Date(c.createdAt), { dateStyle: "medium", timeStyle: "short" })}
                  {c.createdBy ? ` · ${t("by", { name: c.createdBy })}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
