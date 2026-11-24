import { StyleSheet, View } from "react-native";

import { reportQuery, useReferralsReport } from "@/api/office-reports";
import { Header } from "@/components/header";
import { Badge, Card, Screen } from "@/components/surface";
import { Text } from "@/components/text";
import { useMonthName } from "@/features/finance/period";
import { PendingScreen } from "@/features/shared/pending-screen";
import { dayAsDate } from "@/lib/days";
import { useDate, useMoney, useTranslations } from "@/lib/i18n";
import { space } from "@/lib/theme";

import {
  ExcelOnSite,
  Filters,
  Kpis,
  PeriodFilters,
  Rows,
  Section,
  SeriesBars,
  Stats,
  useReportPeriod,
} from "./parts";

/**
 * Reports, Referral programme (A-238): who brought whom this month and what it
 * earned them, with the year's invites by month.
 */
export function ReferralsReportScreen() {
  const t = useTranslations("reports.referrals");
  const money = useMoney();
  const date = useDate();
  const monthName = useMonthName();
  const state = useReportPeriod();
  const query = useReferralsReport(state.period);

  const header = <Header back title={t("title")} />;
  if (!query.data) return <PendingScreen header={header} query={query} />;
  const report = query.data;
  const k = report.kpis;

  return (
    <Screen header={header} onRefresh={() => void query.refetch()} refreshing={query.isRefetching}>
      <Filters testID="report-filters">
        <PeriodFilters state={state} />
      </Filters>
      <Kpis
        items={[
          { key: "leads", label: t("kpis.leads"), value: String(k.leads) },
          { key: "joined", label: t("kpis.joined"), value: String(k.joined) },
          { key: "coins", label: t("kpis.coins"), value: String(k.coins) },
          { key: "bonus", label: t("kpis.bonus"), value: money(k.bonus) },
        ]}
      />
      <Section title={t("byMonthTitle", { year: report.year })}>
        <SeriesBars
          steps={report.byMonth.map((m, index) => ({
            label: monthName(index + 1),
            name: monthName(index + 1, report.year),
            values: [m.leads, m.joined],
          }))}
          series={[t("series.leads"), t("series.joined")]}
          initial={report.month - 1}
          empty={t("noData")}
          testID="referrals-months"
        />
      </Section>

      <View style={styles.between}>
        <Text variant="heading" accessibilityRole="header" style={styles.fill}>
          {t("referrersTitle")}
        </Text>
        <Badge label={`${t("kpis.referrers")}: ${k.referrers}`} testID="referrals-referrers" />
      </View>
      {report.rows.length === 0 ? (
        <Text tone="mutedForeground">{t("noData")}</Text>
      ) : (
        <Rows testID="referrals-who-invited">
          {report.rows.map((row) => (
            <Card key={row.studentId} style={styles.card} testID={`referrer-${row.studentId}`}>
              <Text variant="bodyStrong">{row.fullName}</Text>
              <Stats
                items={[
                  { label: t("columns.leads"), value: String(row.leads) },
                  { label: t("columns.joined"), value: String(row.joined) },
                  { label: t("columns.coins"), value: String(row.coins) },
                  { label: t("columns.bonus"), value: row.bonus > 0 ? money(row.bonus) : "—" },
                ]}
              />
            </Card>
          ))}
        </Rows>
      )}

      <Text variant="heading" accessibilityRole="header">
        {t("referredTitle")}
      </Text>
      {report.referred.length === 0 ? (
        <Text tone="mutedForeground">{t("noData")}</Text>
      ) : (
        <Rows testID="referrals-invited">
          {report.referred.map((row) => (
            <Card
              key={`${row.joined ? "s" : "l"}-${row.id}`}
              style={styles.person}
              testID={`referred-${row.id}`}
            >
              <View style={styles.between}>
                <Text variant="bodyStrong" numberOfLines={2} style={styles.fill}>
                  {row.fullName}
                </Text>
                <Text variant="small" tone="mutedForeground">
                  {date(new Date(row.createdAt), { dateStyle: "medium" })}
                </Text>
              </View>
              {row.phone ? (
                <Text variant="small" tone="mutedForeground">
                  {row.phone}
                </Text>
              ) : null}
              <Text variant="small" tone="mutedForeground">
                {t("columns.invitedBy")}: {row.referrerName}
              </Text>
              <View style={styles.badges}>
                <Badge
                  tone={row.joined ? "success" : "neutral"}
                  label={
                    row.joined
                      ? t("state.joined", {
                          date: row.joinedAt
                            ? date(dayAsDate(row.joinedAt), { dateStyle: "medium" })
                            : "",
                        }).trim()
                      : t("state.lead")
                  }
                />
              </View>
            </Card>
          ))}
        </Rows>
      )}
      <ExcelOnSite path={`/reports/referrals${reportQuery({ ...state.period })}`} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  between: { flexDirection: "row", alignItems: "flex-start", gap: space[2] },
  badges: { flexDirection: "row", flexWrap: "wrap" },
  card: { flex: 1, gap: space[3] },
  person: { flex: 1, gap: space[1] },
});
