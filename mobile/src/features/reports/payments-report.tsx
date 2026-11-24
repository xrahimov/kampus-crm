import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { PAYMENT_KPIS, usePaymentsReport, type PaymentKpi } from "@/api/office-reports";
import { Header } from "@/components/header";
import { Card, EmptyState, Screen, Segmented } from "@/components/surface";
import { Text } from "@/components/text";
import { PendingScreen } from "@/features/shared/pending-screen";
import { useMoney, useTranslations } from "@/lib/i18n";
import { space } from "@/lib/theme";

import { ReportExcel, Filters, Kpis, PeriodFilters, Rows, Stats, useReportPeriod } from "./parts";

const TABS = ["teachers", "staff"] as const;
type Tab = (typeof TABS)[number];

/**
 * Reports, Payments (A-238): the month's payments in six figures, each against
 * the month before, then what the students of each teacher paid and owe, or
 * what each staff member took in.
 */
export function PaymentsReportScreen() {
  const t = useTranslations("reports.payments");
  const money = useMoney();
  const state = useReportPeriod();
  const [tab, setTab] = useState<Tab>("teachers");
  const query = usePaymentsReport(state.period);

  const header = <Header back title={t("title")} />;
  if (!query.data) return <PendingScreen header={header} query={query} />;
  const report = query.data;
  const hint = (key: PaymentKpi): string | null => {
    const count = report.kpis[key].count;
    if (key === "bonus") return null;
    if (key === "discounts") return t("kpis.countDiscounts", { count });
    if (key === "refunds") return t("kpis.countRefunds", { count });
    return t("kpis.countPayments", { count });
  };

  return (
    <Screen header={header} onRefresh={() => void query.refetch()} refreshing={query.isRefetching}>
      <Filters testID="report-filters">
        <PeriodFilters state={state} />
      </Filters>
      <Kpis
        columns={3}
        items={PAYMENT_KPIS.map((key) => ({
          key,
          label: t(`kpis.${key}`),
          value: money(report.kpis[key].value),
          hint: hint(key),
          change: report.kpis[key].change,
        }))}
      />
      <Segmented
        options={TABS.map((value) => ({ value, label: t(`tabs.${value}`) }))}
        value={tab}
        onChange={setTab}
        testID="payments-tab"
      />
      {tab === "teachers" ? (
        report.teachers.length === 0 ? (
          <EmptyState title={t("emptyTeachers")} />
        ) : (
          <Rows testID="payments-teachers">
            {report.teachers.map((row) => (
              <Card key={row.userId} style={styles.card} testID={`payments-teacher-${row.userId}`}>
                <View>
                  <Text variant="bodyStrong">{row.fullName}</Text>
                  {row.courses.length > 0 ? (
                    <Text variant="small" tone="mutedForeground">
                      {row.courses.join(", ")}
                    </Text>
                  ) : null}
                </View>
                <Stats
                  columns={2}
                  items={[
                    { label: t("columns.groups"), value: String(row.groupsCount) },
                    { label: t("columns.students"), value: String(row.studentsCount) },
                    { label: t("columns.total"), value: money(row.totalPayments) },
                    {
                      label: t("columns.debt"),
                      value: row.debt > 0 ? money(row.debt) : "—",
                      tone: row.debt > 0 ? "destructive" : "foreground",
                    },
                  ]}
                />
              </Card>
            ))}
          </Rows>
        )
      ) : report.staff.length === 0 ? (
        <EmptyState title={t("emptyStaff")} />
      ) : (
        <Rows testID="payments-staff">
          {report.staff.map((row) => (
            <Card key={row.userId} style={styles.card} testID={`payments-staff-${row.userId}`}>
              <View>
                <Text variant="bodyStrong">{row.fullName}</Text>
                {row.roles.length > 0 ? (
                  <Text variant="small" tone="mutedForeground">
                    {row.roles.join(", ")}
                  </Text>
                ) : null}
              </View>
              <Stats
                columns={2}
                items={[
                  { label: t("columns.paymentsCount"), value: String(row.paymentsCount) },
                  { label: t("columns.total"), value: money(row.totalPayments) },
                  {
                    label: t("columns.refunds"),
                    value: row.refunds > 0 ? money(row.refunds) : "—",
                  },
                ]}
              />
            </Card>
          ))}
        </Rows>
      )}
      <ReportExcel path="/reports/payments/export.xlsx" params={{ ...state.period, tab }} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { flex: 1, gap: space[3] },
});
