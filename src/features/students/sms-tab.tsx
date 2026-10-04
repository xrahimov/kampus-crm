"use client";

import { MessageSquare } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState, useTransition } from "react";

import { EmptyState } from "@/components/data/empty-state";
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
import { SendSmsDialog } from "@/features/sms/send-sms-dialog";
import { useRouter } from "@/i18n/navigation";
import { useDateFormat } from "@/lib/use-date-format";
import type { SmsStatus } from "@/lib/validation/integrations";
import type { SmsLogRowDto } from "@/server/services/sms/sms.service";

export function SmsStatusBadge({ status }: { status: SmsStatus }) {
  const t = useTranslations("sms.statuses");
  const variant = status === "SENT" ? "success" : status === "FAILED" ? "destructive" : "secondary";
  return <Badge variant={variant}>{t(status)}</Badge>;
}

/** Student profile → SMS tab (EXP §6): messages sent to the student, plus "Send SMS". */
export function SmsTab({
  studentId,
  studentName,
  hasPhone,
  messages,
  canSend,
}: {
  studentId: string;
  studentName: string;
  hasPhone: boolean;
  messages: SmsLogRowDto[];
  canSend: boolean;
}) {
  const t = useTranslations("sms");
  const fmt = useDateFormat();
  const router = useRouter();
  const [, startTransition] = useTransition();
  const [open, setOpen] = useState(false);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-base font-semibold">{t("studentTab.title")}</h2>
        {canSend && (
          <Button
            size="sm"
            onClick={() => setOpen(true)}
            disabled={!hasPhone}
            title={hasPhone ? undefined : t("studentTab.noPhone")}
            data-testid="student-send-sms"
          >
            <MessageSquare /> {t("send.button")}
          </Button>
        )}
      </div>
      {messages.length === 0 ? (
        <EmptyState title={t("studentTab.empty")} />
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("log.columns.sentAt")}</TableHead>
              <TableHead>{t("log.columns.recipient")}</TableHead>
              <TableHead>{t("log.columns.text")}</TableHead>
              <TableHead>{t("log.columns.sentBy")}</TableHead>
              <TableHead>{t("log.columns.status")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {messages.map((m) => (
              <TableRow key={m.id} data-testid="student-sms-row">
                <TableCell className="whitespace-nowrap">
                  {fmt(new Date(m.createdAt), { dateStyle: "medium", timeStyle: "short" })}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {t(`recipientTypes.${m.recipientType}`)} · {m.phone}
                </TableCell>
                <TableCell className="max-w-md whitespace-pre-wrap">{m.text}</TableCell>
                <TableCell className="whitespace-nowrap">
                  {m.sentByName ?? t("log.system")}
                  {m.event && (
                    <span className="block text-xs text-muted-foreground">
                      {t(`autoEvents.${m.event}`)}
                    </span>
                  )}
                </TableCell>
                <TableCell>
                  <SmsStatusBadge status={m.status} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
      <SendSmsDialog
        open={open}
        onOpenChange={setOpen}
        target={{ kind: "student", studentId }}
        title={t("send.toStudent", { name: studentName })}
        onSent={() => startTransition(() => router.refresh())}
      />
    </div>
  );
}
