import { useLocalSearchParams, useRouter } from "expo-router";
import { Plus } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { useGroup } from "@/api/hooks";
import { useExamResults, useGroupExams } from "@/api/staff-group";
import type { GroupExam } from "@/api/types";
import { Button } from "@/components/button";
import { Header } from "@/components/header";
import { Badge, Card, Divider, EmptyState, Loading, Notice, Screen } from "@/components/surface";
import { Text } from "@/components/text";
import { ExamFormSheet } from "@/features/exams/exam-form";
import { PendingScreen } from "@/features/shared/pending-screen";
import { ApiError } from "@/lib/api";
import { dayAsDate } from "@/lib/days";
import { errorText, useDate, useTranslations } from "@/lib/i18n";
import { can, useMe } from "@/lib/session";
import { space, useTheme } from "@/lib/theme";

/**
 * A group's exams on the teacher's side, in the app (A-219): each exam with
 * its day, time, room and examiner, and under it the scores of this group's
 * students. Whoever may add exams adds one for this group here, and an exam
 * opens its own page, where it is graded (A-235).
 */
export function GroupExamsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTranslations();
  const me = useMe();
  const { colors } = useTheme();
  const group = useGroup(id);
  const query = useGroupExams(id);
  const [adding, setAdding] = useState(false);

  const header = (
    <Header
      back
      title={t("groups.detail.tabs.exams")}
      subtitle={group.data?.name}
      right={
        can(me, "exams.create") ? (
          <Button
            compact
            icon={<Plus size={16} color={colors.primaryForeground} />}
            label={t("exams.add")}
            onPress={() => setAdding(true)}
            testID="group-exam-add"
          />
        ) : undefined
      }
    />
  );
  // A centre may keep the exam schedule from its teachers; the page says so.
  if (query.error instanceof ApiError && query.error.status === 403) {
    return (
      <Screen header={header} contentStyle={styles.column}>
        <Notice testID="exams-hidden">{t("exams.hidden")}</Notice>
      </Screen>
    );
  }
  if (!query.data) return <PendingScreen header={header} query={query} />;

  return (
    <Screen
      header={header}
      onRefresh={() => void query.refetch()}
      refreshing={query.isRefetching}
      contentStyle={styles.column}
    >
      {query.data.length === 0 ? (
        <EmptyState title={t("common.nothingFound")} />
      ) : (
        query.data.map((exam) => (
          <ExamCard key={exam.id} exam={exam} groupName={group.data?.name ?? null} />
        ))
      )}
      <ExamFormSheet open={adding} onClose={() => setAdding(false)} fixedGroupId={id} />
    </Screen>
  );
}

function ExamCard({ exam, groupName }: { exam: GroupExam; groupName: string | null }) {
  const t = useTranslations();
  const formatDate = useDate();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const results = useExamResults(exam.id, open);
  // A mock exam is taken by several groups; this page is about one of them.
  const rows =
    results.data?.rows.filter(
      (row) => exam.type === "GROUP" || groupName === null || row.groupName === groupName,
    ) ?? [];

  return (
    <Card testID={`exam-${exam.id}`}>
      <View style={styles.head}>
        <View style={styles.fill}>
          <Text variant="heading">{exam.name}</Text>
          <Text variant="small" tone="mutedForeground" testID="exam-when">
            {[
              formatDate(dayAsDate(exam.date), {
                weekday: "short",
                day: "numeric",
                month: "short",
              }),
              `${exam.startTime} – ${exam.endTime}`,
              exam.roomName,
            ]
              .filter(Boolean)
              .join(", ")}
          </Text>
        </View>
        <Badge
          tone={exam.status === "FINISHED" ? "neutral" : "accent"}
          label={t(`exams.statuses.${exam.status}`)}
          testID="exam-status"
        />
      </View>
      <Text variant="small" tone="mutedForeground" testID="exam-facts">
        {[
          exam.type === "MOCK" ? t("exams.types.MOCK") : null,
          exam.isRetake ? t("exams.columns.retake") : null,
          exam.examinerName ? `${t("exams.columns.examiner")}: ${exam.examinerName}` : null,
          `${t("exams.columns.passScore")}: ${exam.passScore}`,
          `${t("exams.columns.maxScore")}: ${exam.maxScore}`,
        ]
          .filter(Boolean)
          .join(", ")}
      </Text>
      <View style={styles.buttons}>
        <Button
          compact
          variant="ghost"
          label={open ? t("mobile.tests.hideResults") : t("mobile.tests.results")}
          onPress={() => setOpen((was) => !was)}
          testID="exam-results"
        />
        <Button
          compact
          variant="outline"
          label={t("mobile.exams.open")}
          onPress={() => router.push({ pathname: "/staff/exam/[id]", params: { id: exam.id } })}
          testID="exam-open"
        />
      </View>
      {open ? (
        results.isLoading ? (
          <Loading />
        ) : !results.data ? (
          <Notice tone="destructive">{errorText(t, results.error)}</Notice>
        ) : rows.length === 0 ? (
          <Text tone="mutedForeground" testID="exam-no-rows">
            {t("exams.results.empty")}
          </Text>
        ) : (
          <View testID="exam-rows">
            {rows.map((row, index) => (
              <View key={row.studentId}>
                {index > 0 ? <Divider /> : null}
                <View style={styles.row} testID={`exam-row-${row.studentId}`}>
                  <View style={styles.fill}>
                    <Text variant="bodyStrong" numberOfLines={1}>
                      {row.fullName}
                    </Text>
                    {row.level || row.comment ? (
                      <Text variant="small" tone="mutedForeground">
                        {[row.level, row.comment].filter(Boolean).join(", ")}
                      </Text>
                    ) : null}
                  </View>
                  {row.score === null ? null : (
                    <Text variant="figure">
                      {row.score}/{exam.maxScore}
                    </Text>
                  )}
                  {!row.isPresent ? (
                    <Badge tone="warning" label={t("exams.results.absent")} />
                  ) : row.passed === null ? (
                    <Badge tone="neutral" label={t("exams.results.notGraded")} />
                  ) : (
                    <Badge
                      tone={row.passed ? "success" : "destructive"}
                      label={row.passed ? t("exams.results.passed") : t("exams.results.failed")}
                    />
                  )}
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
  buttons: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  row: { flexDirection: "row", alignItems: "center", gap: space[3], paddingVertical: space[3] },
});
