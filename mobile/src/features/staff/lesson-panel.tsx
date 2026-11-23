import { Check, Minus, Video, X } from "lucide-react-native";
import { useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";

import {
  useGroupVideo,
  useMarkAttendance,
  useMonthGrid,
  useSetGrade,
  useSetHomework,
  useSetTopic,
  useStartVideo,
} from "@/api/hooks";
import type { AttendanceStatus, TodayLesson, TodayMember } from "@/api/types";
import { Button } from "@/components/button";
import { Field } from "@/components/field";
import { Avatar, Badge, Card, Divider, Notice, Segmented } from "@/components/surface";
import { Text } from "@/components/text";
import { monthOf } from "@/lib/days";
import { errorText, useLocaleChoice, useMoney, useTranslations } from "@/lib/i18n";
import { useLayout } from "@/lib/layout";
import { font, radius, space, useTheme } from "@/lib/theme";
import { openOnSite } from "@/lib/web";

type Tab = "attendance" | "grades";

/**
 * One lesson, ready to teach: start the room, say what the lesson is about,
 * mark who came with one tap each, give grades, set the homework. The same
 * panel fills a phone screen and the right-hand side of a tablet.
 */
export function LessonPanel({
  lesson,
  canMark,
  canSeeBalances,
}: {
  lesson: TodayLesson;
  canMark: boolean;
  canSeeBalances: boolean;
}) {
  const t = useTranslations();
  const [tab, setTab] = useState<Tab>("attendance");
  const [failure, setFailure] = useState<string | null>(null);
  const mark = useMarkAttendance(lesson);
  const fail = (error: unknown) => setFailure(errorText(t, error));

  const setStatus = (member: TodayMember, status: AttendanceStatus) => {
    setFailure(null);
    mark.toggle(member.membershipId, status, fail);
  };
  const allPresent = () => {
    setFailure(null);
    mark.allPresent(fail);
  };
  const unmarked = lesson.members.some((m) => m.attendance === "NOT_MARKED");

  return (
    <View style={styles.panel} testID={`lesson-${lesson.id}`}>
      <RoomCard lesson={lesson} canMark={canMark} />
      {/* A new key when the topic changes elsewhere, so the field shows what the server has. */}
      <TopicCard
        key={`topic-${lesson.id}-${lesson.topic ?? ""}`}
        lesson={lesson}
        canMark={canMark}
      />

      <Segmented<Tab>
        testID="lesson-tab"
        value={tab}
        onChange={setTab}
        options={[
          { value: "attendance", label: t("groups.detail.tabs.attendance") },
          { value: "grades", label: t("groups.detail.tabs.grades") },
        ]}
      />
      {failure ? (
        <Notice tone="destructive" testID="lesson-error">
          {failure}
        </Notice>
      ) : null}

      {lesson.members.length === 0 ? (
        <Card>
          <Text tone="mutedForeground">{t("today.attendance.noStudents")}</Text>
        </Card>
      ) : tab === "attendance" ? (
        <Card style={styles.flush}>
          <View style={styles.rosterHead}>
            <Text
              variant="small"
              tone="mutedForeground"
              style={styles.fill}
              testID="attendance-summary"
            >
              {t("today.attendance.summary", {
                marked: lesson.marked,
                total: lesson.members.length,
                present: lesson.present,
              })}
            </Text>
            {canMark && unmarked ? (
              <Button
                compact
                variant="outline"
                label={t("today.attendance.allPresent")}
                onPress={allPresent}
                testID="all-present"
              />
            ) : null}
          </View>
          {lesson.members.map((member) => (
            <View key={member.membershipId}>
              <Divider />
              <AttendanceRow
                member={member}
                canMark={canMark}
                showDebt={canSeeBalances}
                onMark={(status) => setStatus(member, status)}
              />
            </View>
          ))}
        </Card>
      ) : (
        <GradesCard lesson={lesson} canMark={canMark} onError={fail} />
      )}

      <HomeworkCard key={`hw-${lesson.id}`} lesson={lesson} canMark={canMark} />
    </View>
  );
}

/** Start the group's online lesson, or go into the one that is on. */
function RoomCard({ lesson, canMark }: { lesson: TodayLesson; canMark: boolean }) {
  const t = useTranslations();
  const { locale } = useLocaleChoice();
  const { colors } = useTheme();
  const video = useGroupVideo(lesson.groupId);
  const start = useStartVideo(lesson.groupId);
  const [opening, setOpening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (!video.data?.enabled) return null;
  const room = video.data.room?.status === "LIVE" ? video.data.room : null;
  if (!room && !canMark) return null;

  const open = async () => {
    setError(null);
    setOpening(true);
    try {
      const live = room ?? (await start.mutateAsync(lesson.id));
      await openOnSite(`/${locale}/video/${live.id}`);
    } catch (e) {
      setError(errorText(t, e));
    } finally {
      setOpening(false);
    }
  };

  return (
    <Card style={room ? { borderColor: colors.ring } : undefined}>
      <View style={styles.roomRow}>
        <View style={styles.fill}>
          <Text variant="bodyStrong">{room ? t("studentApp.liveNow") : t("video.title")}</Text>
          <Text variant="small" tone="mutedForeground">
            {room ? t("video.staff.live", { name: room.startedByName }) : t("mobile.roomHint")}
          </Text>
        </View>
        <Button
          compact
          label={room ? t("video.lobby.join") : t("mobile.startLesson")}
          icon={<Video size={16} color={colors.primaryForeground} />}
          onPress={open}
          loading={opening}
          testID="start-lesson"
        />
      </View>
      {error ? <Notice tone="destructive">{error}</Notice> : null}
    </Card>
  );
}

function TopicCard({ lesson, canMark }: { lesson: TodayLesson; canMark: boolean }) {
  const t = useTranslations();
  const save = useSetTopic(lesson);
  const [text, setText] = useState(lesson.topic ?? "");
  const [error, setError] = useState<string | null>(null);

  const commit = () => {
    const next = text.trim();
    if (next === (lesson.topic ?? "")) return;
    setError(null);
    save.mutate({ topic: next || null }, { onError: (e) => setError(errorText(t, e)) });
  };

  if (!canMark) {
    return lesson.topic ? (
      <Card>
        <Text variant="small" tone="mutedForeground">
          {t("groups.attendance.topic")}
        </Text>
        <Text>{lesson.topic}</Text>
      </Card>
    ) : null;
  }
  return (
    <Card>
      <Field
        label={t("groups.attendance.setTopic")}
        value={text}
        onChangeText={setText}
        onBlur={commit}
        onSubmitEditing={commit}
        returnKeyType="done"
        error={error}
        testID="topic"
      />
      {!lesson.topic && lesson.suggestedTopic ? (
        <View style={styles.suggest}>
          <Text variant="small" tone="mutedForeground" style={styles.fill}>
            {t("today.lesson.suggested", { title: lesson.suggestedTopic.title })}
          </Text>
          <Button
            compact
            variant="ghost"
            label={t("today.lesson.useTopic")}
            loading={save.isPending}
            onPress={() =>
              save.mutate(
                { courseTopicId: lesson.suggestedTopic!.id },
                { onError: (e) => setError(errorText(t, e)) },
              )
            }
            testID="use-topic"
          />
        </View>
      ) : null}
    </Card>
  );
}

const MARKS = [
  { status: "PRESENT", icon: Check, tone: "success" },
  { status: "ABSENT", icon: X, tone: "destructive" },
  { status: "EXCUSED", icon: Minus, tone: "warning" },
] as const;

function AttendanceRow({
  member,
  canMark,
  showDebt,
  onMark,
}: {
  member: TodayMember;
  canMark: boolean;
  showDebt: boolean;
  onMark: (status: AttendanceStatus) => void;
}) {
  const t = useTranslations();
  const money = useMoney();
  const { colors } = useTheme();
  const { wide } = useLayout();
  const soft = {
    success: colors.successSoft,
    destructive: colors.destructiveSoft,
    warning: colors.warningSoft,
  };
  const ink = { success: colors.success, destructive: colors.destructive, warning: colors.warning };
  return (
    <View style={styles.row} testID={`member-${member.membershipId}`}>
      {wide ? <Avatar name={member.fullName} /> : null}
      <View style={styles.fill}>
        <Text variant="bodyStrong" numberOfLines={2}>
          {member.fullName}
        </Text>
        {showDebt && member.balance !== null && member.balance < 0 ? (
          <Text variant="small" tone="destructive">
            {t("mobile.owes", { amount: money(-member.balance) })}
          </Text>
        ) : member.status !== "ACTIVE" ? (
          <Text variant="small" tone="mutedForeground">
            {t(`groups.memberStatuses.${member.status}`)}
          </Text>
        ) : null}
      </View>
      <View style={styles.marks}>
        {MARKS.map(({ status, icon: Icon, tone }) => {
          const chosen = member.attendance === status;
          return (
            <Pressable
              key={status}
              disabled={!canMark}
              onPress={() => onMark(status)}
              accessibilityRole="button"
              accessibilityLabel={`${member.fullName}: ${t(`groups.attendance.${status}`)}`}
              accessibilityState={{ selected: chosen, disabled: !canMark }}
              testID={`mark-${status}-${member.membershipId}`}
              style={[
                styles.mark,
                {
                  borderColor: chosen ? ink[tone] : colors.input,
                  backgroundColor: chosen ? soft[tone] : colors.card,
                },
                !canMark && !chosen ? styles.off : null,
              ]}
            >
              <Icon
                size={20}
                color={chosen ? ink[tone] : colors.mutedForeground}
                strokeWidth={chosen ? 2.6 : 1.8}
              />
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

/** Grades for this lesson come from the group's month sheet, where the site keeps them. */
function GradesCard({
  lesson,
  canMark,
  onError,
}: {
  lesson: TodayLesson;
  canMark: boolean;
  onError: (error: unknown) => void;
}) {
  const t = useTranslations();
  const { colors } = useTheme();
  const grid = useMonthGrid(lesson.groupId, monthOf(lesson.date));
  const save = useSetGrade(lesson);
  const grades = grid.data?.lessons.find((l) => l.id === lesson.id)?.grades ?? {};
  return (
    <Card style={styles.flush}>
      {lesson.members.map((member, index) => (
        <View key={member.membershipId}>
          {index > 0 ? <Divider /> : null}
          <View style={styles.row}>
            <Text variant="bodyStrong" numberOfLines={2} style={styles.fill}>
              {member.fullName}
            </Text>
            <GradeInput
              key={`${member.membershipId}-${grades[member.membershipId]?.score ?? ""}`}
              label={`${member.fullName}: ${t("mobile.grade")}`}
              value={grades[member.membershipId]?.score ?? null}
              editable={canMark && !grid.isLoading}
              ink={colors.foreground}
              border={colors.input}
              background={colors.card}
              testID={`grade-${member.membershipId}`}
              onCommit={(score) =>
                save.mutate({ membershipId: member.membershipId, score }, { onError })
              }
            />
          </View>
        </View>
      ))}
    </Card>
  );
}

function GradeInput({
  label,
  value,
  editable,
  ink,
  border,
  background,
  testID,
  onCommit,
}: {
  label: string;
  value: number | null;
  editable: boolean;
  ink: string;
  border: string;
  background: string;
  testID: string;
  onCommit: (score: number | null) => void;
}) {
  const [text, setText] = useState(value === null ? "" : String(value));
  const commit = () => {
    const cleaned = text.replace(",", ".").trim();
    const next = cleaned === "" ? null : Number(cleaned);
    if (next !== null && (!Number.isFinite(next) || next < 0 || next > 1000)) {
      setText(value === null ? "" : String(value));
      return;
    }
    if (next !== value) onCommit(next);
  };
  return (
    <TextInput
      accessibilityLabel={label}
      testID={testID}
      value={text}
      onChangeText={setText}
      onBlur={commit}
      onSubmitEditing={commit}
      editable={editable}
      keyboardType="decimal-pad"
      returnKeyType="done"
      maxLength={5}
      selectTextOnFocus
      placeholder="–"
      style={[styles.grade, { color: ink, borderColor: border, backgroundColor: background }]}
    />
  );
}

function HomeworkCard({ lesson, canMark }: { lesson: TodayLesson; canMark: boolean }) {
  const t = useTranslations();
  const save = useSetHomework(lesson.id);
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(lesson.homework?.text ?? "");
  const [error, setError] = useState<string | null>(null);
  const homework = lesson.homework;

  const submit = () => {
    setError(null);
    save.mutate(
      { text: text.trim() },
      { onSuccess: () => setEditing(false), onError: (e) => setError(errorText(t, e)) },
    );
  };

  return (
    <Card testID="homework">
      <View style={styles.roomRow}>
        <Text variant="heading" style={styles.fill}>
          {t("today.homework.title")}
        </Text>
        {homework && homework.toCheck > 0 ? (
          <Badge tone="warning" label={t("today.homework.toCheck", { count: homework.toCheck })} />
        ) : null}
      </View>
      {editing ? (
        <>
          <Field
            label={t("today.homework.text")}
            value={text}
            onChangeText={setText}
            multiline
            autoFocus
            error={error}
            style={styles.homeworkInput}
            testID="homework-text"
          />
          <View style={styles.actions}>
            <Button
              compact
              variant="outline"
              label={t("today.homework.cancel")}
              onPress={() => setEditing(false)}
            />
            <Button
              compact
              label={t("today.homework.save")}
              onPress={submit}
              loading={save.isPending}
              disabled={text.trim().length === 0}
              testID="homework-save"
            />
          </View>
        </>
      ) : homework ? (
        <>
          <Text>{homework.text}</Text>
          <Text variant="small" tone="mutedForeground">
            {t("today.homework.submitted", { count: homework.submitted })}
          </Text>
          {canMark ? (
            <Button
              compact
              variant="outline"
              label={t("common.edit")}
              onPress={() => {
                setText(homework.text);
                setEditing(true);
              }}
              style={styles.start}
              testID="homework-edit"
            />
          ) : null}
        </>
      ) : (
        <>
          <Text tone="mutedForeground">{t("today.homework.none")}</Text>
          {canMark ? (
            <Button
              compact
              variant="outline"
              label={t("today.homework.set")}
              onPress={() => setEditing(true)}
              style={styles.start}
              testID="homework-set"
            />
          ) : null}
        </>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  panel: { gap: space[4] },
  fill: { flex: 1 },
  flush: { padding: 0, gap: 0 },
  rosterHead: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    minHeight: 60,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingHorizontal: space[4],
    paddingVertical: space[2],
    minHeight: 60,
  },
  marks: { flexDirection: "row", gap: space[2] },
  // 44 points square: the smallest target a finger hits without looking twice.
  mark: {
    width: 44,
    height: 44,
    borderWidth: 1,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  off: { opacity: 0.45 },
  grade: {
    width: 68,
    height: 44,
    borderWidth: 1,
    borderRadius: radius.md,
    textAlign: "center",
    fontFamily: font.semibold,
    fontSize: 16,
  },
  roomRow: { flexDirection: "row", alignItems: "center", gap: space[3] },
  suggest: { flexDirection: "row", alignItems: "center", gap: space[2] },
  actions: { flexDirection: "row", justifyContent: "flex-end", gap: space[2] },
  start: { alignSelf: "flex-start" },
  homeworkInput: { minHeight: 96, textAlignVertical: "top" },
});
