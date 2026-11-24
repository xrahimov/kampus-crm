import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { useCallLog, type CallEntry } from "@/api/office-logs";
import type { CallStatus } from "@/api/office-student-page";
import { Header } from "@/components/header";
import { Badge, Card, Divider, Screen, type Tone } from "@/components/surface";
import { Text } from "@/components/text";
import { callLength } from "@/features/office/student-record";
import { Filters, OptionFilter } from "@/features/reports/parts";
import { useDate, useTranslations } from "@/lib/i18n";
import { space } from "@/lib/theme";

import { DayFilters, LogBody, SearchField, useLogDays, useLogSearch } from "./log-parts";

type Direction = CallEntry["direction"];
const DIRECTIONS: Direction[] = ["INBOUND", "OUTBOUND"];
const STATUSES: CallStatus[] = ["ANSWERED", "MISSED", "BUSY", "FAILED"];
const TONE: Record<CallStatus, Tone> = {
  ANSWERED: "success",
  MISSED: "destructive",
  BUSY: "neutral",
  FAILED: "neutral",
};

/**
 * Calls (A-246): the site's Settings → Calls. The calls the centre's
 * telephony recorded, newest first: when, which way, between which numbers,
 * with which student and staff member, how long, and how it ended. Pulling
 * the list down asks for it again (the site's Refresh).
 */
export function CallsScreen() {
  const t = useTranslations();
  const tc = useTranslations("calls");
  const date = useDate();
  const router = useRouter();
  const search = useLogSearch();
  const days = useLogDays();
  const [direction, setDirection] = useState<Direction | null>(null);
  const [status, setStatus] = useState<CallStatus | null>(null);
  const query = useCallLog({ ...days.days, direction, status, q: search.q });
  return (
    <Screen
      header={<Header back title={tc("title")} />}
      onRefresh={() => void query.refetch()}
      refreshing={query.isRefetching && !query.isFetchingNextPage}
    >
      <Text variant="small" tone="mutedForeground">
        {tc("description")}
      </Text>
      <SearchField state={search} label={t("mobile.office.searchLabel")} testID="calls-search" />
      <Filters testID="calls-filters">
        <OptionFilter<Direction>
          label={tc("columns.direction")}
          value={direction}
          onChange={setDirection}
          options={DIRECTIONS.map((value) => ({ value, label: tc(`directions.${value}`) }))}
          allLabel={tc("all")}
          testID="calls-direction"
        />
        <OptionFilter<CallStatus>
          label={t("common.status")}
          value={status}
          onChange={setStatus}
          options={STATUSES.map((value) => ({ value, label: tc(`statuses.${value}`) }))}
          allLabel={tc("all")}
          testID="calls-status"
        />
      </Filters>
      <DayFilters state={days} testID="calls" />
      <LogBody<CallEntry> query={query} empty={tc("empty")} testID="calls">
        {(rows) => (
          <Card style={styles.flush}>
            {rows.map((row, index) => {
              const studentId = row.studentId;
              return (
                <View key={row.id}>
                  {index > 0 ? <Divider /> : null}
                  <View style={styles.row} testID={`call-${row.id}`}>
                    <View style={styles.fill}>
                      <Text variant="bodyStrong">
                        {date(new Date(row.startedAt), { dateStyle: "medium", timeStyle: "short" })}
                      </Text>
                      <Text variant="small" tone="mutedForeground" style={styles.number}>
                        {tc(`directions.${row.direction}`)}, {row.fromPhone} → {row.toPhone}
                      </Text>
                      {studentId && row.studentName ? (
                        <Pressable
                          accessibilityRole="link"
                          onPress={() =>
                            router.push({
                              pathname: "/staff/student/[id]",
                              params: { id: studentId },
                            })
                          }
                          testID={`call-student-${row.id}`}
                        >
                          <Text tone="primary" numberOfLines={1}>
                            {row.studentName}
                          </Text>
                        </Pressable>
                      ) : null}
                      <Text variant="small" tone="mutedForeground" style={styles.number}>
                        {[
                          row.staffName,
                          `${tc("columns.duration")} ${callLength(row.durationSeconds)}`,
                        ]
                          .filter(Boolean)
                          .join(", ")}
                      </Text>
                    </View>
                    <Badge tone={TONE[row.status]} label={tc(`statuses.${row.status}`)} />
                  </View>
                </View>
              );
            })}
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
    alignItems: "flex-start",
    gap: space[3],
    paddingHorizontal: space[4],
    paddingVertical: space[3],
  },
  number: { fontVariant: ["tabular-nums"] },
});
