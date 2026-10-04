"use client";

import { Phone } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { EmptyState } from "@/components/data/empty-state";
import { Alert } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useRouter } from "@/i18n/navigation";
import { api, ApiError } from "@/lib/api-client";
import { useDateFormat } from "@/lib/use-date-format";
import type { CallStatus } from "@/lib/validation/integrations";
import type { CallDto } from "@/server/services/calls/calls.service";

export function CallStatusBadge({ status }: { status: CallStatus }) {
  const t = useTranslations("calls.statuses");
  const variant =
    status === "ANSWERED" ? "success" : status === "MISSED" ? "destructive" : "secondary";
  return <Badge variant={variant}>{t(status)}</Badge>;
}

export function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Student profile → CALLS tab (EXP §6) with click-to-call (A-86). */
export function CallsTab({
  studentId,
  phone,
  calls,
}: {
  studentId: string;
  phone: string | null;
  calls: CallDto[];
}) {
  const t = useTranslations("calls");
  const fmt = useDateFormat();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ kind: "ok" | "error"; text: string } | null>(null);

  async function call() {
    if (!phone) return;
    setBusy(true);
    setMessage(null);
    try {
      const r = await api<CallDto & { adapter: string }>(`/students/${studentId}/call`, {
        method: "POST",
        body: { phone },
      });
      setMessage({ kind: "ok", text: r.adapter === "fake" ? t("startedFake") : t("started") });
      startTransition(() => router.refresh());
    } catch (e) {
      setMessage({ kind: "error", text: e instanceof ApiError ? e.message : "errors.internal" });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">{t("studentTab.title")}</h2>
        <Button size="sm" onClick={call} disabled={!phone || busy} data-testid="student-call">
          <Phone /> {t("call")}
        </Button>
      </div>
      {message && (
        <Alert
          variant={message.kind === "ok" ? "success" : "destructive"}
          data-testid="call-result"
        >
          {message.text}
        </Alert>
      )}
      {calls.length === 0 ? (
        <EmptyState title={t("studentTab.empty")} />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("columns.startedAt")}</TableHead>
              <TableHead>{t("columns.direction")}</TableHead>
              <TableHead>{t("columns.phones")}</TableHead>
              <TableHead>{t("columns.staff")}</TableHead>
              <TableHead>{t("columns.duration")}</TableHead>
              <TableHead>{t("columns.status")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {calls.map((c) => (
              <TableRow key={c.id} data-testid="student-call-row">
                <TableCell className="whitespace-nowrap">
                  {fmt(new Date(c.startedAt), { dateStyle: "medium", timeStyle: "short" })}
                </TableCell>
                <TableCell>{t(`directions.${c.direction}`)}</TableCell>
                <TableCell className="whitespace-nowrap tabular-nums">
                  {c.fromPhone} → {c.toPhone}
                </TableCell>
                <TableCell>{c.staffName ?? "—"}</TableCell>
                <TableCell className="tabular-nums">{formatDuration(c.durationSeconds)}</TableCell>
                <TableCell>
                  <CallStatusBadge status={c.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
