import { useQueryClient } from "@tanstack/react-query";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import {
  ChevronDown,
  ChevronUp,
  ExternalLink,
  FileText,
  Link2,
  Lock,
  Play,
  Type,
} from "lucide-react-native";
import { useCallback, useState } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";

import { usePortal } from "@/api/hooks";
import { portalKeys, usePortalCourse, usePortalProgress, usePortalVocab } from "@/api/portal";
import type { CourseProgress, PortalTopic, PortalVocab, TopicBlock } from "@/api/types";
import { Button } from "@/components/button";
import { Header } from "@/components/header";
import { Badge, Card, Divider, EmptyState, Screen } from "@/components/surface";
import { Text } from "@/components/text";
import { fileRoute } from "@/features/files/file-screen";
import { YouTubePlayer } from "@/features/room/youtube";
import { PendingScreen } from "@/features/shared/pending-screen";
import { dayAsDate } from "@/lib/days";
import { useDate, useTranslations } from "@/lib/i18n";
import { useLayout } from "@/lib/layout";
import { radius, space, useTheme } from "@/lib/theme";
import { youtubeId } from "@kampus/lib/video-material";

import { ExerciseRows } from "./exercise-rows";
import { Meter } from "./meter";
import { VocabCard } from "./vocab-card";

const hasContent = (topic: PortalTopic) => topic.blocks.length > 0 || topic.exercises.length > 0;

/**
 * The course on the student's side, in the app (A-215): the student's own
 * progress, the flashcards, and the course's topics. A topic the group has
 * reached unfolds into what the teacher put there (text, a video, a file, a
 * link) and its exercises; one still ahead says when it opens.
 */
export function CourseScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const t = useTranslations();
  const client = useQueryClient();
  const { wide } = useLayout();
  const portal = usePortal(token);
  const course = usePortalCourse(token);
  const progress = usePortalProgress(token);
  const vocab = usePortalVocab(token);
  const [chosen, setChosen] = useState<string | null | undefined>(undefined);
  const refetchCourse = course.refetch;
  const refetchProgress = progress.refetch;
  // Coming back from an exercise shows its score and the progress it earned.
  useFocusEffect(
    useCallback(() => {
      void refetchCourse();
      void refetchProgress();
    }, [refetchCourse, refetchProgress]),
  );

  const header = (
    <Header back title={t("portal.tabs.course")} subtitle={portal.data?.portal.group.name} />
  );
  if (!course.data) return <PendingScreen header={header} query={course} />;
  const data = course.data;
  // The first topic with something in it starts unfolded, until the student picks.
  const openId =
    chosen === undefined ? (data.topics.find((x) => x.open && hasContent(x))?.id ?? null) : chosen;
  const refresh = () => {
    void course.refetch();
    void progress.refetch();
    void vocab.refetch();
  };

  const side = (
    <>
      {progress.data && progress.data.topicsTotal > 0 ? (
        <ProgressCard progress={progress.data} />
      ) : null}
      {vocab.data ? (
        <VocabCard
          token={token}
          vocab={vocab.data}
          onChange={(next) => client.setQueryData<PortalVocab>(portalKeys.vocab(token), next)}
        />
      ) : null}
    </>
  );
  const done = new Map(progress.data?.topics.map((x) => [x.topicId, x]) ?? []);
  const topics =
    data.total === 0 ? (
      <EmptyState title={t("portal.course.empty")} />
    ) : (
      <View style={styles.block}>
        <Text variant="small" tone="mutedForeground" testID="course-open-count">
          {t("portal.course.progress", {
            open: data.open,
            total: data.total,
            course: data.courseName,
          })}
        </Text>
        <Card style={styles.flush}>
          {data.topics.map((topic, index) => (
            <View key={topic.id}>
              {index > 0 ? <Divider /> : null}
              <Topic
                token={token}
                topic={topic}
                state={done.get(topic.id)}
                open={openId === topic.id}
                onToggle={() => setChosen(openId === topic.id ? null : topic.id)}
              />
            </View>
          ))}
        </Card>
      </View>
    );

  return (
    <Screen
      header={header}
      onRefresh={refresh}
      refreshing={course.isRefetching}
      contentStyle={wide ? styles.split : styles.block}
    >
      {wide ? (
        <>
          <View style={styles.wideTopics}>{topics}</View>
          <View style={styles.wideSide}>{side}</View>
        </>
      ) : (
        <>
          {side}
          {topics}
        </>
      )}
    </Screen>
  );
}

function ProgressCard({ progress }: { progress: CourseProgress }) {
  const t = useTranslations("portal.course");
  const figures = [
    t("topicsDone", { done: progress.topicsComplete, total: progress.topicsTotal }),
    progress.exercisesTotal > 0
      ? t("exercisesDone", { done: progress.exercisesDone, total: progress.exercisesTotal })
      : null,
    progress.scorePercent !== null ? t("score", { score: progress.scorePercent }) : null,
    progress.attendancePercent !== null
      ? t("attendance", { percent: progress.attendancePercent })
      : null,
  ].filter(Boolean);
  return (
    <Card testID="course-progress">
      <Text variant="heading">{t("yourProgress")}</Text>
      <Text testID="course-progress-percent">
        {t("percent", { percent: progress.percent ?? 0 })}
      </Text>
      <Meter percent={progress.percent} label={t("yourProgress")} />
      <Text variant="small" tone="mutedForeground">
        {figures.join(", ")}
      </Text>
    </Card>
  );
}

function Topic({
  token,
  topic,
  state,
  open,
  onToggle,
}: {
  token: string;
  topic: PortalTopic;
  state: CourseProgress["topics"][number] | undefined;
  open: boolean;
  onToggle: () => void;
}) {
  const t = useTranslations("portal.course");
  const { colors } = useTheme();
  const formatDate = useDate();
  const day = (iso: string) => formatDate(dayAsDate(iso), { day: "numeric", month: "short" });

  if (!topic.open) {
    return (
      <View style={styles.topic} testID={`topic-${topic.id}`}>
        <Text tone="mutedForeground" style={styles.number}>
          {topic.sortOrder}
        </Text>
        <View style={styles.fill}>
          <Text tone="mutedForeground">{topic.title}</Text>
          <View style={styles.locked}>
            <Lock size={14} color={colors.mutedForeground} />
            <Text variant="small" tone="mutedForeground">
              {topic.opensOn ? t("opensOn", { date: day(topic.opensOn) }) : t("locked")}
            </Text>
          </View>
        </View>
      </View>
    );
  }
  const content = hasContent(topic);
  const toDo =
    topic.exercises.length > 0 && (state?.exercisesDone ?? 0) < (state?.exercisesTotal ?? 0);
  return (
    <View testID={`topic-${topic.id}`}>
      <Pressable
        onPress={content ? onToggle : undefined}
        disabled={!content}
        accessibilityRole="button"
        accessibilityState={{ expanded: open, disabled: !content }}
        accessibilityLabel={topic.title}
        style={({ pressed }) => [styles.topic, pressed && { backgroundColor: colors.muted }]}
        testID={`topic-toggle-${topic.id}`}
      >
        <Text tone="mutedForeground" style={styles.number}>
          {topic.sortOrder}
        </Text>
        <View style={styles.fill}>
          <Text variant="bodyStrong">{topic.title}</Text>
          {topic.coveredOn ? (
            <Text variant="small" tone="mutedForeground">
              {t("coveredOn", { date: day(topic.coveredOn) })}
            </Text>
          ) : null}
        </View>
        {state?.complete ? (
          <Badge tone="success" label={t("done")} />
        ) : toDo ? (
          <Badge label={t("toDo")} />
        ) : null}
        {!content ? (
          <Badge label={t("noContent")} />
        ) : open ? (
          <ChevronUp size={20} color={colors.mutedForeground} />
        ) : (
          <ChevronDown size={20} color={colors.mutedForeground} />
        )}
      </Pressable>
      {open && content ? (
        <View
          style={[styles.content, { backgroundColor: colors.muted, borderTopColor: colors.border }]}
          testID={`topic-content-${topic.id}`}
        >
          {topic.blocks.map((block) => (
            <Block key={block.id} block={block} />
          ))}
          <ExerciseRows token={token} exercises={topic.exercises} testID="topic-exercise" />
        </View>
      ) : null}
    </View>
  );
}

const BLOCK_ICON = { TEXT: Type, VIDEO: Play, FILE: FileText, LINK: Link2 } as const;

/**
 * One block of a topic as a student reads it: text, a video, a file or a link.
 * The staff's content page shows the same (A-263), so they see what students get.
 */
export function Block({ block }: { block: TopicBlock }) {
  const t = useTranslations("portal.course");
  const { colors } = useTheme();
  const router = useRouter();
  const Icon = BLOCK_ICON[block.kind];
  const video = block.kind === "VIDEO" && block.url ? youtubeId(block.url) : null;
  const url = block.url;
  return (
    <View style={styles.blockBody} testID={`block-${block.id}`}>
      <View style={styles.blockHead}>
        <Icon size={16} color={colors.mutedForeground} />
        <Text variant="bodyStrong" style={styles.fill}>
          {block.title}
        </Text>
      </View>
      {block.kind === "TEXT" && block.body
        ? block.body.split(/\n{2,}/).map((paragraph, index) => <Text key={index}>{paragraph}</Text>)
        : null}
      {block.kind === "VIDEO" && video ? (
        <View style={styles.video}>
          <YouTubePlayer id={video} title={block.title} />
        </View>
      ) : null}
      {block.kind === "VIDEO" && !video && url ? (
        <Button
          compact
          variant="outline"
          label={t("open")}
          icon={<Play size={16} color={colors.foreground} />}
          // A video, whatever its address ends in.
          onPress={() => router.push(fileRoute(url, block.title, {}))}
          style={styles.start}
          testID={`block-open-${block.id}`}
        />
      ) : null}
      {block.kind === "FILE" && url ? (
        <Button
          compact
          variant="outline"
          label={t("open")}
          icon={<FileText size={16} color={colors.foreground} />}
          onPress={() => router.push(fileRoute(url, block.title))}
          style={styles.start}
          testID={`block-open-${block.id}`}
        />
      ) : null}
      {block.kind === "LINK" && url ? (
        <>
          <Text variant="small" tone="mutedForeground" numberOfLines={1}>
            {url}
          </Text>
          <Button
            compact
            variant="outline"
            label={t("open")}
            icon={<ExternalLink size={16} color={colors.foreground} />}
            onPress={() => void Linking.openURL(url).catch(() => undefined)}
            style={styles.start}
            testID={`block-open-${block.id}`}
          />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  block: { gap: space[4] },
  split: { flexDirection: "row", alignItems: "flex-start", gap: space[6] },
  wideTopics: { flex: 3, gap: space[4] },
  wideSide: { flex: 2, gap: space[4] },
  flush: { padding: 0, gap: 0, overflow: "hidden" },
  topic: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingHorizontal: space[4],
    paddingVertical: space[3],
  },
  number: { width: 24, textAlign: "right" },
  locked: { flexDirection: "row", alignItems: "center", gap: space[1] },
  content: {
    gap: space[4],
    padding: space[4],
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  blockBody: { gap: space[2] },
  blockHead: { flexDirection: "row", alignItems: "center", gap: space[2] },
  video: {
    aspectRatio: 16 / 9,
    borderRadius: radius.md,
    overflow: "hidden",
    backgroundColor: "#000000",
  },
  start: { alignSelf: "flex-start" },
});
