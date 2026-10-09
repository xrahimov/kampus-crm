"use client";

import { Play } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api, ApiError } from "@/lib/api-client";
import type { IntegrationDto } from "@/server/services/integrations/integrations.service";

import { IntegrationForm, WebhookHint } from "./integration-form";

/** Settings → Integrations: SMS gateway, Telegram bot, telephony, video lessons, and the job queue (A-83). */
export function IntegrationsPage({
  integrations,
  isSiteOwner = false,
}: {
  integrations: IntegrationDto[];
  /** The server's owner may share their Telegram bot with every centre (A-135). */
  isSiteOwner?: boolean;
}) {
  const t = useTranslations("integrations");
  const by = (p: IntegrationDto["provider"]) => integrations.find((i) => i.provider === p)!;
  const sharedBot = by("TELEGRAM").state.sharedBot as { username: string | null } | null;
  const [running, setRunning] = useState(false);
  const [queue, setQueue] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  async function runQueue() {
    setRunning(true);
    setQueue(null);
    try {
      const r = await api<{ claimed: number; done: number; failed: number; pending: number }>(
        "/jobs/run",
        { method: "POST" },
      );
      setQueue({ kind: "ok", text: t("queue.result", r) });
    } catch (e) {
      setQueue({ kind: "error", text: e instanceof ApiError ? e.message : "errors.internal" });
    } finally {
      setRunning(false);
    }
  }

  return (
    <div className="space-y-6">
      <IntegrationForm
        provider="SMS"
        dto={by("SMS")}
        fields={[{ key: "email" }, { key: "password", secret: true }, { key: "sender" }]}
        testId="integration-sms"
      />
      <IntegrationForm
        provider="TELEGRAM"
        dto={by("TELEGRAM")}
        fields={[
          { key: "botToken", secret: true },
          { key: "botUsername" },
          { key: "webhookSecret", secret: true },
          { key: "weeklyReport", type: "boolean" },
          ...(isSiteOwner ? [{ key: "sharedWithAllCentres", type: "boolean" as const }] : []),
        ]}
        extra={
          <>
            <WebhookHint path="telegram?secret=…" />
            {isSiteOwner && (
              <p className="text-xs text-muted-foreground">{t("TELEGRAM.sharedHint")}</p>
            )}
            {sharedBot && (
              <Alert data-testid="telegram-shared-bot">
                {sharedBot.username
                  ? t("TELEGRAM.sharedNote", { username: sharedBot.username })
                  : t("TELEGRAM.sharedNoteNoUsername")}
              </Alert>
            )}
          </>
        }
        testId="integration-telegram"
      />
      <IntegrationForm
        provider="TELEPHONY"
        dto={by("TELEPHONY")}
        fields={[{ key: "webhookSecret", secret: true }]}
        extra={<WebhookHint path="telephony" />}
        testId="integration-telephony"
      />
      <IntegrationForm
        provider="VIDEO"
        dto={by("VIDEO")}
        fields={[
          { key: "stunUrls" },
          { key: "turnUrls" },
          { key: "turnUsername" },
          { key: "turnCredential", secret: true },
          { key: "turnSecret", secret: true },
          { key: "maxParticipants", type: "number" },
          { key: "recordingKeepDays", type: "number" },
        ]}
        extra={
          <>
            <p className="text-xs text-muted-foreground">{t("VIDEO.hint")}</p>
            <p className="text-xs text-muted-foreground">{t("VIDEO.retentionHint")}</p>
          </>
        }
        testId="integration-video"
      />
      <IntegrationForm
        provider="PAYME"
        dto={by("PAYME")}
        fields={[{ key: "merchantId" }, { key: "key", secret: true }, { key: "checkoutUrl" }]}
        extra={
          <>
            <WebhookHint path="payme" />
            <p className="text-xs text-muted-foreground">{t("PAYME.hint")}</p>
          </>
        }
        testId="integration-payme"
      />
      <IntegrationForm
        provider="CLICK"
        dto={by("CLICK")}
        fields={[
          { key: "serviceId" },
          { key: "merchantId" },
          { key: "merchantUserId" },
          { key: "secretKey", secret: true },
        ]}
        extra={
          <>
            <WebhookHint path="click" />
            <p className="text-xs text-muted-foreground">{t("CLICK.hint")}</p>
          </>
        }
        testId="integration-click"
      />
      <IntegrationForm
        provider="FISCAL"
        dto={by("FISCAL")}
        fields={[
          { key: "apiUrl" },
          { key: "apiKey", secret: true },
          { key: "inn" },
          { key: "cashRegisterId" },
          { key: "vatPercent", type: "number" },
          { key: "ikpuCode" },
          { key: "autoIssue", type: "boolean" },
        ]}
        extra={<p className="text-xs text-muted-foreground">{t("FISCAL.hint")}</p>}
        testId="integration-fiscal"
      />
      <Card>
        <CardHeader>
          <CardTitle>{t("queue.title")}</CardTitle>
          <CardDescription>{t("queue.description")}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {queue && (
            <Alert
              variant={queue.kind === "ok" ? "success" : "destructive"}
              data-testid="queue-result"
            >
              {queue.text}
            </Alert>
          )}
          <Button variant="outline" onClick={runQueue} disabled={running} data-testid="run-queue">
            <Play /> {t("queue.run")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
