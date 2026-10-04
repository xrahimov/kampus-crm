"use client";

import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { smsParts } from "@/features/sms/sms-counter";
import { useRouter } from "@/i18n/navigation";
import { api, ApiError } from "@/lib/api-client";
import type { AutoSmsSettingDto } from "@/server/services/sms/auto-sms.service";

/** General settings → "AUTO SMS SOZLAMALARI" (EXP §8): a switch and a template per event. */
export function AutoSmsSettings({ settings }: { settings: AutoSmsSettingDto[] }) {
  const t = useTranslations("sms.auto");
  const te = useTranslations("sms.autoEvents");
  const tv = useTranslations("sms.variables");
  const ts = useTranslations("sms.send");
  const tc = useTranslations("common");
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [rows, setRows] = useState(settings);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  function update(event: string, patch: Partial<AutoSmsSettingDto>) {
    setRows((rs) => rs.map((r) => (r.event === event ? { ...r, ...patch } : r)));
  }

  async function save() {
    setSaving(true);
    setMessage(null);
    try {
      await api("/settings/auto-sms", {
        method: "PUT",
        body: {
          settings: rows.map(({ event, isActive, template }) => ({ event, isActive, template })),
        },
      });
      setMessage({ kind: "ok", text: tc("saved") });
      startTransition(() => router.refresh());
    } catch (e) {
      setMessage({ kind: "error", text: e instanceof ApiError ? e.message : "errors.internal" });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("title")}</CardTitle>
        <CardDescription>{t("description")}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {message && (
          <Alert
            variant={message.kind === "ok" ? "success" : "destructive"}
            data-testid="auto-sms-saved"
          >
            {message.text}
          </Alert>
        )}
        <ul className="divide-y">
          {rows.map((row) => {
            const { chars, parts } = smsParts(row.template);
            return (
              <li key={row.event} className="space-y-2 py-4" data-testid="auto-sms-row">
                <div className="flex items-center justify-between gap-4">
                  <Label htmlFor={`auto-${row.event}`} className="font-medium">
                    {te(row.event)}
                  </Label>
                  <Switch
                    id={`auto-${row.event}`}
                    checked={row.isActive}
                    onCheckedChange={(v) => update(row.event, { isActive: v })}
                    data-testid={`auto-sms-switch-${row.event}`}
                  />
                </div>
                <Textarea
                  rows={2}
                  aria-label={t("templateFor", { event: te(row.event) })}
                  value={row.template}
                  onChange={(e) => update(row.event, { template: e.target.value })}
                />
                <div className="flex flex-wrap items-center gap-1 text-xs text-muted-foreground">
                  <span className="mr-2 tabular-nums">{ts("counter", { chars, parts })}</span>
                  {row.variables.map((v) => (
                    <Button
                      key={v}
                      type="button"
                      variant="outline"
                      size="sm"
                      className="h-6 text-xs"
                      onClick={() => update(row.event, { template: `${row.template}{${v}}` })}
                    >
                      {tv(v)}
                    </Button>
                  ))}
                </div>
              </li>
            );
          })}
        </ul>
        <div className="flex justify-end">
          <Button onClick={save} disabled={saving} data-testid="save-auto-sms">
            {saving ? tc("saving") : tc("save")}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
