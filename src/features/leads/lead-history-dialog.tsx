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
import type { LeadContactDto } from "@/server/services/leads/follow-up.service";
import type { LeadDto } from "@/server/services/leads/leads.service";

/** "History" on a lead (A-126): every contact staff recorded, newest first. */
export function LeadHistoryDialog({
  lead,
  onOpenChange,
}: {
  lead: LeadDto | null;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useTranslations("leads");
  const fmt = useDateFormat();
  const [rows, setRows] = useState<LeadContactDto[] | null>(null);
  const id = lead?.id ?? null;

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    api<LeadContactDto[]>(`/leads/${id}/contacts`)
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
      open={!!lead}
      onOpenChange={(open) => {
        if (!open) setRows(null);
        onOpenChange(open);
      }}
    >
      <DialogContent data-testid="lead-history-dialog">
        <DialogHeader>
          <DialogTitle>{t("history.title", { name: lead?.fullName ?? "" })}</DialogTitle>
          {lead && (
            <DialogDescription>
              {t(`statuses.${lead.status}`)}
              {lead.ownerName ? ` · ${lead.ownerName}` : ""}
              {lead.nextContactAt
                ? ` · ${t("history.next", { date: fmt(parseDateOnly(lead.nextContactAt), { dateStyle: "medium" }) })}`
                : ""}
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
              <li key={c.id} className="space-y-1 py-2" data-testid="lead-contact">
                <div className="flex flex-wrap items-center gap-2">
                  <Badge variant="secondary">{t(`channels.${c.channel}`)}</Badge>
                  {c.outcome && (
                    <span className={c.outcome === "NOT_INTERESTED" ? "text-destructive" : ""}>
                      {t(`outcomes.${c.outcome}`)}
                    </span>
                  )}
                  {c.nextContactAt && (
                    <span className="text-xs text-muted-foreground">
                      {t("history.next", {
                        date: fmt(parseDateOnly(c.nextContactAt), { dateStyle: "medium" }),
                      })}
                    </span>
                  )}
                </div>
                {c.note && <p className="whitespace-pre-wrap">{c.note}</p>}
                <p className="text-xs text-muted-foreground">
                  {fmt(new Date(c.createdAt), { dateStyle: "medium", timeStyle: "short" })}
                  {c.createdBy ? ` · ${t("calls.by", { name: c.createdBy })}` : ""}
                </p>
              </li>
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
