import { useLocalSearchParams, useRouter } from "expo-router";
import { Camera, ExternalLink, Image as ImageIcon, Paperclip, Send, X } from "lucide-react-native";
import { useState } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";

import { usePortal, usePortalHomework, useSubmitHomework } from "@/api/hooks";
import type { PortalHomework } from "@/api/types";
import { Button } from "@/components/button";
import { Field } from "@/components/field";
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
import { AudioClip } from "@/features/files/audio-clip";
import { fileRoute } from "@/features/files/file-screen";
import { chooseFile, choosePhoto, takePhoto, type Picked } from "@/features/files/pick";
import { VoiceRecorder } from "@/features/files/recorder";
import { fileSource } from "@/features/room/file-source";
import { ApiError, type PickedFile } from "@/lib/api";
import { dayAsDate } from "@/lib/days";
import { errorText, useDate, useTranslations } from "@/lib/i18n";
import { radius, space, useTheme } from "@/lib/theme";
import { useDonation } from "@/features/shortcuts/donation";
import { materialView } from "@kampus/lib/video-material";

import { ExerciseRows } from "./exercise-rows";

const STATUS_TONE: Record<"NONE" | "SUBMITTED" | "ACCEPTED" | "RETURNED", Tone> = {
  NONE: "neutral",
  SUBMITTED: "accent",
  ACCEPTED: "success",
  RETURNED: "destructive",
};

/** Homework the student still has to act on: nothing sent yet, or sent back. */
export function needsAnswer(homework: PortalHomework): boolean {
  return !homework.submission || homework.submission.status === "RETURNED";
}

/**
 * A group's homework as the student sees it, answered inside the app (A-212):
 * the task with its file and link, the student's answer and the teacher's
 * reply, and a form to hand in text, a photo, a file or a recording. `focus`
 * (from the home screen) puts one task first with its form open.
 */
export function HomeworkScreen() {
  useDonation("homework");
  const { token, focus } = useLocalSearchParams<{ token: string; focus?: string }>();
  const t = useTranslations();
  const portal = usePortal(token);
  const query = usePortalHomework(token);
  const items = query.data ?? [];
  const ordered = focus
    ? [...items.filter((h) => h.id === focus), ...items.filter((h) => h.id !== focus)]
    : items;

  const header = (
    <Header
      back
      title={t("mobile.homework.title")}
      subtitle={
        query.data
          ? [
              portal.data?.portal.group.name,
              t("mobile.homework.toDo", { count: items.filter(needsAnswer).length }),
            ]
              .filter(Boolean)
              .join(", ")
          : portal.data?.portal.group.name
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
  if (!query.data) {
    return (
      <Screen header={header}>
        <EmptyState
          title={errorText(t, query.error)}
          action={
            <Button variant="outline" label={t("mobile.retry")} onPress={() => query.refetch()} />
          }
        />
      </Screen>
    );
  }
  return (
    <Screen
      header={header}
      onRefresh={() => void query.refetch()}
      refreshing={query.isRefetching}
      contentStyle={styles.list}
    >
      {ordered.length === 0 ? <EmptyState title={t("portal.homework.empty")} /> : null}
      {ordered.map((homework) => (
        <HomeworkCard
          key={homework.id}
          token={token}
          homework={homework}
          startOpen={homework.id === focus && needsAnswer(homework)}
        />
      ))}
    </Screen>
  );
}

function HomeworkCard({
  token,
  homework,
  startOpen,
}: {
  token: string;
  homework: PortalHomework;
  startOpen: boolean;
}) {
  const t = useTranslations("portal.homework");
  const tm = useTranslations("mobile.homework");
  const { colors } = useTheme();
  const router = useRouter();
  const formatDate = useDate();
  const [open, setOpen] = useState(startOpen);
  const [sent, setSent] = useState(false);
  const day = (iso: string) => formatDate(dayAsDate(iso), { day: "numeric", month: "short" });
  const s = homework.submission;
  const canAnswer = !s || s.status !== "ACCEPTED";
  const heading = homework.lessonDate
    ? t("lessonOf", { date: day(homework.lessonDate) })
    : (homework.title ?? "");
  const openFile = (url: string, title: string) => router.push(fileRoute(url, title));

  return (
    <Card style={styles.card} testID={`homework-${homework.id}`}>
      <View style={styles.head}>
        <Text variant="bodyStrong" style={styles.fill}>
          {heading}
        </Text>
        <Badge label={t(`status.${s?.status ?? "NONE"}`)} tone={STATUS_TONE[s?.status ?? "NONE"]} />
      </View>
      <View style={styles.tags}>
        {!homework.lessonDate ? <Badge label={t("assignment")} /> : null}
        {homework.speaking ? <Badge label={t("speaking")} tone="accent" /> : null}
        {homework.dueDate ? (
          <Text variant="small" tone="mutedForeground">
            {t("due", { date: day(homework.dueDate) })}
          </Text>
        ) : null}
        {homework.lessonTopic ? (
          <Text variant="small" tone="mutedForeground" style={styles.fill} numberOfLines={2}>
            {homework.lessonTopic}
          </Text>
        ) : null}
      </View>

      <Text testID="homework-text">{homework.text}</Text>

      {homework.rubric.length > 0 ? (
        <View style={[styles.rubric, { borderColor: colors.border }]} testID="homework-rubric">
          <View style={styles.rubricRow}>
            <Text variant="smallStrong" style={styles.fill}>
              {t("rubric")}
            </Text>
            <Text variant="smallStrong" testID="homework-score">
              {s?.score !== null && s?.score !== undefined
                ? t("score", { points: s.score, max: homework.maxScore ?? 0 })
                : t("outOf", { points: homework.maxScore ?? 0 })}
            </Text>
          </View>
          {homework.rubric.map((criterion, index) => (
            // A rubric's lines have no identity but their order.
            <View key={index} style={styles.rubricRow}>
              <Text variant="small" style={styles.fill}>
                {criterion.name}
              </Text>
              <Text variant="small" tone="mutedForeground">
                {s?.rubricScores ? `${s.rubricScores[index] ?? 0} / ` : ""}
                {criterion.max}
              </Text>
            </View>
          ))}
        </View>
      ) : null}

      {homework.linkUrl || homework.attachmentUrl ? (
        <View style={styles.row}>
          {homework.attachmentUrl ? (
            <Button
              compact
              variant="outline"
              label={tm("openFile")}
              icon={<Paperclip size={16} color={colors.foreground} />}
              onPress={() => openFile(homework.attachmentUrl!, heading || t("file"))}
              testID="homework-file"
            />
          ) : null}
          {homework.linkUrl ? (
            <Button
              compact
              variant="outline"
              label={tm("openLink")}
              icon={<ExternalLink size={16} color={colors.foreground} />}
              onPress={() => void Linking.openURL(homework.linkUrl!).catch(() => undefined)}
              testID="homework-link"
            />
          ) : null}
        </View>
      ) : null}

      {s ? (
        <View style={[styles.answer, { backgroundColor: colors.muted }]} testID="homework-answer">
          <Text variant="small" tone="mutedForeground">
            {t("yourAnswer", {
              date: formatDate(new Date(s.submittedAt), {
                day: "numeric",
                month: "short",
                year: "numeric",
              }),
            })}
          </Text>
          {s.note ? <Text>{s.note}</Text> : null}
          {s.attachmentUrl ? (
            materialView("FILE", s.attachmentUrl) === "audio" ? (
              <AudioClip
                source={fileSource(s.attachmentUrl)}
                label={t("yourRecording")}
                testID="homework-own-audio"
              />
            ) : (
              <Button
                compact
                variant="outline"
                label={t("yourFile")}
                icon={<Paperclip size={16} color={colors.foreground} />}
                onPress={() => openFile(s.attachmentUrl!, t("yourFile"))}
                testID="homework-own-file"
              />
            )
          ) : null}
          {s.teacherComment || s.teacherAudioUrl ? <Divider /> : null}
          {s.teacherComment ? (
            <Text testID="homework-teacher-comment">
              <Text variant="bodyStrong">{t("teacherSaid")}: </Text>
              {s.teacherComment}
            </Text>
          ) : null}
          {s.teacherAudioUrl ? (
            <AudioClip
              source={fileSource(s.teacherAudioUrl)}
              label={t("teacherVoice")}
              testID="homework-teacher-audio"
            />
          ) : null}
        </View>
      ) : null}

      <ExerciseRows token={token} exercises={homework.exercises} testID="homework-exercise" />

      {sent ? (
        <Notice tone="success" testID="homework-sent">
          {tm("sent")}
        </Notice>
      ) : null}
      {canAnswer && !open ? (
        <Button
          variant={s ? "outline" : "primary"}
          label={s ? t("answerAgain") : t("answer")}
          icon={<Send size={18} color={s ? colors.foreground : colors.primaryForeground} />}
          onPress={() => {
            setSent(false);
            setOpen(true);
          }}
          testID="homework-answer-open"
        />
      ) : null}
      {canAnswer && open ? (
        <AnswerForm
          token={token}
          homework={homework}
          onCancel={() => setOpen(false)}
          onSent={() => {
            setOpen(false);
            setSent(true);
          }}
        />
      ) : null}
    </Card>
  );
}

/** Writing the answer: a note, one file (photo, document, recording), Send. */
function AnswerForm({
  token,
  homework,
  onCancel,
  onSent,
}: {
  token: string;
  homework: PortalHomework;
  onCancel: () => void;
  onSent: () => void;
}) {
  const t = useTranslations("portal.homework");
  const tm = useTranslations("mobile.homework");
  const ta = useTranslations();
  const { colors } = useTheme();
  const submit = useSubmitHomework(token);
  const [note, setNote] = useState(homework.submission?.note ?? "");
  const [file, setFile] = useState<PickedFile | null>(null);
  const [recording, setRecording] = useState<PickedFile | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  const pick = async (how: () => Promise<Picked>) => {
    setProblem(null);
    try {
      const picked = await how();
      if (picked.kind === "file") setFile(picked.file);
      else if (picked.kind === "refused") setProblem(tm(picked.reason));
    } catch {
      setProblem(ta("errors.internal"));
    }
  };

  const send = () => {
    // A recording made here goes instead of a chosen file, as on the site.
    const attachment = recording ?? file;
    if (!note.trim() && !attachment) {
      setProblem(tm("needAnswer"));
      return;
    }
    setProblem(null);
    submit.mutate(
      { homeworkId: homework.id, note: note.trim(), file: attachment },
      {
        onSuccess: onSent,
        onError: (error) => {
          const fields = error instanceof ApiError ? error.fields : undefined;
          const key = fields?.note?.[0] ?? fields?.file?.[0];
          setProblem(key && ta.has(key) ? ta(key) : errorText(ta, error));
        },
      },
    );
  };

  return (
    <View style={styles.form} testID="homework-form">
      {homework.speaking ? (
        <View style={styles.block}>
          <Text variant="smallStrong">{t("recordAnswer")}</Text>
          <VoiceRecorder value={recording} onChange={setRecording} label={t("yourRecording")} />
        </View>
      ) : null}
      <Field
        label={t("note")}
        value={note}
        onChangeText={setNote}
        multiline
        maxLength={4000}
        textAlignVertical="top"
        style={styles.note}
        testID="homework-note"
      />
      <View style={styles.block}>
        <Text variant="smallStrong">
          {homework.speaking ? t("audioFileOptional") : t("fileOptional")}
        </Text>
        {file ? (
          <View
            style={[styles.attached, { borderColor: colors.border }]}
            testID="homework-attached"
          >
            <Paperclip size={16} color={colors.mutedForeground} />
            <Text variant="small" style={styles.fill} numberOfLines={1}>
              {tm("attached", { name: file.name })}
            </Text>
            <Pressable
              onPress={() => setFile(null)}
              accessibilityRole="button"
              accessibilityLabel={tm("removeFile")}
              hitSlop={10}
              testID="homework-remove-file"
            >
              <X size={18} color={colors.foreground} />
            </Pressable>
          </View>
        ) : null}
        <View style={styles.row}>
          <Button
            compact
            variant="outline"
            label={tm("takePhoto")}
            icon={<Camera size={16} color={colors.foreground} />}
            onPress={() => void pick(takePhoto)}
            testID="homework-take-photo"
          />
          <Button
            compact
            variant="outline"
            label={tm("choosePhoto")}
            icon={<ImageIcon size={16} color={colors.foreground} />}
            onPress={() => void pick(choosePhoto)}
            testID="homework-choose-photo"
          />
          <Button
            compact
            variant="outline"
            label={tm("chooseFile")}
            icon={<Paperclip size={16} color={colors.foreground} />}
            onPress={() => void pick(chooseFile)}
            testID="homework-choose-file"
          />
        </View>
      </View>
      {problem ? (
        <Notice tone="destructive" testID="homework-problem">
          {problem}
        </Notice>
      ) : null}
      <View style={styles.row}>
        <Button
          label={submit.isPending ? t("sending") : t("send")}
          icon={<Send size={18} color={colors.primaryForeground} />}
          loading={submit.isPending}
          onPress={send}
          testID="homework-send"
        />
        <Button
          variant="ghost"
          label={ta("common.cancel")}
          onPress={onCancel}
          disabled={submit.isPending}
          testID="homework-cancel"
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  list: { gap: space[4] },
  card: { gap: space[3] },
  head: { flexDirection: "row", alignItems: "flex-start", gap: space[2] },
  tags: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space[2] },
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space[2] },
  block: { gap: space[2] },
  rubric: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: space[3],
    gap: space[1],
  },
  rubricRow: { flexDirection: "row", gap: space[2] },
  answer: { gap: space[2], padding: space[3], borderRadius: radius.md },
  form: { gap: space[3] },
  note: { minHeight: 96 },
  attached: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    paddingHorizontal: space[3],
    minHeight: 44,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
  },
});
