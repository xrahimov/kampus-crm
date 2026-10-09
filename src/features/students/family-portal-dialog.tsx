"use client";

import { Check, Copy, MessageSquare, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { api, ApiError } from "@/lib/api-client";

/** "Parents' page" (A-130): the family's one link, to copy, renew or text to the parents. */
export function FamilyPortalDialog({
  open,
  onOpenChange,
  studentId,
  canReset,
  canSms,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: string;
  canReset: boolean;
  canSms: boolean;
}) {
  const t = useTranslations("students.family.page");
  const tc = useTranslations();
  const [url, setUrl] = useState<string | null | undefined>(undefined);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [sent, setSent] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const loading = url === undefined;

  // Fresh state each time the dialog opens; the link itself is fetched below.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setUrl(undefined);
      setCopied(false);
      setSent(null);
      setError(null);
    }
  }

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    api<{ url: string } | null>(`/students/${studentId}/family/page`)
      .then((r) => {
        if (!cancelled) setUrl(r?.url ?? null);
      })
      .catch((e) => {
        if (cancelled) return;
        setUrl(null);
        setError(e instanceof ApiError ? e.message : "errors.internal");
      });
    return () => {
      cancelled = true;
    };
  }, [open, studentId]);

  async function copy() {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  }

  async function reset() {
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ url: string } | null>(`/students/${studentId}/family/page`, {
        method: "POST",
      });
      setUrl(r?.url ?? null);
      setCopied(false);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "errors.internal");
    } finally {
      setBusy(false);
    }
  }

  async function sendSms() {
    if (!url) return;
    setBusy(true);
    setError(null);
    try {
      const r = await api<{ total: number }>("/sms/send", {
        method: "POST",
        body: { target: { kind: "parents", studentId }, text: t("smsText", { url }) },
      });
      setSent(r.total);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : "errors.internal");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent data-testid="family-portal-dialog">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("hint")}</DialogDescription>
        </DialogHeader>
        {error && <Alert variant="destructive">{tc.has(error) ? tc(error) : error}</Alert>}
        {!loading && url === null && !error && (
          <p className="text-sm text-muted-foreground">{t("none")}</p>
        )}
        {url && (
          <div className="space-y-3">
            <div className="flex gap-2">
              <Input readOnly value={url} data-testid="family-portal-url" />
              <Button
                type="button"
                variant="outline"
                onClick={copy}
                data-testid="family-portal-copy"
              >
                {copied ? <Check /> : <Copy />} {copied ? t("copied") : t("copy")}
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {canSms && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={sendSms}
                  disabled={busy}
                  data-testid="family-portal-sms"
                >
                  <MessageSquare /> {t("sms")}
                </Button>
              )}
              {canReset && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={reset}
                  disabled={busy}
                  title={t("resetHint")}
                  data-testid="family-portal-reset"
                >
                  <RefreshCw /> {t("reset")}
                </Button>
              )}
            </div>
            {sent !== null && (
              <p className="text-sm text-muted-foreground" data-testid="family-portal-sent">
                {sent === 0 ? t("smsNone") : t("smsSent", { count: sent })}
              </p>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
