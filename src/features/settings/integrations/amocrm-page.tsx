"use client";

import { Plug } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api-client";
import type { IntegrationDto } from "@/server/services/integrations/integrations.service";

import { IntegrationForm, WebhookHint } from "./integration-form";

/**
 * Settings → Integrations → AmoCRM (EXP §8): the four credential fields plus
 * "Test connection", and the webhook that brings amoCRM's leads here (A-115).
 */
export function AmoCrmPage({
  dto,
  columns,
}: {
  dto: IntegrationDto;
  /** The board columns a lead from amoCRM may land in. */
  columns: Array<{ id: string; label: string }>;
}) {
  const t = useTranslations("integrations.AMOCRM");
  const [testing, setTesting] = useState(false);
  const [result, setResult] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  async function test() {
    setTesting(true);
    setResult(null);
    try {
      const r = await api<{ ok: boolean; account?: string; error?: string; adapter: string }>(
        "/integrations/amocrm-test",
        { method: "POST" },
      );
      setResult(
        r.ok
          ? {
              kind: "ok",
              text:
                r.adapter === "fake" ? t("testFake") : t("testOk", { account: r.account ?? "" }),
            }
          : { kind: "error", text: r.error ?? "errors.integration" },
      );
    } catch (e) {
      setResult({ kind: "error", text: e instanceof ApiError ? e.message : "errors.internal" });
    } finally {
      setTesting(false);
    }
  }

  return (
    <IntegrationForm
      provider="AMOCRM"
      dto={dto}
      fields={[
        { key: "secretKey", secret: true },
        { key: "integrationId" },
        { key: "authorizationCode", secret: true },
        { key: "subDomain" },
        { key: "webhookSecret", secret: true },
        { key: "leadSourceName" },
        {
          key: "leadColumnId",
          options: [
            { value: "", label: t("firstColumn") },
            ...columns.map((c) => ({ value: c.id, label: c.label })),
          ],
        },
      ]}
      extra={
        <div className="space-y-2">
          <WebhookHint path="amocrm?secret=…" />
          <p className="text-xs text-muted-foreground">{t("inboundHint")}</p>
          {result && (
            <Alert
              variant={result.kind === "ok" ? "success" : "destructive"}
              data-testid="amocrm-test-result"
            >
              {result.text}
            </Alert>
          )}
          <p className="text-xs text-muted-foreground">
            {dto.state.hasTokens ? t("connected") : t("notConnected")}
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={test}
            disabled={testing}
            data-testid="amocrm-test"
          >
            <Plug /> {t("test")}
          </Button>
        </div>
      }
      testId="integration-amocrm"
    />
  );
}
