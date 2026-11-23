import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import { useGroup } from "@/api/hooks";
import { useGroupKnowledge } from "@/api/staff-group";
import type { TopicStat } from "@/api/types";
import { Header } from "@/components/header";
import { Card, Divider, EmptyState, Screen } from "@/components/surface";
import { Text } from "@/components/text";
import { PendingScreen } from "@/features/shared/pending-screen";
import { WordChip } from "@/features/student/answer-parts";
import { useTranslations } from "@/lib/i18n";
import { radius, space, useTheme } from "@/lib/theme";

/**
 * What a group knows, topic by topic, in the app (A-219): how many answers to
 * each topic's questions were right over the group's handed-in tests, for all
 * of them or for one subject or one test.
 */
export function GroupKnowledgeScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTranslations();
  const tk = useTranslations("tests.knowledge");
  const group = useGroup(id);
  const [subject, setSubject] = useState<string | null>(null);
  const [testId, setTestId] = useState<string | null>(null);
  const query = useGroupKnowledge(id, subject, testId);

  const header = (
    <Header back title={t("groups.detail.tabs.knowledge")} subtitle={group.data?.name} />
  );
  if (!query.data) return <PendingScreen header={header} query={query} />;
  const data = query.data;
  // The tests offered follow the chosen subject.
  const tests = data.tests.filter((test) => subject === null || test.subject === subject);

  return (
    <Screen
      header={header}
      onRefresh={() => void query.refetch()}
      refreshing={query.isRefetching}
      contentStyle={styles.column}
    >
      {data.subjects.length > 1 ? (
        <Chips label={tk("subject")}>
          <WordChip
            label={tk("anySubject")}
            chosen={subject === null}
            onPress={() => {
              setSubject(null);
              setTestId(null);
            }}
            testID="knowledge-subject-all"
          />
          {data.subjects.map((name) => (
            <WordChip
              key={name}
              label={name}
              chosen={subject === name}
              onPress={() => {
                setSubject(name);
                setTestId(null);
              }}
              testID={`knowledge-subject-${name}`}
            />
          ))}
        </Chips>
      ) : null}
      {tests.length > 1 ? (
        <Chips label={tk("test")}>
          <WordChip
            label={tk("anyTest")}
            chosen={testId === null}
            onPress={() => setTestId(null)}
            testID="knowledge-test-all"
          />
          {tests.map((test) => (
            <WordChip
              key={test.id}
              label={test.name}
              chosen={testId === test.id}
              onPress={() => setTestId(test.id)}
              testID={`knowledge-test-${test.id}`}
            />
          ))}
        </Chips>
      ) : null}
      <Text tone="mutedForeground" testID="knowledge-summary">
        {tk("summary", { attempts: data.attempts, students: data.students })}
      </Text>
      {data.topics.length === 0 ? (
        <EmptyState title={tk("empty")} />
      ) : (
        <Card style={[styles.flush, query.isPlaceholderData ? styles.stale : null]}>
          {data.topics.map((topic, index) => (
            <View key={`${topic.subject}/${topic.topic}`}>
              {index > 0 ? <Divider /> : null}
              <Topic topic={topic} />
            </View>
          ))}
        </Card>
      )}
    </Screen>
  );
}

function Chips({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <View style={styles.block}>
      <Text variant="smallStrong">{label}</Text>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.chips}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    </View>
  );
}

function Topic({ topic }: { topic: TopicStat }) {
  const tk = useTranslations("tests.knowledge");
  const { colors } = useTheme();
  const value = topic.accuracy;
  // Below half is a gap to teach again, below four fifths is worth another look.
  const tone =
    value === null
      ? colors.secondary
      : value < 50
        ? colors.destructive
        : value < 80
          ? colors.warning
          : colors.success;
  return (
    <View style={styles.topic} testID={`knowledge-topic-${topic.topic}`}>
      <View style={styles.head}>
        <View style={styles.fill}>
          <Text variant="bodyStrong">{topic.topic}</Text>
          <Text variant="small" tone="mutedForeground">
            {[
              topic.subject,
              `${tk("questions")}: ${topic.questions}`,
              `${tk("answered")}: ${topic.answered}`,
              `${tk("correct")}: ${topic.correct}`,
            ].join(", ")}
          </Text>
        </View>
        <Text variant="figure" testID="knowledge-accuracy">
          {value === null ? "–" : `${value}%`}
        </Text>
      </View>
      <View
        accessibilityRole="progressbar"
        accessibilityLabel={`${tk("accuracy")}, ${topic.topic}`}
        accessibilityValue={{ min: 0, max: 100, now: value ?? 0 }}
        style={[styles.track, { backgroundColor: colors.secondary }]}
      >
        <View style={[styles.done, { backgroundColor: tone, width: `${value ?? 0}%` }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  column: { gap: space[4], maxWidth: 720 },
  block: { gap: space[2] },
  chips: { gap: space[2], paddingRight: space[2] },
  flush: { padding: 0, gap: 0 },
  stale: { opacity: 0.6 },
  topic: { gap: space[2], paddingHorizontal: space[4], paddingVertical: space[3] },
  head: { flexDirection: "row", alignItems: "flex-start", gap: space[3] },
  track: { height: 8, borderRadius: radius.full, overflow: "hidden" },
  done: { height: 8, borderRadius: radius.full },
});
