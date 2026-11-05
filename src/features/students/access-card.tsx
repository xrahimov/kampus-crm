"use client";

import { KeyRound, LogOut, Unlink } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { ConfirmDialog } from "@/components/data/confirm-dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/lib/api-client";
import { useDateFormat } from "@/lib/use-date-format";
import type { StudentAccessDto } from "@/server/services/student-auth/access.service";

/**
 * "Kampus app" (A-150): which Telegram accounts sign in as this student or as
 * their parent, how each got linked, and the way to take that away.
 */
export function AccessCard({
  studentId,
  access,
  canEdit,
  onChanged,
}: {
  studentId: string;
  access: StudentAccessDto[];
  canEdit: boolean;
  onChanged: () => void;
}) {
  const t = useTranslations("students.access");
  const fmt = useDateFormat();
  const [confirm, setConfirm] = useState<null | {
    kind: "unlink" | "signOut";
    link: StudentAccessDto;
  }>(null);

  return (
    <Card data-testid="access-card">
      <CardContent className="space-y-3 pt-6">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <KeyRound className="size-4 text-muted-foreground" /> {t("title")}
        </h2>
        {access.length === 0 ? (
          <p className="text-sm text-muted-foreground" data-testid="access-none">
            {t("none")}
          </p>
        ) : (
          <ul className="space-y-2">
            {access.map((a) => (
              <li
                key={a.linkId}
                className="space-y-1 rounded-lg border p-2 text-sm"
                data-testid="access-row"
              >
                <p className="flex flex-wrap items-center gap-2 font-medium">
                  {a.telegramName}
                  {a.telegramUsername && (
                    <span className="font-normal text-muted-foreground">@{a.telegramUsername}</span>
                  )}
                  <Badge variant="outline">
                    {a.who.kind === "PARENT" ? t("parent", { name: a.who.name }) : t("student")}
                  </Badge>
                </p>
                <p className="text-xs text-muted-foreground">
                  {t(`via.${a.via}`)} ·{" "}
                  {fmt(new Date(a.linkedAt), { day: "numeric", month: "short", year: "numeric" })}
                  {a.lastSeenAt &&
                    ` · ${t("lastSeen", { date: fmt(new Date(a.lastSeenAt), { day: "numeric", month: "short" }) })}`}
                  {` · ${t("devices", { count: a.devices })}`}
                </p>
                {canEdit && (
                  <div className="flex flex-wrap gap-2 pt-1">
                    {a.devices > 0 && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setConfirm({ kind: "signOut", link: a })}
                        data-testid="access-sign-out"
                      >
                        <LogOut /> {t("signOut")}
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-destructive"
                      onClick={() => setConfirm({ kind: "unlink", link: a })}
                      data-testid="access-unlink"
                    >
                      <Unlink /> {t("unlink")}
                    </Button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
        <p className="text-xs text-muted-foreground">{t("hint")}</p>
      </CardContent>
      <ConfirmDialog
        open={confirm !== null}
        onOpenChange={(open) => !open && setConfirm(null)}
        title={
          confirm?.kind === "signOut"
            ? t("signOutTitle", { name: confirm.link.telegramName })
            : t("unlinkTitle", { name: confirm?.link.telegramName ?? "" })
        }
        description={confirm?.kind === "signOut" ? t("signOutText") : t("unlinkText")}
        confirmLabel={confirm?.kind === "signOut" ? t("signOut") : t("unlink")}
        onConfirm={async () => {
          if (!confirm) return;
          const base = `/students/${studentId}/access/${confirm.link.linkId}`;
          if (confirm.kind === "signOut") await api(`${base}/sign-out`, { method: "POST" });
          else await api(base, { method: "DELETE" });
          onChanged();
        }}
      />
    </Card>
  );
}
