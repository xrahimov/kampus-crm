import { useRouter } from "expo-router";
import { ExternalLink, MessageSquare, Minus, Paperclip, Plus } from "lucide-react-native";
import { useState } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";

import { useCheckingQueue, useReviewAnswer } from "@/api/hooks";
import type { CheckingItem } from "@/api/types";
import { Button } from "@/components/button";
import { Field } from "@/components/field";
import { Header } from "@/components/header";
import { Card, EmptyState, Loading, Notice, Screen } from "@/components/surface";
import { Text } from "@/components/text";
import { AudioClip } from "@/features/files/audio-clip";
import { fileRoute } from "@/features/files/file-screen";
import { VoiceRecorder } from "@/features/files/recorder";
import { fileSource } from "@/features/room/file-source";
import { ApiError, type PickedFile } from "@/lib/api";
import { dayAsDate } from "@/lib/days";
import { errorText, useDate, useTranslations } from "@/lib/i18n";
import { radius, space, useTheme } from "@/lib/theme";
import { materialView } from "@kampus/lib/video-material";

/**
 * Homework answers waiting for the teacher, oldest first: accept or return,
 * with a written or a spoken word. The student's file opens in the app and a
 * spoken answer plays in place (A-214).
 */
export function CheckingScreen() {
  const t = useTranslations();
  const query = useCheckingQueue();
  const queue = query.data;
  const header = (
    <Header
      title={t("checking.title")}
      subtitle={
        queue && queue.total > 0 ? t("checking.waiting", { count: queue.total }) : undefined
      }
    />
  );
  if (query.isLoading) {
    return (
      <Screen header={header} scroll={false}>
        <Loading />
      </Screen>
    );
  }
  if (!queue) {
    const forbidden = query.error instanceof ApiError && query.error.status === 403;
    return (
      <Screen header={header}>
        <EmptyState
          title={forbidden ? t("mobile.noTeachingTitle") : errorText(t, query.error)}
          text={forbidden ? t("mobile.noTeachingText") : undefined}
          action={
            forbidden ? undefined : (
              <Button variant="outline" label={t("mobile.retry")} onPress={() => query.refetch()} />
            )
          }
        />
      </Screen>
    );
  }
  return (
    <Screen
      header={header}
      onRefresh={() => query.refetch()}
      refreshing={query.isRefetching}
      contentStyle={styles.column}
    >
      {queue.items.length === 0 ? (
        <EmptyState title={t("checking.emptyTitle")} text={t("checking.emptyHint")} />
      ) : (
        queue.items.map((item) => (
          <AnswerCard key={`${item.homeworkId}-${item.membershipId}`} item={item} />
        ))
      )}
    </Screen>
  );
}

/**
 * One waiting answer with its verdict. An assignment with a rubric asks for
 * the points first: **Accept** opens them, the second press sends (A-217).
 */
export function AnswerCard({ item }: { item: CheckingItem }) {
  const t = useTranslations();
  const formatDate = useDate();
  const router = useRouter();
  const { colors } = useTheme();
  const review = useReviewAnswer();
  const [replying, setReplying] = useState(false);
  const [comment, setComment] = useState("");
  const [voice, setVoice] = useState<PickedFile | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scoring, setScoring] = useState(false);
  const [points, setPoints] = useState<number[]>(() => item.rubric.map(() => 0));
  const hasRubric = item.rubric.length > 0;

  const send = (status: "ACCEPTED" | "RETURNED") => {
    setError(null);
    review.mutate(
      {
        groupId: item.groupId,
        homeworkId: item.homeworkId,
        membershipId: item.membershipId,
        status,
        teacherComment: comment.trim() || null,
        voice,
        rubricScores: status === "ACCEPTED" && hasRubric ? points : undefined,
      },
      { onError: (e) => setError(errorText(t, e)) },
    );
  };

  const attachment = item.attachmentUrl;
  const spoken = attachment !== null && materialView("FILE", attachment) === "audio";

  return (
    <Card testID={`answer-${item.homeworkId}-${item.membershipId}`}>
      <View>
        <Text variant="heading">{item.fullName}</Text>
        <Text variant="small" tone="mutedForeground">
          {[
            item.groupName,
            item.lessonDate
              ? formatDate(dayAsDate(item.lessonDate), { day: "numeric", month: "short" })
              : null,
            item.lessonTopic,
          ]
            .filter(Boolean)
            .join(", ")}
        </Text>
      </View>
      <View style={styles.part}>
        <Text variant="smallStrong" tone="mutedForeground">
          {t("checking.task")}
        </Text>
        <Text numberOfLines={replying ? undefined : 4}>{item.title ?? item.text}</Text>
        {item.linkUrl ? (
          <Button
            compact
            variant="ghost"
            label={t("mobile.homework.openLink")}
            icon={<ExternalLink size={16} color={colors.primary} />}
            onPress={() => void Linking.openURL(item.linkUrl!).catch(() => undefined)}
            style={styles.start}
            testID="answer-task-link"
          />
        ) : null}
      </View>
      <View style={styles.part}>
        <Text variant="smallStrong" tone="mutedForeground">
          {t("checking.sentAt", {
            when: formatDate(new Date(item.submittedAt), {
              dateStyle: "medium",
              timeStyle: "short",
            }),
          })}
        </Text>
        {item.note || !attachment ? <Text>{item.note ?? t("checking.noNote")}</Text> : null}
        {attachment ? (
          spoken ? (
            // A spoken answer plays right here, as it does on the site.
            <AudioClip
              source={fileSource(attachment)}
              label={t("mobile.checking.spoken")}
              testID="answer-audio"
            />
          ) : (
            <Button
              compact
              variant="outline"
              label={t("checking.attachment")}
              icon={<Paperclip size={16} color={colors.foreground} />}
              onPress={() => router.push(fileRoute(attachment, item.fullName))}
              style={styles.start}
              testID="answer-attachment"
            />
          )
        ) : null}
      </View>
      {replying ? (
        <View style={styles.reply} testID="answer-reply">
          <Field
            label={t("checking.comment")}
            placeholder={t("checking.commentPlaceholder")}
            value={comment}
            onChangeText={setComment}
            multiline
            maxLength={1000}
            testID="return-comment"
          />
          <View style={styles.part}>
            <Text variant="smallStrong">{t("groups.homework.voiceReply")}</Text>
            <VoiceRecorder
              value={voice}
              onChange={setVoice}
              label={t("groups.homework.voiceReply")}
            />
          </View>
        </View>
      ) : null}
      {scoring ? (
        <View style={styles.reply} testID="answer-rubric">
          <Text variant="smallStrong">{t("groups.homework.assignment.rubric")}</Text>
          {item.rubric.map((criterion, index) => (
            <View key={`${index}-${criterion.name}`} style={styles.criterion}>
              <Text style={styles.fill}>{criterion.name}</Text>
              <Stepper
                value={points[index] ?? 0}
                max={criterion.max}
                label={criterion.name}
                // Counted from the points as they stand, so quick presses all count.
                onStep={(delta) =>
                  setPoints((old) =>
                    old.map((p, i) =>
                      i === index ? Math.max(0, Math.min(criterion.max, p + delta)) : p,
                    ),
                  )
                }
                testID={`rubric-${index}`}
              />
            </View>
          ))}
          <Text variant="bodyStrong" testID="rubric-total">
            {t("groups.homework.assignment.score", {
              points: points.reduce((sum, p) => sum + p, 0),
              max: item.rubric.reduce((sum, c) => sum + c.max, 0),
            })}
          </Text>
        </View>
      ) : null}
      {error ? <Notice tone="destructive">{error}</Notice> : null}
      <View style={styles.actions}>
        {replying ? (
          <Button
            compact
            variant="ghost"
            label={t("common.cancel")}
            disabled={review.isPending}
            onPress={() => {
              setReplying(false);
              setComment("");
              setVoice(null);
            }}
            testID="reply-cancel"
          />
        ) : (
          <Button
            compact
            variant="ghost"
            label={t("mobile.checking.reply")}
            icon={<MessageSquare size={16} color={colors.primary} />}
            onPress={() => setReplying(true)}
            testID="reply"
          />
        )}
        <Button
          compact
          variant="outline"
          label={t("checking.return")}
          // Returning takes a second press: the first one asks what to fix.
          onPress={() => (replying ? send("RETURNED") : setReplying(true))}
          loading={review.isPending && review.variables?.status === "RETURNED"}
          disabled={review.isPending}
          testID="return"
        />
        <Button
          compact
          label={t("checking.accept")}
          // With a rubric the first press shows the points to give.
          onPress={() => (hasRubric && !scoring ? setScoring(true) : send("ACCEPTED"))}
          loading={review.isPending && review.variables?.status === "ACCEPTED"}
          disabled={review.isPending}
          testID="accept"
        />
      </View>
    </Card>
  );
}

/** Points from 0 to `max`, one tap at a time. */
function Stepper({
  value,
  max,
  label,
  onStep,
  testID,
}: {
  value: number;
  max: number;
  label: string;
  onStep: (delta: number) => void;
  testID: string;
}) {
  const t = useTranslations();
  const { colors } = useTheme();
  const key = (delta: number, Icon: typeof Minus, id: string) => {
    const next = Math.max(0, Math.min(max, value + delta));
    return (
      <Pressable
        onPress={() => onStep(delta)}
        disabled={next === value}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${next}`}
        hitSlop={6}
        style={[
          styles.step,
          { borderColor: colors.input, backgroundColor: colors.card },
          next === value && styles.dim,
        ]}
        testID={`${testID}-${id}`}
      >
        <Icon size={18} color={colors.foreground} />
      </Pressable>
    );
  };
  return (
    <View style={styles.stepper}>
      {key(-1, Minus, "minus")}
      <Text variant="bodyStrong" style={styles.points} testID={`${testID}-value`}>
        {value}
      </Text>
      {key(1, Plus, "plus")}
      <Text variant="small" tone="mutedForeground">
        {t("groups.homework.assignment.outOf", { points: max })}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  column: { maxWidth: 720 },
  fill: { flex: 1 },
  criterion: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space[2] },
  stepper: { flexDirection: "row", alignItems: "center", gap: space[2] },
  step: {
    width: 40,
    height: 40,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: radius.md,
  },
  dim: { opacity: 0.4 },
  points: { minWidth: 24, textAlign: "center" },
  part: { gap: space[1] },
  reply: { gap: space[3] },
  start: { alignSelf: "flex-start" },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: space[2],
  },
});
