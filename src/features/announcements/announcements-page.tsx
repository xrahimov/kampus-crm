"use client";

import { Megaphone, MessageSquare, Send, Trash2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useState, useTransition } from "react";

import { ConfirmDialog } from "@/components/data/confirm-dialog";
import { EmptyState } from "@/components/data/empty-state";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { BranchOption } from "@/features/settings/shared/branch-select";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api-client";
import { useDateFormat } from "@/lib/use-date-format";
import { ANNOUNCEMENT_AUDIENCES, type AnnouncementFilters } from "@/lib/validation/announcements";
import type { Page } from "@/lib/validation/common";
import type { AnnouncementDto } from "@/server/services/announcements/announcements.service";

import { AnnouncementDialog, type GroupOption } from "./announcement-dialog";

const ALL = "__all";

/** Announcements (A-129): what was posted, to whom, and how many opened it. */
export function AnnouncementsPage({
  list,
  filters,
  branches,
  groups,
  canCreate,
  canCentre,
}: {
  list: Page<AnnouncementDto>;
  filters: AnnouncementFilters;
  branches: BranchOption[];
  groups: GroupOption[];
  canCreate: boolean;
  canCentre: boolean;
}) {
  const t = useTranslations("announcements");
  const tc = useTranslations("common");
  const fmt = useDateFormat();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const [creating, setCreating] = useState(false);
  const [deleting, setDeleting] = useState<AnnouncementDto | null>(null);
  const refresh = () => startTransition(() => router.refresh());

  function setParam(key: string, value: string | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (value && value !== ALL) params.set(key, value);
    else params.delete(key);
    params.delete("page");
    router.replace(`${pathname}?${params.toString()}`);
  }
  const pageHref = (page: number) => {
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(page));
    return `${pathname}?${params.toString()}`;
  };
  const pages = Math.max(1, Math.ceil(list.total / list.pageSize));
  const target = (a: AnnouncementDto) => a.groupName ?? a.branchName ?? t("audience.CENTRE");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground" data-testid="announcements-count">
            {t("count", { count: list.total })}
          </p>
        </div>
        {canCreate && (
          <Button onClick={() => setCreating(true)} data-testid="announcements-new">
            <Megaphone /> {t("new")}
          </Button>
        )}
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <div className="min-w-44 space-y-1">
          <Label className="text-xs text-muted-foreground">{t("filters.audience")}</Label>
          <Select value={filters.audience ?? ALL} onValueChange={(v) => setParam("audience", v)}>
            <SelectTrigger data-testid="filter-audience">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={ALL}>{t("filters.any")}</SelectItem>
              {ANNOUNCEMENT_AUDIENCES.map((a) => (
                <SelectItem key={a} value={a}>
                  {t(`audience.${a}`)}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {list.items.length === 0 ? (
        <Card>
          <EmptyState title={t("empty")} hint={t("emptyHint")} />
        </Card>
      ) : (
        <div className="space-y-3">
          {list.items.map((a) => (
            <Card key={a.id} data-testid="announcement-row">
              <CardContent className="space-y-2 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant={a.audience === "CENTRE" ? "default" : "secondary"}>
                      {t(`audience.${a.audience}`)}
                    </Badge>
                    <span className="text-sm font-medium" data-testid="announcement-target">
                      {target(a)}
                    </span>
                  </div>
                  <div className="flex items-center gap-2 text-xs text-muted-foreground">
                    <span>
                      {fmt(new Date(a.createdAt), { dateStyle: "medium", timeStyle: "short" })}
                    </span>
                    {a.createdByName && <span>· {a.createdByName}</span>}
                    {canCreate && (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={t("delete")}
                        onClick={() => setDeleting(a)}
                        data-testid="announcement-delete"
                      >
                        <Trash2 />
                      </Button>
                    )}
                  </div>
                </div>
                <h2 className="text-base font-semibold" data-testid="announcement-title">
                  {a.title}
                </h2>
                <p className="text-sm whitespace-pre-wrap">{a.body}</p>
                <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                  <span data-testid="announcement-reads">
                    {t("stats.reads", { reads: a.reads, total: a.recipients })}
                  </span>
                  <span className="inline-flex items-center gap-1">
                    <Send className="size-3" /> {t("stats.telegram", { count: a.telegramQueued })}
                  </span>
                  {a.sendSms && (
                    <span className="inline-flex items-center gap-1">
                      <MessageSquare className="size-3" /> {t("stats.sms", { count: a.smsQueued })}
                    </span>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
          {pages > 1 && (
            <div className="flex items-center justify-end gap-2 text-sm">
              {list.page > 1 && (
                <Button asChild variant="outline" size="sm">
                  <Link href={pageHref(list.page - 1)}>{tc("pagination.previous")}</Link>
                </Button>
              )}
              <span className="text-muted-foreground">
                {list.page} / {pages}
              </span>
              {list.page < pages && (
                <Button asChild variant="outline" size="sm">
                  <Link href={pageHref(list.page + 1)}>{tc("pagination.next")}</Link>
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      <AnnouncementDialog
        open={creating}
        onOpenChange={setCreating}
        branches={branches}
        groups={groups}
        canCentre={canCentre}
        onSaved={refresh}
      />
      <ConfirmDialog
        open={!!deleting}
        onOpenChange={(open) => !open && setDeleting(null)}
        title={t("deleteTitle")}
        description={t("deleteDescription")}
        confirmLabel={t("delete")}
        onConfirm={async () => {
          if (!deleting) return;
          await api(`/announcements/${deleting.id}`, { method: "DELETE" });
          setDeleting(null);
          refresh();
        }}
      />
    </div>
  );
}
