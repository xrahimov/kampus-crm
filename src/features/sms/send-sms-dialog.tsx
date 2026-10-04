"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { FormDialog } from "@/features/settings/shared/form-dialog";
import { api, ApiError } from "@/lib/api-client";
import { SMS_MAX_LENGTH, type SmsTarget } from "@/lib/validation/integrations";
import type { SendSmsResult } from "@/server/services/sms/sms.service";
import type { SmsTemplateDto } from "@/server/services/sms/templates.service";

import { smsParts } from "./sms-counter";

const NONE = "__none";

/**
 * Every "SMS YUBORISH" in the reference (students, teachers, groups, lead
 * columns, parents, one student) opens this: recipient count, template picker,
 * text with the character/part counter, then the send result.
 */
export function SendSmsDialog({
  open,
  onOpenChange,
  target,
  title,
  onSent,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: SmsTarget | null;
  title?: string;
  onSent?: (result: SendSmsResult) => void;
}) {
  const t = useTranslations("sms.send");
  const [text, setText] = useState("");
  const [templateId, setTemplateId] = useState(NONE);
  const [templates, setTemplates] = useState<SmsTemplateDto[]>([]);
  const [count, setCount] = useState<{ count: number; skipped: number; sample: string[] } | null>(
    null,
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SendSmsResult | null>(null);

  useEffect(() => {
    if (!open || !target) return;
    let cancelled = false;
    api<SmsTemplateDto[]>("/sms-templates")
      .then((rows) => {
        if (!cancelled) setTemplates(rows);
      })
      .catch(() => undefined);
    api<{ count: number; skipped: number; sample: string[] }>("/sms/count", {
      method: "POST",
      body: { target },
    })
      .then((c) => {
        if (!cancelled) setCount(c);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof ApiError ? e.message : "errors.internal");
      });
    return () => {
      cancelled = true;
    };
  }, [open, target]);

  function close(next: boolean) {
    if (!next) {
      setText("");
      setTemplateId(NONE);
      setCount(null);
      setError(null);
      setResult(null);
    }
    onOpenChange(next);
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!target || result) return;
    setSubmitting(true);
    setError(null);
    try {
      const r = await api<SendSmsResult>("/sms/send", { method: "POST", body: { target, text } });
      setResult(r);
      onSent?.(r);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "errors.internal");
    } finally {
      setSubmitting(false);
    }
  }

  const { chars, parts } = smsParts(text);
  return (
    <FormDialog
      open={open}
      onOpenChange={close}
      title={title ?? t("title")}
      description={
        count ? t("recipients", { count: count.count, skipped: count.skipped }) : t("counting")
      }
      onSubmit={onSubmit}
      submitting={submitting}
      error={error}
      testId="send-sms-dialog"
    >
      {result ? (
        <Alert variant={result.failed === 0 ? "success" : "destructive"} data-testid="sms-result">
          {t("result", { sent: result.sent, failed: result.failed })}
          {result.adapter === "fake" && <span className="block text-xs">{t("fakeAdapter")}</span>}
        </Alert>
      ) : (
        <>
          {count && count.sample.length > 0 && (
            <p className="text-xs text-muted-foreground" data-testid="sms-sample">
              {count.sample.join(", ")}
              {count.count > count.sample.length ? "…" : ""}
            </p>
          )}
          {templates.length > 0 && (
            <div className="space-y-2">
              <Label htmlFor="sms-template">{t("template")}</Label>
              <Select
                value={templateId}
                onValueChange={(v) => {
                  setTemplateId(v);
                  const tpl = templates.find((x) => x.id === v);
                  if (tpl) setText(tpl.text);
                }}
              >
                <SelectTrigger id="sms-template">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE}>{t("noTemplate")}</SelectItem>
                  {templates.map((tpl) => (
                    <SelectItem key={tpl.id} value={tpl.id}>
                      {tpl.categoryName}: {tpl.text.slice(0, 60)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-2">
            <Label htmlFor="sms-text">{t("text")}</Label>
            <Textarea
              id="sms-text"
              rows={5}
              maxLength={SMS_MAX_LENGTH}
              value={text}
              onChange={(e) => setText(e.target.value)}
              required
            />
            <p className="text-xs text-muted-foreground tabular-nums" data-testid="sms-counter">
              {t("counter", { chars, parts })}
            </p>
          </div>
        </>
      )}
    </FormDialog>
  );
}
