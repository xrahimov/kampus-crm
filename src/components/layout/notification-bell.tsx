"use client";

import { Bell, CheckCheck } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useRef, useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { notificationParams } from "@/features/dashboard/notification-text";
import { Link, useRouter } from "@/i18n/navigation";
import { api } from "@/lib/api-client";
import { useDateFormat } from "@/lib/use-date-format";
import { useMoneyFormat } from "@/lib/use-money-format";
import type { Page } from "@/lib/validation/common";
import type { NotificationDto } from "@/server/services/dashboard/notifications.service";

/** EXP §11 bell: a counter and the "Xabarnomalar" panel with the latest items. */
export function NotificationBell({ initialUnread }: { initialUnread: number }) {
  const t = useTranslations("notifications");
  const fmt = useDateFormat();
  const money = useMoneyFormat();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(initialUnread);
  const [items, setItems] = useState<NotificationDto[] | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  // The server recounts on every navigation or refresh; follow it (state reset in render).
  const [seenInitial, setSeenInitial] = useState(initialUnread);
  if (seenInitial !== initialUnread) {
    setSeenInitial(initialUnread);
    setUnread(initialUnread);
  }

  useEffect(() => {
    if (!open) return;
    api<Page<NotificationDto> & { unread: number }>("/notifications")
      .then((page) => {
        setItems(page.items.slice(0, 8));
        setUnread(page.unread);
      })
      .catch(() => setItems([]));
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open]);

  async function markAll() {
    const r = await api<{ unread: number }>("/notifications/read", {
      method: "POST",
      body: { all: true },
    });
    setUnread(r.unread);
    setItems(
      (rows) => rows?.map((n) => ({ ...n, readAt: n.readAt ?? new Date().toISOString() })) ?? null,
    );
  }

  async function openItem(n: NotificationDto) {
    if (!n.readAt) {
      const r = await api<{ unread: number }>("/notifications/read", {
        method: "POST",
        body: { ids: [n.id] },
      });
      setUnread(r.unread);
    }
    setOpen(false);
    if (n.href) startTransition(() => router.push(n.href!));
  }

  return (
    <div ref={boxRef} className="relative">
      <Button
        variant="ghost"
        size="icon"
        aria-label={t("title")}
        onClick={() => setOpen((v) => !v)}
        data-testid="notification-bell"
        className="relative"
      >
        <Bell />
        {unread > 0 && (
          <span
            className="absolute -top-0.5 -right-0.5 inline-flex min-w-4 items-center justify-center rounded-full bg-destructive px-1 text-[10px] font-semibold text-white"
            data-testid="notification-count"
          >
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </Button>
      {open && (
        <div
          className="absolute top-full right-0 z-50 mt-1 w-80 rounded-md border bg-popover p-2 text-popover-foreground shadow-md"
          data-testid="notification-panel"
        >
          <div className="flex items-center justify-between px-1 pb-2">
            <p className="text-sm font-semibold">{t("title")}</p>
            {unread > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => void markAll()}
                data-testid="mark-all-read"
              >
                <CheckCheck /> {t("markAllRead")}
              </Button>
            )}
          </div>
          {items === null ? (
            <p className="px-1 py-3 text-sm text-muted-foreground">{t("loading")}</p>
          ) : items.length === 0 ? (
            <p className="px-1 py-3 text-sm text-muted-foreground">{t("empty")}</p>
          ) : (
            <ul className="max-h-80 space-y-1 overflow-y-auto">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    type="button"
                    onClick={() => void openItem(n)}
                    className={`w-full rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent/60 ${n.readAt ? "text-muted-foreground" : "bg-accent/40"}`}
                    data-testid="notification-item"
                  >
                    <span className="block">
                      {t(`kinds.${n.kind}`, notificationParams(n, money))}
                    </span>
                    <span className="block text-[11px] text-muted-foreground">
                      {fmt(new Date(n.createdAt), { dateStyle: "medium", timeStyle: "short" })}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          <div className="border-t pt-2 text-center">
            <Link
              href="/notifications"
              className="text-sm text-primary hover:underline"
              onClick={() => setOpen(false)}
              data-testid="all-notifications"
            >
              {t("viewAll")}
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
