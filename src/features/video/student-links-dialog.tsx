"use client";

import { Check, Copy, RefreshCw, Send } from "lucide-react";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiError } from "@/lib/api-client";
import type { StudentLinkDto } from "@/server/services/video/video.service";

/** The SMS text keeps these literally; the server fills them in per student. */
const PLACEHOLDERS = { link: "{link}", studentName: "{studentName}" };

const linkFor = (token: string) =>
  `${typeof window === "undefined" ? "" : window.location.origin}/class/${token}`;

/**
 * Each student's personal link to the group's video lessons. The link stays the
 * same for every lesson, so students can keep it; resetting one cuts off a
 * link that was passed on.
 */
export function StudentLinksDialog({
  groupId,
  open,
  onOpenChange,
  canSms,
}: {
  groupId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canSms: boolean;
}) {
  const t = useTranslations("video.links");
  const te = useTranslations();
  const [links, setLinks] = useState<StudentLinkDto[] | null>(null);
  const [copied, setCopied] = useState<string | null>(null);
  const [text, setText] = useState(() => t("smsDefault", PLACEHOLDERS));
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void api<StudentLinkDto[]>(`/groups/${groupId}/video/links`)
      .then((rows) => !cancelled && setLinks(rows))
      .catch(() => !cancelled && setLinks([]));
    return () => {
      cancelled = true;
    };
  }, [open, groupId]);

  const errorText = (e: unknown) => {
    const key = e instanceof ApiError ? e.message : "errors.internal";
    return te.has(key) ? te(key) : te("errors.internal");
  };

  async function copy(id: string, value: string) {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(id);
      setTimeout(() => setCopied((c) => (c === id ? null : c)), 1500);
    } catch {
      setMessage({ kind: "error", text: t("copyFailed") });
    }
  }

  async function reset(row: StudentLinkDto) {
    try {
      const next = await api<StudentLinkDto>(`/memberships/${row.membershipId}/video-link`, {
        method: "POST",
      });
      setLinks(
        (rows) => rows?.map((r) => (r.membershipId === row.membershipId ? next : r)) ?? null,
      );
      setMessage({ kind: "ok", text: t("resetDone", { name: row.fullName }) });
    } catch (e) {
      setMessage({ kind: "error", text: errorText(e) });
    }
  }

  async function sendSms() {
    setSending(true);
    setMessage(null);
    try {
      const r = await api<{ sent: number; failed: number; skipped: number }>(
        `/groups/${groupId}/video/sms`,
        { method: "POST", body: { text } },
      );
      setMessage({ kind: r.failed > 0 ? "error" : "ok", text: t("smsResult", r) });
    } catch (e) {
      setMessage({ kind: "error", text: errorText(e) });
    } finally {
      setSending(false);
    }
  }

  const all = (links ?? []).map((r) => `${r.fullName}: ${linkFor(r.token)}`).join("\n");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{t("title")}</DialogTitle>
          <DialogDescription>{t("description")}</DialogDescription>
        </DialogHeader>
        {message && (
          <Alert variant={message.kind === "ok" ? "success" : "destructive"}>{message.text}</Alert>
        )}
        {links === null ? (
          <p className="text-sm text-muted-foreground">{te("common.loading")}</p>
        ) : links.length === 0 ? (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        ) : (
          <>
            <ul className="divide-y rounded-md border text-sm" data-testid="video-link-list">
              {links.map((r) => (
                <li key={r.membershipId} className="flex items-center gap-2 px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium">{r.fullName}</p>
                    <p className="truncate text-xs text-muted-foreground">{linkFor(r.token)}</p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => void copy(r.membershipId, linkFor(r.token))}
                    aria-label={t("copy", { name: r.fullName })}
                    title={t("copy", { name: r.fullName })}
                  >
                    {copied === r.membershipId ? <Check /> : <Copy />}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => void reset(r)}
                    aria-label={t("reset", { name: r.fullName })}
                    title={t("reset", { name: r.fullName })}
                  >
                    <RefreshCw />
                  </Button>
                </li>
              ))}
            </ul>
            <Button variant="outline" size="sm" onClick={() => void copy("all", all)}>
              {copied === "all" ? <Check /> : <Copy />} {t("copyAll")}
            </Button>
            {canSms && (
              <div className="space-y-2 border-t pt-4">
                <Label htmlFor="video-sms-text">{t("smsLabel")}</Label>
                <Textarea
                  id="video-sms-text"
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={3}
                />
                <p className="text-xs text-muted-foreground">{t("smsHint", PLACEHOLDERS)}</p>
                <Button onClick={sendSms} disabled={sending} size="sm" data-testid="video-sms">
                  <Send /> {sending ? t("sending") : t("sendSms")}
                </Button>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
