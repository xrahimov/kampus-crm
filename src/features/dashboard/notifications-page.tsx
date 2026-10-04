"use client";

import { CheckCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useTransition } from "react";

import { EmptyState } from "@/components/data/empty-state";
import { Pagination } from "@/components/data/pagination";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Link, usePathname, useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api-client";
import { useDateFormat } from "@/lib/use-date-format";
import { useMoneyFormat } from "@/lib/use-money-format";
import type { Page } from "@/lib/validation/common";
import type { NotificationDto } from "@/server/services/dashboard/notifications.service";

import { notificationParams } from "./notification-text";

/** "Barcha xabarnomalarni ko'rish" (EXP §11): the full list with an unread filter. */
export function NotificationsPage({
  page,
  unreadOnly,
}: {
  page: Page<NotificationDto> & { unread: number };
  unreadOnly: boolean;
}) {
  const t = useTranslations("notifications");
  const fmt = useDateFormat();
  const money = useMoneyFormat();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [, startTransition] = useTransition();
  const refresh = () => startTransition(() => router.refresh());

  function setUnread(on: boolean) {
    const params = new URLSearchParams(searchParams.toString());
    if (on) params.set("unread", "1");
    else params.delete("unread");
    params.delete("page");
    router.replace(`${pathname}?${params.toString()}`);
  }

  async function markAll() {
    await api("/notifications/read", { method: "POST", body: { all: true } });
    refresh();
  }

  async function markOne(id: string) {
    await api("/notifications/read", { method: "POST", body: { ids: [id] } });
    refresh();
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("unreadCount", { count: page.unread })}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <Switch checked={unreadOnly} onCheckedChange={setUnread} data-testid="unread-only" />
            {t("unreadOnly")}
          </label>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void markAll()}
            disabled={page.unread === 0}
            data-testid="mark-all-read-page"
          >
            <CheckCheck /> {t("markAllRead")}
          </Button>
        </div>
      </div>
      {page.items.length === 0 ? (
        <EmptyState title={t("empty")} />
      ) : (
        <Card>
          <ul className="divide-y">
            {page.items.map((n) => (
              <li
                key={n.id}
                className={`flex items-start justify-between gap-3 px-4 py-3 ${n.readAt ? "" : "bg-accent/30"}`}
                data-testid="notification-row"
              >
                <div className="min-w-0">
                  <p className={`text-sm ${n.readAt ? "text-muted-foreground" : "font-medium"}`}>
                    {n.href ? (
                      <Link
                        href={n.href}
                        className="hover:underline"
                        onClick={() => !n.readAt && void markOne(n.id)}
                      >
                        {t(`kinds.${n.kind}`, notificationParams(n, money))}
                      </Link>
                    ) : (
                      t(`kinds.${n.kind}`, notificationParams(n, money))
                    )}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {fmt(new Date(n.createdAt), { dateStyle: "medium", timeStyle: "short" })}
                  </p>
                </div>
                {!n.readAt && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void markOne(n.id)}
                    data-testid="mark-read"
                  >
                    {t("markRead")}
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}
      <Pagination page={page.page} pageSize={page.pageSize} total={page.total} />
    </div>
  );
}
