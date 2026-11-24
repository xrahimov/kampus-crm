import { useRouter } from "expo-router";
import { Plus } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import {
  EXAM_STATUSES,
  useExamList,
  useExamOptions,
  type Exam,
  type ExamType,
} from "@/api/office-exams";
import type { ExamStatus } from "@/api/types";
import { Button } from "@/components/button";
import { DateField } from "@/components/date-field";
import { Header } from "@/components/header";
import { Select } from "@/components/select";
import { Badge, Card, EmptyState, Notice, Screen, Segmented } from "@/components/surface";
import { Text } from "@/components/text";
import { PendingScreen } from "@/features/shared/pending-screen";
import { ApiError } from "@/lib/api";
import { dayAsDate } from "@/lib/days";
import { useDate, useMoney, useTranslations } from "@/lib/i18n";
import { useLayout } from "@/lib/layout";
import { can, useMe } from "@/lib/session";
import { space, useTheme } from "@/lib/theme";

import { ExamFormSheet } from "./exam-form";

/**
 * The centre's exams (A-235): the site's Exams page. Group exams and mock
 * exams as two lists with their counts, the site's filters (status, group,
 * from, to) and "Add exam". An exam opens its own page, where it is changed,
 * finished and graded.
 */
export function ExamsScreen() {
  const t = useTranslations();
  const tf = useTranslations("exams.filters");
  const me = useMe();
  const router = useRouter();
  const { wide } = useLayout();
  const { colors } = useTheme();
  const [type, setType] = useState<ExamType>("GROUP");
  const [status, setStatus] = useState<ExamStatus | "ALL">("NOT_STARTED");
  const [groupId, setGroupId] = useState<string | null>(null);
  const [from, setFrom] = useState<string | null>(null);
  const [to, setTo] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const query = useExamList({ type, status, groupId, from, to });
  const options = useExamOptions();

  const header = (
    <Header
      back
      title={t("exams.title")}
      right={
        can(me, "exams.create") ? (
          <Button
            compact
            icon={<Plus size={16} color={colors.primaryForeground} />}
            label={t("exams.add")}
            onPress={() => setAdding(true)}
            testID="exams-add"
          />
        ) : undefined
      }
    />
  );
  // A centre may keep the exam schedule from its teachers; the page says so.
  if (query.error instanceof ApiError && query.error.status === 403) {
    return (
      <Screen header={header}>
        <Notice testID="exams-hidden">{t("exams.hidden")}</Notice>
      </Screen>
    );
  }
  if (!query.data) return <PendingScreen header={header} query={query} />;
  const { items, counts } = query.data;

  return (
    <Screen header={header} onRefresh={() => void query.refetch()} refreshing={query.isRefetching}>
      <Segmented
        options={[
          { value: "GROUP" as const, label: `${t("exams.tabs.GROUP")} ${counts.GROUP}` },
          { value: "MOCK" as const, label: `${t("exams.tabs.MOCK")} ${counts.MOCK}` },
        ]}
        value={type}
        onChange={setType}
        testID="exams-type"
      />
      <View style={styles.filters}>
        <View style={wide ? styles.quarter : styles.half}>
          <Select
            compact
            label={t("common.status")}
            value={status}
            onChange={(value) => setStatus(value ?? "ALL")}
            options={[
              ...EXAM_STATUSES.map((s) => ({ value: s, label: t(`exams.statuses.${s}`) })),
              { value: "ALL" as const, label: tf("anyStatus") },
            ]}
            testID="exams-status"
          />
        </View>
        <View style={wide ? styles.quarter : styles.half}>
          <Select
            compact
            label={tf("group")}
            value={groupId}
            onChange={setGroupId}
            clearLabel={tf("anyGroup")}
            placeholder={tf("anyGroup")}
            options={(options.data?.groups ?? []).map((g) => ({
              value: g.id,
              label: g.name,
              note: g.courseName,
            }))}
            testID="exams-group"
          />
        </View>
        <View style={wide ? styles.quarter : styles.half}>
          <DateField label={tf("from")} value={from} onChange={setFrom} testID="exams-from" />
        </View>
        <View style={wide ? styles.quarter : styles.half}>
          <DateField label={tf("to")} value={to} onChange={setTo} testID="exams-to" />
        </View>
      </View>
      {items.length === 0 ? (
        <EmptyState title={t("common.nothingFound")} />
      ) : (
        <View style={styles.grid} testID="exams-list">
          {items.map((exam) => (
            <View key={exam.id} style={wide ? styles.cell : styles.full}>
              <ExamCard
                exam={exam}
                onPress={() =>
                  router.push({ pathname: "/staff/exam/[id]", params: { id: exam.id } })
                }
              />
            </View>
          ))}
        </View>
      )}
      <ExamFormSheet open={adding} onClose={() => setAdding(false)} defaultType={type} />
    </Screen>
  );
}

/** "Sat, 5 Dec, 09:00 – 10:00", as an exam's day and time are written everywhere. */
export function useExamWhen(): (exam: Pick<Exam, "date" | "startTime" | "endTime">) => string {
  const date = useDate();
  return (exam) =>
    `${date(dayAsDate(exam.date), { weekday: "short", day: "numeric", month: "short" })}, ${exam.startTime} – ${exam.endTime}`;
}

function ExamCard({ exam, onPress }: { exam: Exam; onPress: () => void }) {
  const t = useTranslations();
  const tc = useTranslations("exams.columns");
  const money = useMoney();
  const when = useExamWhen();
  const mock = exam.type === "MOCK";
  const groups = mock ? exam.groups.map((g) => g.name).join(", ") : exam.groupName;
  return (
    <Card onPress={onPress} style={styles.card} testID={`exam-${exam.id}`}>
      <View style={styles.head}>
        <Text variant="heading" numberOfLines={2} style={styles.fill}>
          {exam.name}
        </Text>
        <Badge
          tone={exam.status === "FINISHED" ? "success" : "neutral"}
          label={t(`exams.statuses.${exam.status}`)}
        />
      </View>
      <Text variant="bodyStrong">{when(exam)}</Text>
      {groups ? (
        <Text numberOfLines={2} testID={`exam-${exam.id}-groups`}>
          {groups}
        </Text>
      ) : null}
      <Text variant="small" tone="mutedForeground">
        {[
          exam.isRetake ? tc("retake") : null,
          exam.examinerName,
          exam.roomName,
          `${tc("passScore")}: ${exam.passScore} / ${exam.maxScore}`,
        ]
          .filter(Boolean)
          .join(", ")}
      </Text>
      <Text variant="small" tone="mutedForeground" testID={`exam-${exam.id}-people`}>
        {mock
          ? [
              `${tc("registrations")}: ${exam.studentCount}${exam.capacity === null ? "" : ` / ${exam.capacity}`}`,
              `${tc("price")}: ${money(exam.price)}`,
            ].join(", ")
          : `${tc("students")}: ${exam.studentCount}`}
      </Text>
    </Card>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  filters: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "flex-end",
    marginHorizontal: -space[1],
    rowGap: space[2],
  },
  half: { width: "50%", paddingHorizontal: space[1] },
  quarter: { width: "25%", paddingHorizontal: space[1] },
  grid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -space[2], rowGap: space[3] },
  full: { width: "100%", paddingHorizontal: space[2] },
  cell: { width: "50%", paddingHorizontal: space[2] },
  card: { flex: 1, gap: space[1] },
  head: { flexDirection: "row", alignItems: "flex-start", gap: space[2] },
});
