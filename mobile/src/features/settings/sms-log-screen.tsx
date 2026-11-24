import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { SENT_BY_SYSTEM, useLogActors, useSmsLog, type SmsLogEntry } from "@/api/office-logs";
import type { SmsStatus } from "@/api/office-student-page";
import { Header } from "@/components/header";
import { Badge, Card, Screen, type Tone } from "@/components/surface";
import { Text } from "@/components/text";
import { Filters, OptionFilter } from "@/features/reports/parts";
import { useDate, useTranslations } from "@/lib/i18n";
import { useLayout } from "@/lib/layout";
import { space } from "@/lib/theme";

import { DayFilters, LogBody, SearchField, useLogDays, useLogSearch } from "./log-parts";

const STATUSES: SmsStatus[] = ["QUEUED", "SENT", "FAILED"];
const TONE: Record<SmsStatus, Tone> = { QUEUED: "neutral", SENT: "success", FAILED: "destructive" };

/**
 * Sent SMS (A-246): the site's Settings → Sent SMS. Every message the system
 * or a staff member sent, newest first: who it went to, the text, who sent
 * it, when, and whether it went out. A student's name opens their page.
 */
export function SmsLogScreen() {
  const t = useTranslations();
  const ts = useTranslations("sms");
  const tl = useTranslations("sms.log");
  const date = useDate();
  const router = useRouter();
  const { wide } = useLayout();
  const search = useLogSearch();
  const days = useLogDays();
  const [status, setStatus] = useState<SmsStatus | null>(null);
  const [sentBy, setSentBy] = useState<string | null>(null);
  const senders = useLogActors();
  const query = useSmsLog({ ...days.days, status, sentBy, q: search.q });
  return (
    <Screen
      header={<Header back title={tl("title")} />}
      onRefresh={() => void query.refetch()}
      refreshing={query.isRefetching && !query.isFetchingNextPage}
    >
      <Text variant="small" tone="mutedForeground">
        {tl("description")}
      </Text>
      <SearchField state={search} testID="sms-log-search" />
      <Filters testID="sms-log-filters">
        <OptionFilter<SmsStatus>
          label={tl("columns.status")}
          value={status}
          onChange={setStatus}
          options={STATUSES.map((value) => ({ value, label: ts(`statuses.${value}`) }))}
          allLabel={tl("all")}
          testID="sms-log-status"
        />
        {/* The system is always a choice; the staff come with a server from A-246 on. */}
        <OptionFilter
          label={tl("columns.sentBy")}
          value={sentBy}
          onChange={setSentBy}
          options={[
            { value: SENT_BY_SYSTEM, label: tl("system") },
            ...(senders.data ?? []).map((one) => ({ value: one.id, label: one.fullName })),
          ]}
          allLabel={tl("all")}
          testID="sms-log-sender"
        />
      </Filters>
      <DayFilters state={days} testID="sms-log" />
      <LogBody<SmsLogEntry> query={query} empty={tl("empty")} testID="sms-log">
        {(rows) => (
          <View style={styles.grid}>
            {rows.map((row) => {
              const studentId = row.studentId;
              const who = (
                <Text
                  variant="bodyStrong"
                  tone={studentId ? "primary" : "foreground"}
                  numberOfLines={1}
                >
                  {row.recipientName}
                </Text>
              );
              return (
                <View key={row.id} style={wide ? styles.half : styles.full}>
                  <Card style={styles.card} testID={`sms-log-${row.id}`}>
                    <View style={styles.line}>
                      <View style={styles.fill}>
                        {studentId ? (
                          <Pressable
                            accessibilityRole="link"
                            onPress={() =>
                              router.push({
                                pathname: "/staff/student/[id]",
                                params: { id: studentId },
                              })
                            }
                            testID={`sms-log-student-${row.id}`}
                          >
                            {who}
                          </Pressable>
                        ) : (
                          who
                        )}
                        <Text variant="small" tone="mutedForeground" style={styles.number}>
                          {ts(`recipientTypes.${row.recipientType}`)} {row.phone}
                        </Text>
                      </View>
                      <Badge tone={TONE[row.status]} label={ts(`statuses.${row.status}`)} />
                    </View>
                    <Text>{row.text}</Text>
                    {row.error ? (
                      <Text variant="small" tone="destructive" testID={`sms-log-error-${row.id}`}>
                        {row.error}
                      </Text>
                    ) : null}
                    <Text variant="small" tone="mutedForeground">
                      {[
                        row.sentByName ?? tl("system"),
                        row.event && t.has(`sms.autoEvents.${row.event}`)
                          ? ts(`autoEvents.${row.event}`)
                          : null,
                        date(new Date(row.sentAt ?? row.createdAt), {
                          dateStyle: "medium",
                          timeStyle: "short",
                        }),
                      ]
                        .filter(Boolean)
                        .join(", ")}
                    </Text>
                  </Card>
                </View>
              );
            })}
          </View>
        )}
      </LogBody>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  grid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -space[2], rowGap: space[3] },
  full: { width: "100%", paddingHorizontal: space[2] },
  half: { width: "50%", paddingHorizontal: space[2] },
  card: { flex: 1, gap: space[2] },
  line: { flexDirection: "row", alignItems: "flex-start", gap: space[2] },
  number: { fontVariant: ["tabular-nums"] },
});
