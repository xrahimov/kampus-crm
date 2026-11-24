import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { useRetryFiscal } from "@/api/office-student-money";
import { usePaymentOptions, useStudentPayments } from "@/api/office-students";
import type { StudentDetail } from "@/api/types";
import { Button } from "@/components/button";
import { Select } from "@/components/select";
import { Badge, Card, Divider, Loading, Notice, type Tone } from "@/components/surface";
import { Text } from "@/components/text";
import { ExcelButton } from "@/features/files/excel-button";
import { dayAsDate } from "@/lib/days";
import { errorText, useDate, useMoney, useTranslations } from "@/lib/i18n";
import { can, useMe } from "@/lib/session";
import { space } from "@/lib/theme";

import { useOpenSite } from "./site-paths";
import { AdjustmentSheet, Adjustments, LegacyPayments, RefundSheet } from "./student-money";

const FISCAL_TONE: Record<"PENDING" | "ISSUED" | "FAILED", Tone> = {
  PENDING: "neutral",
  ISSUED: "success",
  FAILED: "destructive",
};

/**
 * A student's payments on their page (A-231), newest first: the sum, how and
 * when it was paid, the group and the month it was for, who took it. A refund
 * taken from a payment is written under its sum.
 *
 * With A-241 the section is the site's whole "Payment history": one group's
 * payments, the receipt to print (on the site), the fiscal receipt's state
 * with another try after a failure, **Refund** and **Adjust balance** for the
 * people who may, and under the payments the opening balances and
 * corrections and the payments of the system before.
 */
export function StudentPayments({ student }: { student: StudentDetail }) {
  const t = useTranslations();
  const th = useTranslations("payments.history");
  const td = useTranslations("students.detail");
  const me = useMe();
  const money = useMoney();
  const date = useDate();
  const site = useOpenSite();
  const query = useStudentPayments(student.id);
  const options = usePaymentOptions();
  const fiscal = useRetryFiscal();
  const [groupId, setGroupId] = useState<string | null>(null);
  const [sheet, setSheet] = useState<null | "refund" | "adjust">(null);
  const mayRefund = can(me, "payments.refund");
  const mayAdjust = can(me, "payments.create") && student.groups.length > 0;
  const offersRefund = mayRefund && options.data?.refundsEnabled === true;

  const all = query.data?.items ?? [];
  const rows = groupId ? all.filter((p) => p.groupId === groupId) : all;
  const total = rows.reduce((sum, p) => sum + p.amount - p.refunded, 0);
  // One group's payments are asked for only where there is more than one group to tell apart.
  const groups = [...new Map(student.groups.map((g) => [g.groupId, g.groupName])).entries()];

  return (
    <View style={styles.block} testID="student-payments-section">
      {offersRefund || mayAdjust ? (
        <View style={styles.actions}>
          {offersRefund ? (
            <Button
              compact
              variant="outline"
              label={td("refund")}
              onPress={() => setSheet("refund")}
              testID="student-refund"
            />
          ) : null}
          {mayAdjust ? (
            <Button
              compact
              variant="outline"
              label={td("adjust")}
              onPress={() => setSheet("adjust")}
              testID="student-adjust"
            />
          ) : null}
        </View>
      ) : null}
      {groups.length > 1 ? (
        <Select
          compact
          label={th("group")}
          value={groupId}
          onChange={setGroupId}
          placeholder={td("allGroups")}
          clearLabel={td("allGroups")}
          options={groups.map(([value, label]) => ({ value, label }))}
          testID="student-payments-group"
        />
      ) : null}
      {query.error ? <Notice tone="destructive">{errorText(t, query.error)}</Notice> : null}
      {!query.data && !query.error ? <Loading /> : null}
      {query.data && rows.length === 0 ? (
        <Text tone="mutedForeground" testID="student-payments-empty">
          {th("empty")}
        </Text>
      ) : null}
      {rows.length > 0 ? (
        <View style={styles.block} testID="student-payments">
          <Card style={styles.flush}>
            {rows.map((p, index) => (
              <View key={p.id}>
                {index > 0 ? <Divider /> : null}
                <View style={styles.row} testID={`payment-${p.id}`}>
                  <View style={styles.fill}>
                    <Text variant="bodyStrong">
                      {date(dayAsDate(p.paidAt.slice(0, 10)), { dateStyle: "medium" })}
                    </Text>
                    <Text variant="small" tone="mutedForeground">
                      {[
                        p.groupName,
                        `${th("month")}: ${date(dayAsDate(p.effectiveMonth.slice(0, 10)), {
                          month: "short",
                          year: "numeric",
                        })}`,
                      ].join(", ")}
                    </Text>
                    <Text variant="small" tone="mutedForeground">
                      {[p.methodName, p.receivedByName].filter(Boolean).join(", ")}
                    </Text>
                    {p.comment ? (
                      <Text variant="small" tone="mutedForeground">
                        {p.comment}
                      </Text>
                    ) : null}
                    <View style={styles.actions}>
                      <Button
                        compact
                        variant="ghost"
                        label={th("receipt")}
                        onPress={() => site.open(`/payments/${p.id}/receipt`)}
                        testID={`payment-receipt-${p.id}`}
                      />
                      {p.fiscal ? (
                        <View style={styles.fiscal}>
                          <Badge
                            tone={FISCAL_TONE[p.fiscal.status]}
                            label={`${th("fiscal")}: ${th(`fiscalStatus.${p.fiscal.status}`)}`}
                            testID={`payment-fiscal-${p.id}`}
                          />
                          {p.fiscal.status === "FAILED" && can(me, "payments.create") ? (
                            <Button
                              compact
                              variant="ghost"
                              label={t("common.retry")}
                              loading={fiscal.isPending && fiscal.variables === p.id}
                              onPress={() => fiscal.mutate(p.id)}
                              testID={`payment-fiscal-retry-${p.id}`}
                            />
                          ) : null}
                        </View>
                      ) : null}
                    </View>
                  </View>
                  <View style={styles.end}>
                    <Text variant="figure" style={styles.number}>
                      {money(p.amount)}
                    </Text>
                    {p.refunded > 0 ? (
                      <Text variant="small" tone="destructive">
                        {th("refunded")}: {money(p.refunded)}
                      </Text>
                    ) : null}
                  </View>
                </View>
              </View>
            ))}
          </Card>
          <Text variant="smallStrong" style={styles.total} testID="student-payments-total">
            {th("total", { amount: money(total) })}
          </Text>
          <ExcelButton
            compact
            path="/payments/export.xlsx"
            params={{ studentId: student.id, groupId }}
            label={th("excel")}
            testID="student-payments-excel"
          />
        </View>
      ) : null}
      {fiscal.error || site.error ? (
        <Notice tone="destructive" testID="student-payments-problem">
          {fiscal.error ? errorText(t, fiscal.error) : site.error}
        </Notice>
      ) : null}
      <Adjustments studentId={student.id} mayRemove={mayRefund} />
      <LegacyPayments studentId={student.id} mayRemove={mayRefund} />
      <RefundSheet open={sheet === "refund"} onClose={() => setSheet(null)} payments={all} />
      <AdjustmentSheet open={sheet === "adjust"} onClose={() => setSheet(null)} student={student} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  end: { alignItems: "flex-end" },
  block: { gap: space[2] },
  actions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space[2] },
  fiscal: { flexDirection: "row", alignItems: "center", gap: space[1] },
  flush: { padding: 0, gap: 0, overflow: "hidden" },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space[3],
    paddingHorizontal: space[4],
    paddingVertical: space[3],
  },
  number: { fontVariant: ["tabular-nums"] },
  total: { textAlign: "right" },
});
