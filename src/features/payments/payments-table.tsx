"use client";

import { Printer } from "lucide-react";
import { useTranslations } from "next-intl";

import { EmptyState } from "@/components/data/empty-state";
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
import { parseDateOnly } from "@/lib/dates";
import { useDateFormat } from "@/lib/use-date-format";
import { useMoneyFormat } from "@/lib/use-money-format";
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
  const money = useMoneyFormat();
  const fmt = useDateFormat();
  const date = (iso: string) => fmt(parseDateOnly(iso), { dateStyle: "medium" });
  if (payments.length === 0) return <EmptyState title={t("empty")} />;
  return (
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
  );
}
