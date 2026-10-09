"use client";

import { RefreshCw } from "lucide-react";
import { useFormatter, useTranslations } from "next-intl";
import { useState, type ReactNode } from "react";

import { FieldError } from "@/components/data/field-error";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api, ApiError } from "@/lib/api-client";
import type {
  CheckResult,
  StatusLevel,
  SystemStatusDto,
} from "@/server/services/system/monitoring.service";

const BADGE: Record<StatusLevel, "success" | "destructive" | "muted" | "secondary"> = {
  ok: "success",
  warning: "secondary",
  down: "destructive",
  unknown: "muted",
};

function formatBytes(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(1)} GB`;
  if (bytes >= 1024 ** 2) return `${Math.round(bytes / 1024 ** 2)} MB`;
  return `${Math.round(bytes / 1024)} KB`;
}

function formatDuration(seconds: number): string {
  const days = Math.floor(seconds / 86_400);
  const hours = Math.floor((seconds % 86_400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (days > 0) return `${days} d ${hours} h`;
  if (hours > 0) return `${hours} h ${minutes} min`;
  return `${minutes} min`;
}

/**
 * Server status for the site owner (A-134): one row per thing the server knows
 * about itself, the Telegram chat that receives alerts, and "Check now".
 */
export function ServerStatus({ initial }: { initial: SystemStatusDto }) {
  const t = useTranslations("settings.system");
  const format = useFormatter();
  const [status, setStatus] = useState(initial);
  const [chatId, setChatId] = useState(initial.alerts.chatId ?? "");
  const [busy, setBusy] = useState<"check" | "save" | "test" | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const now = new Date(status.checkedAt);
  const ago = (iso: string) => format.relativeTime(new Date(iso), now);
  const time = (iso: string) =>
    format.dateTime(new Date(iso), { dateStyle: "medium", timeStyle: "short" });

  const run = async (kind: "check" | "save" | "test", action: () => Promise<void>) => {
    setBusy(kind);
    setNotice(null);
    setError(null);
    try {
      await action();
    } catch (e) {
      // FieldError translates the key itself.
      setError(e instanceof ApiError ? (e.fields?.chatId?.[0] ?? e.message) : "errors.internal");
    } finally {
      setBusy(null);
    }
  };

  const rows: Array<{ key: string; level: StatusLevel; detail: ReactNode }> = [
    {
      key: "app",
      level: "ok",
      detail: t("app.detail", {
        duration: formatDuration(status.app.uptimeSeconds),
        node: status.app.nodeVersion,
      }),
    },
    {
      key: "database",
      level: status.database.level,
      detail:
        status.database.level === "ok"
          ? t("database.detail", { ms: status.database.latencyMs })
          : t("database.down"),
    },
    {
      key: "worker",
      level: status.worker.level,
      detail:
        status.worker.lastTickAt === null
          ? t("worker.never")
          : status.worker.level === "ok"
            ? t("worker.detail", { ago: ago(status.worker.lastTickAt) })
            : t("worker.stale", { ago: ago(status.worker.lastTickAt) }),
    },
    {
      key: "jobs",
      level: status.jobs.level,
      detail: (
        <>
          {t("jobs.detail", {
            pending: status.jobs.pending,
            overdue: status.jobs.overdue,
            failed: status.jobs.failedRecent,
          })}
          {status.jobs.lastError && (
            <div className="text-xs text-muted-foreground">
              {t("jobs.lastError", {
                type: status.jobs.lastError.type,
                message: status.jobs.lastError.message,
              })}
            </div>
          )}
        </>
      ),
    },
    {
      key: "backup",
      level: status.backup.level,
      detail:
        status.backup.lastAt === null
          ? t("backup.never")
          : status.backup.error
            ? t("backup.error", {
                ago: ago(status.backup.error.at),
                message: status.backup.error.message,
              })
            : status.backup.level === "ok"
              ? t("backup.detail", {
                  file: status.backup.file ?? "",
                  size: formatBytes(status.backup.sizeBytes ?? 0),
                  ago: ago(status.backup.lastAt),
                  free: formatBytes(status.backup.freeBytes ?? 0),
                })
              : t("backup.stale", { ago: ago(status.backup.lastAt) }),
    },
    {
      key: "disk",
      level: status.disk?.level ?? "unknown",
      detail: status.disk
        ? t("disk.detail", {
            free: formatBytes(status.disk.freeBytes),
            total: formatBytes(status.disk.totalBytes),
          })
        : t("disk.unknown"),
    },
    {
      key: "errors",
      level: status.errors.level,
      detail: (
        <>
          {status.errors.last24h === 0
            ? t("errors.none")
            : t("errors.detail", { count: status.errors.last24h })}
          {status.errors.recent.length > 0 && (
            <ul className="mt-1 space-y-0.5 text-xs text-muted-foreground">
              {status.errors.recent.slice(0, 3).map((e) => (
                <li key={e.at} className="truncate">
                  {time(e.at)} {e.path ?? ""} — {e.message}
                </li>
              ))}
            </ul>
          )}
        </>
      ),
    },
  ];

  return (
    <Card data-testid="server-status" data-level={status.level}>
      <CardHeader className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <CardTitle className="flex items-center gap-2">
            {t("title")}
            <Badge variant={BADGE[status.level]} data-testid="server-status-level">
              {t(`levels.${status.level}`)}
            </Badge>
          </CardTitle>
          <CardDescription>{t("description")}</CardDescription>
        </div>
        <div className="flex flex-col items-end gap-1">
          <Button
            variant="outline"
            size="sm"
            disabled={busy !== null}
            data-testid="server-status-check"
            onClick={() =>
              run("check", async () => {
                const result = await api<CheckResult>("/system/check", { method: "POST" });
                setStatus(result.status);
              })
            }
          >
            <RefreshCw className={busy === "check" ? "animate-spin" : undefined} />
            {t("checkNow")}
          </Button>
          <span className="text-xs text-muted-foreground">
            {t("checkedAt", { time: time(status.checkedAt) })}
          </span>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <dl className="divide-y">
          {rows.map((row) => (
            <div
              key={row.key}
              className="grid gap-1 py-2 sm:grid-cols-[10rem_7rem_1fr] sm:items-start sm:gap-3"
              data-testid={`status-${row.key}`}
              data-level={row.level}
            >
              <dt className="text-sm font-medium">{t(`rows.${row.key}`)}</dt>
              <dd>
                <Badge variant={BADGE[row.level]}>{t(`levels.${row.level}`)}</Badge>
              </dd>
              <dd className="text-sm">{row.detail}</dd>
            </div>
          ))}
        </dl>

        <div className="space-y-3 rounded-lg border p-3" data-testid="server-alerts">
          <div>
            <h3 className="text-sm font-semibold">{t("alerts.title")}</h3>
            <p className="text-xs text-muted-foreground">{t("alerts.hint")}</p>
          </div>
          <form
            className="flex flex-wrap items-end gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              void run("save", async () => {
                const next = await api<SystemStatusDto>("/system/alerts", {
                  method: "PUT",
                  body: { chatId },
                });
                setStatus(next);
                setNotice(t("alerts.saved"));
              });
            }}
          >
            <div className="min-w-48 space-y-1">
              <Label htmlFor="alert-chat-id">{t("alerts.chatId")}</Label>
              <Input
                id="alert-chat-id"
                value={chatId}
                onChange={(e) => setChatId(e.target.value)}
                inputMode="numeric"
                data-testid="alert-chat-id"
              />
            </div>
            <Button type="submit" size="sm" disabled={busy !== null} data-testid="alert-save">
              {t("alerts.save")}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={busy !== null || !status.alerts.chatId || !status.alerts.botReady}
              data-testid="alert-test"
              onClick={() =>
                run("test", async () => {
                  await api("/system/alerts/test", { method: "POST" });
                  setNotice(t("alerts.testSent"));
                })
              }
            >
              {t("alerts.test")}
            </Button>
          </form>
          <p className="text-xs text-muted-foreground">{t("alerts.chatIdHint")}</p>
          {status.alerts.chatId && !status.alerts.botReady && (
            <p className="text-xs text-destructive" data-testid="alert-bot-missing">
              {t("alerts.botMissing")}
            </p>
          )}
          {notice && (
            <p className="text-sm text-success" data-testid="alert-notice">
              {notice}
            </p>
          )}
          {error && <FieldError id="alert-error" message={error} />}
          <div className="text-xs text-muted-foreground">
            {status.alerts.lastSentAt
              ? t("alerts.lastSent", { time: time(status.alerts.lastSentAt) })
              : t("alerts.never")}
          </div>
          <div data-testid="alerts-open">
            <div className="text-sm font-medium">{t("alerts.open")}</div>
            {status.alerts.open.length === 0 ? (
              <p className="text-sm text-muted-foreground">{t("alerts.none")}</p>
            ) : (
              <ul className="mt-1 space-y-1 text-sm">
                {status.alerts.open.map((a) => (
                  <li key={a.key} data-testid="alert-open-row">
                    {a.message}{" "}
                    <span className="text-xs text-muted-foreground">
                      {t("alerts.since", { time: time(a.since) })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
