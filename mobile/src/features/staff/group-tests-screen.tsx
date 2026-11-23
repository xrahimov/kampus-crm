import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { useGroup } from "@/api/hooks";
import { useGroupTests, useTestDetail } from "@/api/staff-group";
import type { GroupTest, TestStatus } from "@/api/types";
import { Button } from "@/components/button";
import { Header } from "@/components/header";
import {
  Badge,
  Card,
  Divider,
  EmptyState,
  Loading,
  Notice,
  Screen,
  type Tone,
} from "@/components/surface";
import { Text } from "@/components/text";
import { PendingScreen } from "@/features/shared/pending-screen";
import { dayAsDate } from "@/lib/days";
import { errorText, useDate, useTranslations } from "@/lib/i18n";
import { space } from "@/lib/theme";

const STATUS_TONE: Record<TestStatus, Tone> = {
  DRAFT: "neutral",
  ACTIVE: "success",
  CLOSED: "neutral",
};

/**
 * The tests given to a group, on the teacher's side, in the app (A-218):
 * each test with how many handed it in and how well, and under it the
 * results of this group's students. Tests are written on the site.
 */
export function GroupTestsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTranslations();
  const group = useGroup(id);
  const query = useGroupTests(id);

  const header = <Header back title={t("groups.detail.tabs.tests")} subtitle={group.data?.name} />;
  if (!query.data) return <PendingScreen header={header} query={query} />;

  return (
    <Screen
      header={header}
      onRefresh={() => void query.refetch()}
      refreshing={query.isRefetching}
      contentStyle={styles.column}
    >
      {query.data.length === 0 ? (
        <EmptyState title={t("tests.groupTab.empty")} text={t("mobile.tests.madeOnSite")} />
      ) : (
        query.data.map((test) => (
          <TestCard key={test.id} test={test} groupName={group.data?.name ?? null} />
        ))
      )}
    </Screen>
  );
}

function TestCard({ test, groupName }: { test: GroupTest; groupName: string | null }) {
  const t = useTranslations();
  const formatDate = useDate();
  const [open, setOpen] = useState(false);
  const detail = useTestDetail(test.id, open);
  // A test can be given to several groups; this page is about one of them.
  const attempts =
    detail.data?.attempts.filter((a) => groupName === null || a.groupName === groupName) ?? [];

  return (
    <Card testID={`test-${test.id}`}>
      <View style={styles.head}>
        <View style={styles.fill}>
          <Text variant="heading">{test.name}</Text>
          <Text variant="small" tone="mutedForeground">
            {[
              test.subject,
              `${t("tests.columns.questions")}: ${test.questionCount}`,
              t("tests.points", { count: test.totalPoints }),
              test.timeLimitMinutes
                ? t("tests.detail.minutes", { count: test.timeLimitMinutes })
                : null,
            ]
              .filter(Boolean)
              .join(", ")}
          </Text>
        </View>
        <Badge
          tone={STATUS_TONE[test.status]}
          label={t(`tests.statuses.${test.status}`)}
          testID="test-status"
        />
      </View>
      <Text variant="small" tone="mutedForeground" testID="test-summary">
        {[
          `${t("tests.detail.attempts")}: ${test.attemptCount}`,
          test.accuracy === null ? null : `${t("tests.columns.accuracy")}: ${test.accuracy}%`,
          test.deadline
            ? `${t("tests.columns.deadline")}: ${formatDate(dayAsDate(test.deadline), {
                day: "numeric",
                month: "short",
              })}`
            : null,
        ]
          .filter(Boolean)
          .join(", ")}
      </Text>
      <Button
        compact
        variant="ghost"
        label={open ? t("mobile.tests.hideResults") : t("mobile.tests.results")}
        onPress={() => setOpen((was) => !was)}
        style={styles.start}
        testID="test-results"
      />
      {open ? (
        detail.isLoading ? (
          <Loading />
        ) : !detail.data ? (
          <Notice tone="destructive">{errorText(t, detail.error)}</Notice>
        ) : attempts.length === 0 ? (
          <Text tone="mutedForeground" testID="test-no-attempts">
            {t("tests.detail.noAttempts")}
          </Text>
        ) : (
          <View testID="test-attempts">
            {attempts.map((attempt, index) => (
              <View key={attempt.id}>
                {index > 0 ? <Divider /> : null}
                <View style={styles.attempt} testID={`attempt-${attempt.id}`}>
                  <View style={styles.fill}>
                    <Text variant="bodyStrong" numberOfLines={1}>
                      {attempt.studentName}
                    </Text>
                    <Text variant="small" tone="mutedForeground">
                      {formatDate(new Date(attempt.submittedAt), {
                        dateStyle: "medium",
                        timeStyle: "short",
                      })}
                      {attempt.durationSeconds
                        ? `, ${t("tests.detail.minutes", {
                            count: Math.max(1, Math.round(attempt.durationSeconds / 60)),
                          })}`
                        : ""}
                    </Text>
                  </View>
                  <View style={styles.score}>
                    <Text variant="figure">{attempt.percent}%</Text>
                    <Text variant="small" tone="mutedForeground">
                      {attempt.score}/{attempt.maxScore}
                    </Text>
                  </View>
                  <Badge
                    tone={attempt.passed ? "success" : "destructive"}
                    label={attempt.passed ? t("tests.detail.passed") : t("tests.detail.failed")}
                  />
                </View>
              </View>
            ))}
          </View>
        )
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  column: { gap: space[4], maxWidth: 720 },
  head: { flexDirection: "row", alignItems: "flex-start", gap: space[3] },
  start: { alignSelf: "flex-start" },
  attempt: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingVertical: space[3],
  },
  score: { alignItems: "flex-end" },
});
