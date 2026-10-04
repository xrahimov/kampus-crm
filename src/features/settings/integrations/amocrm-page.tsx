"use client";

import { Plug } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { api, ApiError } from "@/lib/api-client";
import type { IntegrationDto } from "@/server/services/integrations/integrations.service";

import { IntegrationForm } from "./integration-form";

/** Settings → Integrations → AmoCRM (EXP §8): the four fields plus "Test connection". */
export function AmoCrmPage({ dto }: { dto: IntegrationDto }) {
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
      ]}
      extra={
        <div className="space-y-2">
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
