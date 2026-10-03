"use client";

import { ChevronLeft, MoreHorizontal, Plus } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import { ConfirmDialog } from "@/components/data/confirm-dialog";
import { EmptyState } from "@/components/data/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api-client";
import type { SourceStatsFilters } from "@/lib/validation/leads";
import type { LeadSourceDto } from "@/server/services/leads/sources.service";

import { SourceDialog } from "./source-dialog";

/** EXP §3 "/lids/stats" ("Manbalar hisoboti"): a card per source with the lead count. */
export function SourcesPage({
  sources,
  filters,
  can,
}: {
  sources: LeadSourceDto[];
  filters: SourceStatsFilters;
  can: { update: boolean; delete: boolean };
}) {
  const t = useTranslations();
  const ts = useTranslations("leads.sourcesPage");
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [dialog, setDialog] = useState<{ open: boolean; source: LeadSourceDto | null }>({
    open: false,
    source: null,
  });
  const [deleting, setDeleting] = useState<LeadSourceDto | null>(null);
  const refresh = () => startTransition(() => router.refresh());

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value) params.set(key, value);
    else params.delete(key);
    router.replace(`${pathname}?${params.toString()}`);
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Link
            href="/leads"
            className="mb-1 inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
          >
            <ChevronLeft className="size-4" /> {t("leads.title")}
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">{ts("title")}</h1>
          <p className="text-sm text-muted-foreground">{ts("description")}</p>
        </div>
        {can.update && (
          <Button onClick={() => setDialog({ open: true, source: null })} data-testid="add-button">
            <Plus /> {ts("add")}
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="space-y-1">
          <Label htmlFor="sources-from" className="text-xs text-muted-foreground">
            {ts("from")}
          </Label>
          <Input
            id="sources-from"
            type="date"
            className="h-8"
            value={filters.from ?? ""}
            onChange={(e) => setParam("from", e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="sources-to" className="text-xs text-muted-foreground">
            {ts("to")}
          </Label>
          <Input
            id="sources-to"
            type="date"
            className="h-8"
            value={filters.to ?? ""}
            onChange={(e) => setParam("to", e.target.value)}
          />
        </div>
      </div>

      {sources.length === 0 ? (
        <Card>
          <EmptyState title={t("common.nothingFound")} />
        </Card>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {sources.map((s) => (
            <Card key={s.id} data-testid="source-card" className={s.isActive ? "" : "opacity-60"}>
              <CardContent className="flex items-start gap-2 p-4">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium">{s.name}</p>
                  <p
                    className="mt-1 text-3xl font-semibold tabular-nums"
                    data-testid="source-count"
                  >
                    {s.leadCount}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {ts("leads")} · {ts("students", { count: s.studentCount })}
                  </p>
                  {!s.isActive && (
                    <Badge variant="muted" className="mt-2">
                      {t("common.inactive")}
                    </Badge>
                  )}
                </div>
                {(can.update || can.delete) && (
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={t("common.actionsFor", { name: s.name })}
                      >
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      {can.update && (
                        <DropdownMenuItem onSelect={() => setDialog({ open: true, source: s })}>
                          {t("common.edit")}
                        </DropdownMenuItem>
                      )}
                      {can.delete && (
                        <DropdownMenuItem
                          onSelect={() => setDeleting(s)}
                          className="text-destructive focus:text-destructive"
                        >
                          {t("common.delete")}
                        </DropdownMenuItem>
                      )}
                    </DropdownMenuContent>
                  </DropdownMenu>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <SourceDialog
        open={dialog.open}
        onOpenChange={(open) => setDialog((d) => ({ ...d, open }))}
        source={dialog.source}
        onSaved={refresh}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={ts("deleteTitle")}
        description={ts("deleteText", { name: deleting?.name ?? "" })}
        onConfirm={async () => {
          if (!deleting) return;
          await api(`/lead-sources/${deleting.id}`, { method: "DELETE" });
          refresh();
        }}
      />
    </div>
  );
}
