"use client";

import { useTranslations } from "next-intl";
import { useEffect } from "react";

import { Badge } from "@/components/ui/badge";
import { useDateFormat } from "@/lib/use-date-format";
import type { PortalAnnouncementDto } from "@/server/services/announcements/announcements.service";

/** The centre's notices on the student's page (A-129); opening the tab counts as reading them. */
export function PortalAnnouncementsTab({
  token,
  items,
}: {
  token: string;
  items: PortalAnnouncementDto[];
}) {
  const t = useTranslations("portal.announcements");
  const fmt = useDateFormat();
  const unread = items.filter((a) => !a.read).map((a) => a.id);

  useEffect(() => {
    if (unread.length === 0) return;
    void fetch(`/api/v1/public/class/${encodeURIComponent(token)}/announcements`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ ids: unread }),
    }).catch(() => undefined);
    // Runs once per page load: the list is server-rendered.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{t("empty")}</p>;
  }
  return (
    <ul className="space-y-3" data-testid="portal-announcements">
      {items.map((a) => (
        <li
          key={a.id}
          className="space-y-1 rounded-lg border p-3"
          data-testid="portal-announcement"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h3 className="font-medium">{a.title}</h3>
            <span className="flex items-center gap-2 text-xs text-muted-foreground">
              {!a.read && <Badge>{t("new")}</Badge>}
              {fmt(new Date(a.createdAt), { dateStyle: "medium" })}
            </span>
          </div>
          <p className="text-sm whitespace-pre-wrap">{a.body}</p>
          <p className="text-xs text-muted-foreground">{t("from", { from: a.from })}</p>
        </li>
      ))}
    </ul>
  );
}
