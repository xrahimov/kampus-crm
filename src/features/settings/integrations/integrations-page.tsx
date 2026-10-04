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

/** Settings → Integrations: SMS gateway, Telegram bot, telephony, and the job queue (A-83). */
export function IntegrationsPage({ integrations }: { integrations: IntegrationDto[] }) {
  const t = useTranslations("integrations");
  const by = (p: IntegrationDto["provider"]) => integrations.find((i) => i.provider === p)!;
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
          { key: "webhookSecret", secret: true },
        ]}
        extra={<WebhookHint path="telegram?secret=…" />}
        testId="integration-telegram"
      />
      <IntegrationForm
        provider="TELEPHONY"
        dto={by("TELEPHONY")}
        fields={[{ key: "webhookSecret", secret: true }]}
        extra={<WebhookHint path="telephony" />}
        testId="integration-telephony"
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
