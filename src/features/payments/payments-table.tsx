"use client";

import { Printer, RefreshCw } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";

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
import { Link } from "@/i18n/navigation";
import { api } from "@/lib/api-client";
import { parseDateOnly } from "@/lib/dates";
import { useDateFormat } from "@/lib/use-date-format";
import { useMoneyFormat } from "@/lib/use-money-format";
import type { FiscalReceiptDto } from "@/server/services/payments/fiscal.service";
import type { PaymentDto } from "@/server/services/students/payments.service";

import { openReceipt } from "./payment-dialog";

/** EXP §6 "To'lov tarixi" columns, reused by the payments log. */
export function PaymentsTable({
  payments,
  showStudent,
}: {
  payments: PaymentDto[];
  showStudent?: boolean;
}) {
  const t = useTranslations("payments.history");
  const te = useTranslations("errors");
  const money = useMoneyFormat();
  const fmt = useDateFormat();
  const date = (iso: string) => fmt(parseDateOnly(iso), { dateStyle: "medium" });
  // Fiscal receipts retried from this table, by payment id (A-147).
  const [fiscalOverrides, setFiscalOverrides] = useState<Record<string, FiscalReceiptDto>>({});
  const [retrying, setRetrying] = useState<string | null>(null);
  const [fiscalError, setFiscalError] = useState<string | null>(null);
  const fiscalOf = (p: PaymentDto) => fiscalOverrides[p.id] ?? p.fiscal;
  // The column appears only where the centre fiscalises, so other cash desks stay as they were.
  const showFiscal = payments.some((p) => fiscalOf(p) !== null);

  async function retryFiscal(paymentId: string) {
    setRetrying(paymentId);
    setFiscalError(null);
    try {
      const dto = await api<FiscalReceiptDto>(`/payments/${paymentId}/fiscal`, { method: "POST" });
      setFiscalOverrides((m) => ({ ...m, [paymentId]: dto }));
    } catch (e) {
      setFiscalError(e instanceof Error ? e.message : "errors.internal");
    } finally {
      setRetrying(null);
    }
  }

  if (payments.length === 0) return <EmptyState title={t("empty")} />;
  return (
    <div className="space-y-2">
      {fiscalError && (
        <p className="text-sm text-destructive" role="alert">
          {fiscalError.startsWith("errors.")
            ? te(fiscalError.slice("errors.".length))
            : fiscalError}
        </p>
      )}
      <Table>
        <TableHeader>
          <TableRow>
            {showStudent && <TableHead>{t("student")}</TableHead>}
            <TableHead>{t("date")}</TableHead>
            <TableHead>{t("month")}</TableHead>
            <TableHead className="text-right">{t("amount")}</TableHead>
            <TableHead className="text-right">{t("refunded")}</TableHead>
            <TableHead className="text-right">{t("bonus")}</TableHead>
            <TableHead>{t("group")}</TableHead>
            <TableHead>{t("comment")}</TableHead>
            <TableHead>{t("method")}</TableHead>
            <TableHead>{t("receivedBy")}</TableHead>
            <TableHead>{t("createdAt")}</TableHead>
            {showFiscal && <TableHead>{t("fiscal")}</TableHead>}
            <TableHead className="w-12" />
          </TableRow>
        </TableHeader>
        <TableBody>
          {payments.map((p) => (
            <TableRow key={p.id} data-testid="payment-row">
              {showStudent && (
                <TableCell className="font-medium">
                  <Link href={`/students/${p.studentId}`} className="hover:underline">
                    {p.studentName}
                  </Link>
                </TableCell>
              )}
              <TableCell className="whitespace-nowrap">{date(p.paidAt)}</TableCell>
              <TableCell className="whitespace-nowrap">
                {fmt(parseDateOnly(p.effectiveMonth), { month: "short", year: "numeric" })}
              </TableCell>
              <TableCell className="text-right tabular-nums whitespace-nowrap">
                {money(p.amount)}
              </TableCell>
              <TableCell className="text-right tabular-nums whitespace-nowrap">
                {p.refunded > 0 ? money(p.refunded) : "—"}
              </TableCell>
              <TableCell className="text-right tabular-nums whitespace-nowrap">
                {p.bonus > 0 ? money(p.bonus) : "—"}
              </TableCell>
              <TableCell>
                <Link href={`/groups/${p.groupId}`} className="hover:underline">
                  {p.groupName}
                </Link>
              </TableCell>
              <TableCell className="max-w-48 truncate" title={p.comment ?? undefined}>
                {p.comment ?? "—"}
              </TableCell>
              <TableCell>{p.methodName ?? "—"}</TableCell>
              <TableCell>{p.receivedByName ?? "—"}</TableCell>
              <TableCell className="whitespace-nowrap text-muted-foreground">
                {fmt(new Date(p.createdAt), { dateStyle: "medium", timeStyle: "short" })}
              </TableCell>
              {showFiscal && (
                <TableCell className="whitespace-nowrap">
                  {(() => {
                    const f = fiscalOf(p);
                    if (!f) return "—";
                    return (
                      <span className="inline-flex items-center gap-1">
                        <Badge
                          variant={
                            f.status === "ISSUED"
                              ? "success"
                              : f.status === "FAILED"
                                ? "destructive"
                                : "secondary"
                          }
                          title={
                            f.status === "ISSUED"
                              ? (f.fiscalSign ?? undefined)
                              : f.status === "FAILED"
                                ? (f.error ?? undefined)
                                : undefined
                          }
                          data-testid="payment-fiscal"
                          data-status={f.status}
                        >
                          {t(`fiscalStatus.${f.status}`)}
                        </Badge>
                        {f.status === "FAILED" && (
                          <Button
                            variant="ghost"
                            size="icon"
                            aria-label={t("fiscalRetry")}
                            title={t("fiscalRetry")}
                            disabled={retrying === p.id}
                            onClick={() => retryFiscal(p.id)}
                            data-testid="payment-fiscal-retry"
                          >
                            <RefreshCw className={retrying === p.id ? "animate-spin" : undefined} />
                          </Button>
                        )}
                      </span>
                    );
                  })()}
                </TableCell>
              )}
              <TableCell>
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label={t("receipt")}
                  title={t("receipt")}
                  onClick={() => openReceipt(p.id)}
                >
                  <Printer />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
