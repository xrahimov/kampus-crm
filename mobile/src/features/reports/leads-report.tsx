import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { reportQuery, useLeadsReport } from "@/api/office-reports";
import { Header } from "@/components/header";
import { Card, Screen } from "@/components/surface";
import { Text } from "@/components/text";
import { useMonthName } from "@/features/finance/period";
import { PendingScreen } from "@/features/shared/pending-screen";
import { useTranslations } from "@/lib/i18n";
import { space } from "@/lib/theme";

import {
  CountBars,
  ExcelOnSite,
  Filters,
  Kpis,
  OptionFilter,
  Pair,
  PeriodFilters,
  Rows,
  Section,
  SeriesBars,
  Stats,
  useReportPeriod,
} from "./parts";

/**
 * Reports, Lead statements (A-238): the month's new leads and what became of
 * them, the year by months, where leads come from and for which course, and
 * the trial lessons of each source.
 */
export function LeadsReportScreen() {
  const t = useTranslations("reports.leads");
  const tf = useTranslations("reports.filters");
  const monthName = useMonthName();
  const state = useReportPeriod();
  const [sourceId, setSource] = useState<string | null>(null);
  const query = useLeadsReport(state.period, sourceId);

  const header = <Header back title={t("title")} />;
  if (!query.data) return <PendingScreen header={header} query={query} />;
  const report = query.data;
  const k = report.kpis;

  return (
    <Screen header={header} onRefresh={() => void query.refetch()} refreshing={query.isRefetching}>
      <Filters testID="report-filters">
        <PeriodFilters state={state} />
        <OptionFilter
          label={tf("source")}
          value={sourceId}
          onChange={setSource}
          options={report.sources.map((s) => ({ value: s.id, label: s.name }))}
          testID="leads-source"
        />
      </Filters>
      <Kpis
        items={[
          { key: "newLeads", label: t("kpis.newLeads"), value: String(k.newLeads) },
          { key: "conversions", label: t("kpis.conversions"), value: String(k.conversions) },
          { key: "lost", label: t("kpis.lost"), value: String(k.lost) },
          {
            key: "bestSource",
            label: t("kpis.bestSource"),
            value: k.bestSource?.name ?? "—",
            hint: k.bestSource ? t("kpis.leadsCount", { count: k.bestSource.count }) : null,
          },
          { key: "trials", label: t("kpis.trials"), value: String(k.trials) },
          {
            key: "trialsAttended",
            label: t("kpis.trialsAttended"),
            value: String(k.trialsAttended),
          },
          {
            key: "bestSalesperson",
            label: t("kpis.bestSalesperson"),
            value: k.bestSalesperson?.name ?? "—",
            hint: k.bestSalesperson
              ? t("kpis.conversionsCount", { count: k.bestSalesperson.count })
              : null,
          },
        ]}
      />
      <Pair>
        <Section title={t("funnelTitle")}>
          <CountBars
            items={report.funnel.map((f) => ({ name: t(`funnel.${f.stage}`), count: f.count }))}
            empty={t("noData")}
            testID="leads-funnel"
          />
        </Section>
        <Section title={t("byMonthTitle", { year: report.year })}>
          <SeriesBars
            steps={report.byMonth.map((m, index) => ({
              label: monthName(index + 1),
              name: monthName(index + 1, report.year),
              values: [m.created, m.converted, m.lost],
            }))}
            series={[t("series.created"), t("series.converted"), t("series.lost")]}
            initial={report.month - 1}
            empty={t("noData")}
            testID="leads-months"
          />
        </Section>
      </Pair>
      <Pair>
        <Section title={t("byCourseTitle")}>
          <CountBars items={report.byCourse} empty={t("noData")} testID="leads-by-course" />
        </Section>
        <Section title={t("bySourceTitle")}>
          <CountBars items={report.bySource} empty={t("noData")} testID="leads-by-source" />
        </Section>
      </Pair>
      <View style={styles.title}>
        <Text variant="heading" accessibilityRole="header">
          {t("trialsTitle")}
        </Text>
        <Text variant="small" tone="mutedForeground">
          {t("trialsHint")}
        </Text>
      </View>
      {report.trialsBySource.length === 0 ? (
        <Text tone="mutedForeground" testID="leads-trials-empty">
          {t("trialsEmpty")}
        </Text>
      ) : (
        <Rows testID="leads-trials">
          {report.trialsBySource.map((row, index) => (
            <Card key={row.name ?? "none"} style={styles.card} testID={`leads-trials-${index}`}>
              <Text variant="bodyStrong">{row.name ?? t("trialsColumns.noSource")}</Text>
              <Stats
                columns={4}
                items={[
                  { label: t("trialsColumns.leads"), value: String(row.leads) },
                  { label: t("trialsColumns.trials"), value: String(row.trials) },
                  { label: t("trialsColumns.attended"), value: String(row.attended) },
                  { label: t("trialsColumns.converted"), value: String(row.converted) },
                ]}
              />
            </Card>
          ))}
        </Rows>
      )}
      <ExcelOnSite path={`/reports/leads${reportQuery({ ...state.period, sourceId })}`} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { gap: 2 },
  card: { flex: 1, gap: space[3] },
});
