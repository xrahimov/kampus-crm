import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { useCashiers, usePaymentsLog } from "@/api/office-logs";
import { useRetryFiscal } from "@/api/office-student-money";
import { usePaymentOptions, type Payment } from "@/api/office-students";
import { Button } from "@/components/button";
import { Header } from "@/components/header";
import { Badge, Card, Divider, Notice, Screen, type Tone } from "@/components/surface";
import { Text } from "@/components/text";
import { useOpenSite } from "@/features/office/site-paths";
import { Filters, OptionFilter, ReportExcel } from "@/features/reports/parts";
import { dayAsDate } from "@/lib/days";
import { errorText, useDate, useMoney, useTranslations } from "@/lib/i18n";
import { can, useMe } from "@/lib/session";
import { space } from "@/lib/theme";

import { DayFilters, LogBody, useLogDays } from "./log-parts";

const FISCAL_TONE: Record<"PENDING" | "ISSUED" | "FAILED", Tone> = {
  PENDING: "neutral",
  ISSUED: "success",
  FAILED: "destructive",
};

/**
 * Payments (A-246): the site's Settings → Payments. Every payment the centre
 * took, newest first, narrowed by days, the payment method and the cashier,
 * with the sum of all the filters let through. A student's name opens their
 * page; the receipt opens on the site, the Excel file comes to the phone (A-256).
 */
export function PaymentsLogScreen() {
  const t = useTranslations();
  const tl = useTranslations("payments.log");
  const th = useTranslations("payments.history");
  const me = useMe();
  const money = useMoney();
  const date = useDate();
  const router = useRouter();
  const site = useOpenSite();
  const days = useLogDays();
  const [paymentMethodId, setMethod] = useState<string | null>(null);
  const [receivedById, setCashier] = useState<string | null>(null);
  const options = usePaymentOptions();
  const cashiers = useCashiers(can(me, "staff.view"));
  const fiscal = useRetryFiscal();
  const query = usePaymentsLog({ ...days.days, paymentMethodId, receivedById });
  const total = query.data?.pages[0]?.totalAmount;
  return (
    <Screen
      header={<Header back title={tl("title")} />}
      onRefresh={() => void query.refetch()}
      refreshing={query.isRefetching && !query.isFetchingNextPage}
    >
      <Text variant="small" tone="mutedForeground">
        {tl("description")}
      </Text>
      <DayFilters state={days} testID="payments-log" />
      {options.data || cashiers.data ? (
        <Filters testID="payments-log-filters">
          {options.data ? (
            <OptionFilter
              label={tl("method")}
              value={paymentMethodId}
              onChange={setMethod}
              options={options.data.methods.map((one) => ({ value: one.id, label: one.name }))}
              allLabel={tl("all")}
              testID="payments-log-method"
            />
          ) : null}
          {cashiers.data ? (
            <OptionFilter
              label={tl("cashier")}
              value={receivedById}
              onChange={setCashier}
              options={cashiers.data.map((one) => ({ value: one.id, label: one.fullName }))}
              allLabel={tl("all")}
              testID="payments-log-cashier"
            />
          ) : null}
        </Filters>
      ) : null}
      {total !== undefined ? (
        <Text variant="bodyStrong" style={styles.number} testID="payments-log-total">
          {th("total", { amount: money(total) })}
        </Text>
      ) : null}
      {fiscal.error || site.error ? (
        <Notice tone="destructive" testID="payments-log-problem">
          {fiscal.error ? errorText(t, fiscal.error) : site.error}
        </Notice>
      ) : null}
      <LogBody<Payment> query={query} empty={th("empty")} testID="payments-log">
        {(rows) => (
          <Card style={styles.flush}>
            {rows.map((p, index) => (
              <View key={p.id}>
                {index > 0 ? <Divider /> : null}
                <View style={styles.row} testID={`payment-${p.id}`}>
                  <View style={styles.fill}>
                    <Pressable
                      accessibilityRole="link"
                      onPress={() =>
                        router.push({
                          pathname: "/staff/student/[id]",
                          params: { id: p.studentId },
                        })
                      }
                      testID={`payment-student-${p.id}`}
                    >
                      <Text variant="bodyStrong" tone="primary" numberOfLines={1}>
                        {p.studentName}
                      </Text>
                    </Pressable>
                    <Text variant="small" tone="mutedForeground">
                      {[
                        date(dayAsDate(p.paidAt.slice(0, 10)), { dateStyle: "medium" }),
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
                        <>
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
                        </>
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
                    {p.bonus > 0 ? (
                      <Text variant="small" tone="mutedForeground">
                        {th("bonus")}: {money(p.bonus)}
                      </Text>
                    ) : null}
                  </View>
                </View>
              </View>
            ))}
          </Card>
        )}
      </LogBody>
      <ReportExcel
        path="/payments/export.xlsx"
        params={{ ...days.days, paymentMethodId, receivedById }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  end: { alignItems: "flex-end" },
  flush: { padding: 0, gap: 0, overflow: "hidden" },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space[3],
    paddingHorizontal: space[4],
    paddingVertical: space[3],
  },
  actions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space[2] },
  number: { fontVariant: ["tabular-nums"] },
});
