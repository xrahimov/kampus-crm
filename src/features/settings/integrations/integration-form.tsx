"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { useRouter } from "@/i18n/navigation";
import { api, ApiError } from "@/lib/api-client";
import type { IntegrationProvider } from "@/lib/validation/integrations";
import type { IntegrationDto } from "@/server/services/integrations/integrations.service";

export interface IntegrationField {
  key: string;
  secret?: boolean;
  type?: "text" | "number";
}

/**
 * One provider's card: enabled switch plus its fields. Secrets come back masked
 * and stay masked unless the user types a new value (A-83).
 */
export function IntegrationForm({
  provider,
  dto,
  fields,
  extra,
  testId,
}: {
  provider: IntegrationProvider;
  dto: IntegrationDto;
  fields: IntegrationField[];
  /** Read-only lines under the form, e.g. the webhook URL to paste into the provider. */
  extra?: React.ReactNode;
  testId?: string;
}) {
  const t = useTranslations(`integrations.${provider}`);
  const tc = useTranslations("common");
  const ti = useTranslations("integrations");
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [enabled, setEnabled] = useState(dto.isEnabled);
  const [values, setValues] = useState<Record<string, string>>(
    Object.fromEntries(fields.map((f) => [f.key, String(dto.config[f.key] ?? "")])),
  );
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);
  const path = provider.toLowerCase().replace("_", "-");

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      const body: Record<string, unknown> = { isEnabled: enabled };
      for (const f of fields)
        body[f.key] = f.type === "number" ? Number(values[f.key] ?? 0) : values[f.key];
      await api(`/integrations/${path}`, { method: "PUT", body });
      setMessage({ kind: "ok", text: tc("saved") });
      startTransition(() => router.refresh());
    } catch (e) {
      setMessage({ kind: "error", text: e instanceof ApiError ? e.message : "errors.internal" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card data-testid={testId}>
      <CardHeader>
        <div className="flex items-start justify-between gap-4">
          <div>
            <CardTitle>{t("title")}</CardTitle>
            <CardDescription>{t("description")}</CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Label htmlFor={`${path}-enabled`} className="text-sm">
              {ti("enabled")}
            </Label>
            <Switch id={`${path}-enabled`} checked={enabled} onCheckedChange={setEnabled} />
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {message && (
          <Alert variant={message.kind === "ok" ? "success" : "destructive"}>{message.text}</Alert>
        )}
        <div className="grid gap-4 sm:grid-cols-2">
          {fields.map((f) => (
            <div key={f.key} className="space-y-2">
              <Label htmlFor={`${path}-${f.key}`}>{t(`fields.${f.key}`)}</Label>
              <Input
                id={`${path}-${f.key}`}
                type={f.secret ? "password" : (f.type ?? "text")}
                autoComplete="off"
                value={values[f.key] ?? ""}
                onChange={(e) => setValues((v) => ({ ...v, [f.key]: e.target.value }))}
              />
            </div>
          ))}
        </div>
        {extra}
        <div className="flex justify-end">
          <Button onClick={save} disabled={saving} data-testid={`${path}-save`}>
            {saving ? tc("saving") : tc("save")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

/** The URL a provider must call, shown next to the secret field. */
export function WebhookHint({ path }: { path: string }) {
  const t = useTranslations("integrations");
  const origin = typeof window === "undefined" ? "" : window.location.origin;
  return (
    <p className="text-xs text-muted-foreground">
      {t("webhookHint")}{" "}
      <code className="rounded bg-muted px-1">{`${origin}/api/v1/webhooks/${path}`}</code>
    </p>
  );
}
