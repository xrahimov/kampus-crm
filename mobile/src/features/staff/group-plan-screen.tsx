import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import { useGroup } from "@/api/hooks";
import { setTopicRelease, staffGroupKeys, useGroupPlan, useGroupProgress } from "@/api/staff-group";
import type { GroupPlan, GroupPlanTopic, GroupProgress, TopicReleaseMode } from "@/api/types";
import { Button } from "@/components/button";
import { Header } from "@/components/header";
import { Badge, Card, EmptyState, Notice, Screen, type Tone } from "@/components/surface";
import { Text } from "@/components/text";
import { PendingScreen } from "@/features/shared/pending-screen";
import { WordChip } from "@/features/student/answer-parts";
import { Meter } from "@/features/student/meter";
import { addDays, dayAsDate } from "@/lib/days";
import { errorText, useDate, useTranslations } from "@/lib/i18n";
import { useLayout } from "@/lib/layout";
import { can, useMe } from "@/lib/session";
import { space } from "@/lib/theme";

/** How many days ahead a topic's opening day can be chosen with one tap. */
const OPEN_DAYS = 14;
const MODES: TopicReleaseMode[] = ["lesson", "now", "date"];
const STATUS_TONE: Record<GroupPlanTopic["status"], Tone> = {
  done: "success",
  next: "accent",
  planned: "neutral",
};

/** Tashkent's day now, as "2026-11-23". */
function today(): string {
  return new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 10);
}

/**
 * A group's course plan on the teacher's side, in the app (A-218): the
 * course's topics with what was covered and what comes next, when the
 * students get each topic's content, and how far each student is.
 */
export function GroupPlanScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTranslations();
  const client = useQueryClient();
  const { wide } = useLayout();
  const me = useMe();
  const group = useGroup(id);
  const query = useGroupPlan(id);
  const progress = useGroupProgress(id);

  const header = (
    <Header back title={t("groups.detail.tabs.syllabus")} subtitle={group.data?.name} />
  );
  if (!query.data) return <PendingScreen header={header} query={query} />;
  const plan = query.data;
  const canSet = can(me, "groups.attendance.mark") && group.data?.status !== "ARCHIVED";

  const put = (topicId: string, release: GroupPlanTopic["release"]) => {
    client.setQueryData<GroupPlan>(staffGroupKeys.plan(id), (old) =>
      old
        ? { ...old, topics: old.topics.map((x) => (x.id === topicId ? { ...x, release } : x)) }
        : old,
    );
    // Whether the content is open today is the server's to say.
    void query.refetch();
  };

  const topics = (
    <View style={styles.block}>
      <View>
        <Text variant="heading" testID="plan-progress">
          {t("groups.syllabus.progress", { done: plan.done, total: plan.total })}
        </Text>
        <Text variant="small" tone="mutedForeground">
          {plan.courseName}
        </Text>
      </View>
      {plan.topics.length === 0 ? (
        <EmptyState title={t("groups.syllabus.empty")} />
      ) : (
        plan.topics.map((topic) => (
          <Topic
            key={topic.id}
            groupId={id}
            topic={topic}
            canSet={canSet}
            onSaved={(release) => put(topic.id, release)}
          />
        ))
      )}
    </View>
  );

  const students = progress.data ? <Students progress={progress.data} /> : null;

  return (
    <Screen
      header={header}
      onRefresh={() => {
        void query.refetch();
        void progress.refetch();
      }}
      refreshing={query.isRefetching || progress.isRefetching}
      contentStyle={wide ? styles.split : styles.column}
    >
      {wide ? (
        <>
          <View style={styles.wideTopics}>{topics}</View>
          <View style={styles.wideStudents}>{students}</View>
        </>
      ) : (
        <>
          {topics}
          {students}
        </>
      )}
    </Screen>
  );
}

function Topic({
  groupId,
  topic,
  canSet,
  onSaved,
}: {
  groupId: string;
  topic: GroupPlanTopic;
  canSet: boolean;
  onSaved: (release: GroupPlanTopic["release"]) => void;
}) {
  const t = useTranslations();
  const formatDate = useDate();
  const router = useRouter();
  const [picking, setPicking] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const day = (iso: string) => formatDate(dayAsDate(iso), { day: "numeric", month: "short" });

  const save = (mode: TopicReleaseMode, date: string | null) => {
    if (busy) return;
    setBusy(true);
    setProblem(null);
    setTopicRelease(groupId, topic.id, { mode, date })
      .then((release) => {
        setPicking(false);
        onSaved(release);
      })
      .catch((error: unknown) => setProblem(errorText(t, error)))
      .finally(() => setBusy(false));
  };
  const start = today();
  const days = Array.from({ length: OPEN_DAYS }, (_, index) => addDays(start, index));
  if (topic.release.date && !days.includes(topic.release.date)) days.unshift(topic.release.date);
  const dated = picking || topic.release.mode === "date";

  return (
    <Card testID={`topic-${topic.id}`}>
      <View style={styles.head}>
        <View style={styles.fill}>
          <Text variant="bodyStrong">
            {topic.sortOrder}. {topic.title}
          </Text>
          {topic.note ? (
            <Text variant="small" tone="mutedForeground">
              {topic.note}
            </Text>
          ) : null}
          {topic.lessonDate ? (
            <Text variant="small" tone="mutedForeground" testID="topic-covered">
              {t("groups.syllabus.coveredOn", { date: day(topic.lessonDate) })}
            </Text>
          ) : null}
        </View>
        <Badge
          tone={STATUS_TONE[topic.status]}
          label={t(`groups.syllabus.status.${topic.status}`)}
          testID="topic-status"
        />
      </View>
      <View style={styles.row}>
        {/* The topic's content, exercises and words, to read or to write (A-263). */}
        <Button
          compact
          variant="outline"
          label={t("groups.syllabus.content.button", { count: topic.blocks })}
          onPress={() => router.push({ pathname: "/staff/topic/[id]", params: { id: topic.id } })}
          testID={`topic-content-${topic.id}`}
        />
        {topic.blocks > 0 && topic.open ? (
          <Badge tone="success" label={t("groups.syllabus.content.openNow")} testID="topic-open" />
        ) : null}
      </View>
      {topic.blocks > 0 ? (
        <View style={styles.part}>
          {canSet ? (
            <>
              <Text variant="smallStrong">{t("groups.syllabus.content.release")}</Text>
              <View style={styles.row}>
                {MODES.map((mode) => (
                  <WordChip
                    key={mode}
                    label={t(`groups.syllabus.content.modes.${mode}`)}
                    chosen={picking ? mode === "date" : topic.release.mode === mode}
                    onPress={() => (mode === "date" ? setPicking(true) : save(mode, null))}
                    testID={`topic-release-${mode}`}
                  />
                ))}
              </View>
              {dated ? (
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={styles.days}
                  keyboardShouldPersistTaps="handled"
                >
                  {days.map((iso) => (
                    <WordChip
                      key={iso}
                      label={day(iso)}
                      chosen={topic.release.mode === "date" && topic.release.date === iso}
                      onPress={() => save("date", iso)}
                      testID={`topic-date-${iso}`}
                    />
                  ))}
                </ScrollView>
              ) : null}
            </>
          ) : (
            <Text variant="small" tone="mutedForeground" testID="topic-release">
              {t("groups.syllabus.content.release")}:{" "}
              {topic.release.mode === "date" && topic.release.date
                ? day(topic.release.date)
                : t(`groups.syllabus.content.modes.${topic.release.mode}`)}
            </Text>
          )}
        </View>
      ) : null}
      {problem ? <Notice tone="destructive">{problem}</Notice> : null}
    </Card>
  );
}

function Students({ progress }: { progress: GroupProgress }) {
  const t = useTranslations();
  const ts = useTranslations("groups.syllabus.students");
  const percent = (value: number | null) => (value === null ? "–" : `${value}%`);
  return (
    <View style={styles.block}>
      <View>
        <Text variant="heading">{ts("title")}</Text>
        <Text variant="small" tone="mutedForeground">
          {ts("hint")}
        </Text>
      </View>
      {progress.students.length === 0 ? (
        <Card>
          <Text tone="mutedForeground">{ts("empty")}</Text>
        </Card>
      ) : (
        progress.students.map((row) => (
          <Card key={row.membershipId} testID={`plan-student-${row.membershipId}`}>
            <View style={styles.head}>
              <View style={styles.fill}>
                <Text variant="bodyStrong" numberOfLines={1}>
                  {row.fullName}
                </Text>
                {row.status !== "ACTIVE" ? (
                  <Text variant="small" tone="mutedForeground">
                    {t(`groups.memberStatuses.${row.status}`)}
                  </Text>
                ) : null}
              </View>
              <Text variant="figure">{percent(row.percent)}</Text>
            </View>
            <Meter percent={row.percent} label={row.fullName} />
            <Text variant="small" tone="mutedForeground">
              {[
                ts("topics", { done: row.topicsComplete, total: row.topicsTotal }),
                `${ts("exercises")} ${row.exercisesDone}/${row.exercisesTotal}`,
                `${ts("score")} ${percent(row.scorePercent)}`,
                `${ts("attendance")} ${percent(row.attendancePercent)}`,
                `${ts("homework")} ${row.homeworkDone}/${row.homeworkSet}`,
              ].join(", ")}
            </Text>
          </Card>
        ))
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  column: { gap: space[6] },
  split: { flexDirection: "row", alignItems: "flex-start", gap: space[6] },
  wideTopics: { flex: 3 },
  wideStudents: { flex: 2 },
  block: { gap: space[3] },
  part: { gap: space[2] },
  head: { flexDirection: "row", alignItems: "flex-start", gap: space[3] },
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space[2] },
  days: { gap: space[2], paddingRight: space[2] },
});
