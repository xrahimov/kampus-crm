import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { useLoginLog, type LoginRow } from "@/api/office-logs";
import { Header } from "@/components/header";
import { Badge, Card, Divider, Screen } from "@/components/surface";
import { Text } from "@/components/text";
import { Filters, OptionFilter } from "@/features/reports/parts";
import { useDate, useTranslations } from "@/lib/i18n";
import { space } from "@/lib/theme";

import { DayFilters, LogBody, SearchField, rowsOf, useLogDays, useLogSearch } from "./log-parts";

type Outcome = "true" | "false";

/**
 * Login log (A-246): the site's Settings → Login log. Who signed in and when,
 * and the attempts that failed, newest first; narrowed by a name or a phone,
 * by the outcome and by days.
 */
export function LoginLogScreen() {
  const t = useTranslations();
  const tl = useTranslations("logs.logins");
  const date = useDate();
  const search = useLogSearch();
  const days = useLogDays();
  const [success, setSuccess] = useState<Outcome | null>(null);
  const query = useLoginLog({ ...days.days, success, q: search.q });
  const { total } = rowsOf(query.data);
  return (
    <Screen
      header={
        <Header
          back
          title={query.data ? tl("title", { count: total }) : t("settings.nav.logins")}
        />
      }
      onRefresh={() => void query.refetch()}
      refreshing={query.isRefetching && !query.isFetchingNextPage}
    >
      <Text variant="small" tone="mutedForeground">
        {tl("description")}
      </Text>
      <SearchField state={search} label={t("mobile.office.searchLabel")} testID="logins-search" />
      <Filters testID="logins-filters">
        <OptionFilter<Outcome>
          label={tl("outcome")}
          value={success}
          onChange={setSuccess}
          options={[
            { value: "true", label: tl("success") },
            { value: "false", label: tl("failure") },
          ]}
          allLabel={tl("all")}
          testID="logins-outcome"
        />
      </Filters>
      <DayFilters state={days} testID="logins" />
      <LogBody<LoginRow> query={query} empty={tl("empty")} testID="logins">
        {(rows) => (
          <Card style={styles.flush}>
            {rows.map((row, index) => (
              <View key={row.id}>
                {index > 0 ? <Divider /> : null}
                <View style={styles.row} testID={`login-${row.id}`}>
                  <View style={styles.fill}>
                    <Text variant="bodyStrong" numberOfLines={1}>
                      {row.userName ?? row.phone}
                    </Text>
                    {row.userName ? (
                      <Text variant="small" tone="mutedForeground" style={styles.number}>
                        {row.phone}
                      </Text>
                    ) : null}
                    <Text variant="small" tone="mutedForeground" style={styles.number}>
                      {[
                        date(new Date(row.createdAt), { dateStyle: "medium", timeStyle: "short" }),
                        row.ip ? `${tl("columns.ip")} ${row.ip}` : null,
                      ]
                        .filter(Boolean)
                        .join(", ")}
                    </Text>
                  </View>
                  <Badge
                    tone={row.success ? "success" : "destructive"}
                    label={tl(row.success ? "success" : "failure")}
                  />
                </View>
              </View>
            ))}
          </Card>
        )}
      </LogBody>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  flush: { padding: 0, gap: 0, overflow: "hidden" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingHorizontal: space[4],
    paddingVertical: space[3],
  },
  number: { fontVariant: ["tabular-nums"] },
});
