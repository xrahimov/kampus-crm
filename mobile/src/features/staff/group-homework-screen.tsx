import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ExternalLink, Paperclip } from "lucide-react-native";
import { useState } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";

import { useGroup } from "@/api/hooks";
import {
  createAssignment,
  deleteHomework,
  saveLessonHomework,
  staffGroupKeys,
  updateAssignment,
  useGroupHomework,
} from "@/api/staff-group";
import type {
  CheckingItem,
  GroupHomework,
  GroupHomeworkTask,
  HomeworkAnswerRow,
} from "@/api/types";
import { Button } from "@/components/button";
import { Header } from "@/components/header";
import { Badge, Card, Divider, EmptyState, Notice, Screen, type Tone } from "@/components/surface";
import { Text } from "@/components/text";
import { AudioClip } from "@/features/files/audio-clip";
import { fileRoute } from "@/features/files/file-screen";
import { fileSource } from "@/features/room/file-source";
import { PendingScreen } from "@/features/shared/pending-screen";
import { dayAsDate } from "@/lib/days";
import { errorText, useDate, useTranslations } from "@/lib/i18n";
import { useLayout } from "@/lib/layout";
import { can, useMe } from "@/lib/session";
import { space, useTheme } from "@/lib/theme";
import { materialView } from "@kampus/lib/video-material";

import { AnswerCard } from "./checking-screen";
import { nearestLessons } from "./group-materials-screen";
import { TaskForm, type TaskDraft } from "./task-form";

/** What the form is open for. */
type Editing =
  | { kind: "lesson"; lessonId: string; date: string; task: GroupHomeworkTask | null }
  | { kind: "assignment"; task: GroupHomeworkTask | null };

const STATUS_TONE: Record<"NONE" | "SUBMITTED" | "ACCEPTED" | "RETURNED", Tone> = {
  NONE: "neutral",
  SUBMITTED: "warning",
  ACCEPTED: "success",
  RETURNED: "destructive",
};

/**
 * A group's homework on the teacher's side, in the app (A-217): every task
 * with who answered, a new task for a lesson or a named assignment with a
 * file from this phone, and the answers checked right under their task.
 */
export function GroupHomeworkScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTranslations();
  const client = useQueryClient();
  const { wide } = useLayout();
  const me = useMe();
  const group = useGroup(id);
  const query = useGroupHomework(id);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [removing, setRemoving] = useState<GroupHomeworkTask | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const header = (
    <Header back title={t("groups.detail.tabs.homework")} subtitle={group.data?.name} />
  );
  if (!query.data) return <PendingScreen header={header} query={query} />;
  const data = query.data;
  const canSet = can(me, "groups.attendance.mark") && group.data?.status !== "ARCHIVED";

  const put = (task: GroupHomeworkTask) =>
    client.setQueryData<GroupHomework>(staffGroupKeys.homework(id), (old) =>
      old
        ? {
            ...old,
            items: old.items.some((i) => i.id === task.id)
              ? old.items.map((i) => (i.id === task.id ? task : i))
              : [task, ...old.items],
          }
        : old,
    );

  const save = (draft: TaskDraft) => {
    if (!editing || busy) return;
    setBusy(true);
    setProblem(null);
    const sending =
      editing.kind === "lesson"
        ? saveLessonHomework(editing.lessonId, draft)
        : editing.task
          ? updateAssignment(editing.task.id, { ...draft, rubric: editing.task.rubric })
          : createAssignment(id, draft);
    sending
      .then((task) => {
        put(task);
        setEditing(null);
        // The order, the lessons that have homework and the day's lesson all follow.
        void query.refetch();
        void client.invalidateQueries({ queryKey: ["today"] });
      })
      .catch((error: unknown) => setProblem(errorText(t, error)))
      .finally(() => setBusy(false));
  };

  const remove = (task: GroupHomeworkTask) => {
    setBusy(true);
    setProblem(null);
    deleteHomework(task.id)
      .then(() => {
        client.setQueryData<GroupHomework>(staffGroupKeys.homework(id), (old) =>
          old ? { ...old, items: old.items.filter((i) => i.id !== task.id) } : old,
        );
        setRemoving(null);
        void query.refetch();
        void client.invalidateQueries({ queryKey: ["today"] });
        void client.invalidateQueries({ queryKey: ["checking"] });
      })
      .catch((error: unknown) => setProblem(errorText(t, error)))
      .finally(() => setBusy(false));
  };

  const edit = (task: GroupHomeworkTask) => {
    setProblem(null);
    setRemoving(null);
    setEditing(
      task.lessonId
        ? { kind: "lesson", lessonId: task.lessonId, date: task.lessonDate ?? data.today, task }
        : { kind: "assignment", task },
    );
  };

  const list = (
    <View style={styles.list}>
      {removing ? (
        <Card testID="task-delete-confirm">
          <Text variant="bodyStrong">{t("groups.homework.deleteTitle")}</Text>
          <Text numberOfLines={2}>{removing.title ?? removing.text}</Text>
          <Text variant="small" tone="mutedForeground">
            {t("groups.homework.deleteText")}
          </Text>
          <View style={styles.row}>
            <Button
              compact
              variant="destructive"
              label={t("groups.homework.delete")}
              loading={busy}
              onPress={() => remove(removing)}
              testID="task-delete-yes"
            />
            <Button
              compact
              variant="ghost"
              label={t("common.cancel")}
              disabled={busy}
              onPress={() => setRemoving(null)}
              testID="task-delete-no"
            />
          </View>
        </Card>
      ) : null}
      {problem && !editing ? <Notice tone="destructive">{problem}</Notice> : null}
      {data.items.length === 0 ? (
        <EmptyState
          title={t("groups.homework.empty")}
          text={canSet ? t("mobile.task.emptyHint") : undefined}
        />
      ) : (
        data.items.map((task) => (
          <Task
            key={task.id}
            task={task}
            groupId={id}
            groupName={group.data?.name ?? ""}
            canSet={canSet}
            onEdit={() => edit(task)}
            onDelete={() => {
              setProblem(null);
              setEditing(null);
              setRemoving(task);
            }}
          />
        ))
      )}
    </View>
  );

  const set = canSet ? (
    <SetTask
      data={data}
      editing={editing}
      busy={busy}
      problem={editing ? problem : null}
      onStart={(next) => {
        setProblem(null);
        setRemoving(null);
        setEditing(next);
      }}
      onSave={save}
      onCancel={() => {
        setEditing(null);
        setProblem(null);
      }}
    />
  ) : null;

  return (
    <Screen
      header={header}
      onRefresh={() => void query.refetch()}
      refreshing={query.isRefetching}
      contentStyle={wide ? styles.split : styles.column}
    >
      {wide ? (
        <>
          <View style={styles.wideList}>{list}</View>
          {set ? <View style={styles.wideSet}>{set}</View> : null}
        </>
      ) : (
        <>
          {set}
          {list}
        </>
      )}
    </Screen>
  );
}

/** Where a new task goes (one of the nearest lessons, or an assignment), then its form. */
function SetTask({
  data,
  editing,
  busy,
  problem,
  onStart,
  onSave,
  onCancel,
}: {
  data: GroupHomework;
  editing: Editing | null;
  busy: boolean;
  problem: string | null;
  onStart: (editing: Editing) => void;
  onSave: (draft: TaskDraft) => void;
  onCancel: () => void;
}) {
  const t = useTranslations();
  const formatDate = useDate();
  const { colors } = useTheme();
  const lessonDay = (date: string) =>
    t("groups.homework.lessonOf", {
      date: formatDate(dayAsDate(date), { day: "numeric", month: "short" }),
    });

  if (editing) {
    const task = editing.task;
    return (
      <Card testID="task-set">
        <Text variant="heading">
          {editing.kind === "assignment"
            ? task
              ? t("groups.homework.assignment.editTitle")
              : t("groups.homework.assignment.addTitle")
            : task
              ? t("groups.homework.editTitle")
              : t("groups.homework.addTitle")}
        </Text>
        {editing.kind === "lesson" ? (
          <Text tone="mutedForeground" testID="task-target">
            {lessonDay(editing.date)}
          </Text>
        ) : (
          <Text variant="small" tone="mutedForeground">
            {t("mobile.task.assignmentHint")}
          </Text>
        )}
        <TaskForm
          // A different target starts from that target's own task.
          key={editing.kind === "lesson" ? editing.lessonId : (task?.id ?? "new")}
          start={task ?? {}}
          named={editing.kind === "assignment"}
          today={data.today}
          busy={busy}
          problem={problem}
          onSave={onSave}
          onCancel={onCancel}
        />
      </Card>
    );
  }

  const lessons = nearestLessons(data.lessons, data.today);
  return (
    <Card testID="task-set" style={styles.flush}>
      <View style={styles.pad}>
        <Text variant="heading">{t("groups.homework.add")}</Text>
        <Text variant="small" tone="mutedForeground">
          {t("mobile.task.pick")}
        </Text>
      </View>
      {lessons.map((lesson) => (
        <View key={lesson.id}>
          <Divider />
          <Pressable
            onPress={() =>
              onStart({
                kind: "lesson",
                lessonId: lesson.id,
                date: lesson.date,
                task: data.items.find((i) => i.lessonId === lesson.id) ?? null,
              })
            }
            accessibilityRole="button"
            style={({ pressed }) => [styles.target, pressed && { backgroundColor: colors.muted }]}
            testID={`task-for-${lesson.id}`}
          >
            <View style={styles.fill}>
              <Text variant="bodyStrong">{lessonDay(lesson.date)}</Text>
              {lesson.topic ? (
                <Text variant="small" tone="mutedForeground" numberOfLines={1}>
                  {lesson.topic}
                </Text>
              ) : null}
            </View>
            {lesson.hasHomework ? <Badge label={t("groups.homework.hasHomework")} /> : null}
          </Pressable>
        </View>
      ))}
      <Divider />
      <Pressable
        onPress={() => onStart({ kind: "assignment", task: null })}
        accessibilityRole="button"
        style={({ pressed }) => [styles.target, pressed && { backgroundColor: colors.muted }]}
        testID="task-for-assignment"
      >
        <View style={styles.fill}>
          <Text variant="bodyStrong">{t("groups.homework.assignment.add")}</Text>
          <Text variant="small" tone="mutedForeground">
            {t("mobile.task.assignmentHint")}
          </Text>
        </View>
      </Pressable>
    </Card>
  );
}

function Task({
  task,
  groupId,
  groupName,
  canSet,
  onEdit,
  onDelete,
}: {
  task: GroupHomeworkTask;
  groupId: string;
  groupName: string;
  canSet: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const t = useTranslations();
  const formatDate = useDate();
  const router = useRouter();
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const short = (iso: string) => formatDate(dayAsDate(iso), { day: "numeric", month: "short" });
  const answered = task.submissions.filter((s) => s.status !== null).length;
  const accepted = task.submissions.filter((s) => s.status === "ACCEPTED").length;
  const waiting = task.submissions.filter((s) => s.status === "SUBMITTED");
  const name =
    task.title ??
    (task.lessonDate ? t("groups.homework.lessonOf", { date: short(task.lessonDate) }) : "");

  return (
    <View style={styles.task} testID={`task-${task.id}`}>
      <Card>
        <View style={styles.head}>
          <View style={styles.fill}>
            <Text variant="heading">{name}</Text>
            {task.lessonTopic ? (
              <Text variant="small" tone="mutedForeground" numberOfLines={1}>
                {task.lessonTopic}
              </Text>
            ) : null}
          </View>
          {waiting.length > 0 ? (
            <Badge
              tone="warning"
              label={t("today.homework.toCheck", { count: waiting.length })}
              testID="task-waiting"
            />
          ) : null}
        </View>
        {task.title !== null || task.speaking ? (
          <View style={styles.row}>
            {task.title !== null ? (
              <Badge tone="accent" label={t("groups.homework.assignment.badge")} />
            ) : null}
            {task.speaking ? <Badge label={t("groups.homework.speakingBadge")} /> : null}
          </View>
        ) : null}
        <Text numberOfLines={open ? undefined : 4} testID="task-shown">
          {task.text}
        </Text>
        {task.dueDate ? (
          <Text variant="small" tone="mutedForeground" testID="task-due">
            {t("groups.homework.due", { date: short(task.dueDate) })}
          </Text>
        ) : null}
        {task.linkUrl || task.attachmentUrl ? (
          <View style={styles.row}>
            {task.linkUrl ? (
              <Button
                compact
                variant="outline"
                label={t("mobile.homework.openLink")}
                icon={<ExternalLink size={16} color={colors.foreground} />}
                onPress={() => void Linking.openURL(task.linkUrl!).catch(() => undefined)}
                testID="task-open-link"
              />
            ) : null}
            {task.attachmentUrl ? (
              <Button
                compact
                variant="outline"
                label={t("mobile.homework.openFile")}
                icon={<Paperclip size={16} color={colors.foreground} />}
                onPress={() => router.push(fileRoute(task.attachmentUrl!, name))}
                testID="task-open-file"
              />
            ) : null}
          </View>
        ) : null}
        <Text variant="small" tone="mutedForeground" testID="task-progress">
          {t("groups.homework.progress", {
            answered,
            total: task.submissions.length,
            accepted,
          })}
        </Text>
        <View style={styles.actions}>
          <Button
            compact
            variant="ghost"
            label={open ? t("mobile.task.hideAnswers") : t("mobile.task.answers")}
            onPress={() => setOpen((was) => !was)}
            testID="task-answers"
          />
          <Button
            compact
            variant="ghost"
            label={t("groups.homework.exercises")}
            onPress={() =>
              router.push({ pathname: "/staff/exercises/[id]", params: { id: task.id, name } })
            }
            testID="task-exercises"
          />
          {canSet ? (
            <>
              <Button
                compact
                variant="ghost"
                label={t("groups.homework.delete")}
                onPress={onDelete}
                testID="task-delete"
              />
              <Button
                compact
                variant="outline"
                label={t("groups.homework.edit")}
                onPress={onEdit}
                testID="task-edit"
              />
            </>
          ) : null}
        </View>
      </Card>
      {open ? (
        <>
          <Card style={styles.flush} testID="task-rows">
            {task.submissions.map((row, index) => (
              <View key={row.membershipId}>
                {index > 0 ? <Divider /> : null}
                <AnswerRow task={task} row={row} />
              </View>
            ))}
          </Card>
          {canSet
            ? waiting.map((row) => (
                <AnswerCard
                  key={row.membershipId}
                  item={asWaiting(task, row, groupId, groupName)}
                />
              ))
            : null}
        </>
      ) : null}
    </View>
  );
}

/** One student under a task: where their answer stands, and what was said about it. */
function AnswerRow({ task, row }: { task: GroupHomeworkTask; row: HomeworkAnswerRow }) {
  const t = useTranslations();
  const router = useRouter();
  const status = row.status ?? "NONE";
  // A waiting answer is shown in full in its own card below.
  const checked = row.status === "ACCEPTED" || row.status === "RETURNED";
  const spoken = row.attachmentUrl !== null && materialView("FILE", row.attachmentUrl) === "audio";
  return (
    <View style={styles.answer} testID={`task-row-${row.membershipId}`}>
      <View style={styles.head}>
        <Text variant="bodyStrong" style={styles.fill} numberOfLines={1}>
          {row.fullName}
        </Text>
        <Badge tone={STATUS_TONE[status]} label={t(`groups.homework.status.${status}`)} />
      </View>
      {checked && row.note ? <Text numberOfLines={3}>{row.note}</Text> : null}
      {checked && row.attachmentUrl ? (
        spoken ? (
          <AudioClip source={fileSource(row.attachmentUrl)} label={t("mobile.checking.spoken")} />
        ) : (
          <Button
            compact
            variant="ghost"
            label={t("checking.attachment")}
            onPress={() => router.push(fileRoute(row.attachmentUrl!, row.fullName))}
            style={styles.start}
          />
        )
      ) : null}
      {checked && row.score !== null && task.maxScore !== null ? (
        <Text variant="small" tone="mutedForeground" testID="task-row-score">
          {t("groups.homework.assignment.score", { points: row.score, max: task.maxScore })}
        </Text>
      ) : null}
      {checked && row.teacherComment ? (
        <Text variant="small" tone="mutedForeground">
          {row.teacherComment}
        </Text>
      ) : null}
    </View>
  );
}

/** A waiting answer in the shape the checking card takes. */
function asWaiting(
  task: GroupHomeworkTask,
  row: HomeworkAnswerRow,
  groupId: string,
  groupName: string,
): CheckingItem {
  return {
    homeworkId: task.id,
    membershipId: row.membershipId,
    studentId: row.studentId,
    fullName: row.fullName,
    groupId,
    groupName,
    lessonDate: task.lessonDate,
    lessonTopic: task.lessonTopic,
    title: task.title,
    text: task.text,
    linkUrl: task.linkUrl,
    speaking: task.speaking,
    rubric: task.rubric,
    note: row.note,
    attachmentUrl: row.attachmentUrl,
    submittedAt: row.submittedAt ?? task.createdAt,
  };
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  flush: { padding: 0, gap: 0 },
  pad: { padding: space[4], gap: space[1] },
  column: { gap: space[6] },
  split: { flexDirection: "row", alignItems: "flex-start", gap: space[6] },
  wideList: { flex: 3, gap: space[4] },
  wideSet: { flex: 2 },
  list: { gap: space[4] },
  task: { gap: space[2] },
  head: { flexDirection: "row", alignItems: "flex-start", gap: space[3] },
  row: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space[2] },
  actions: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-end",
    alignItems: "center",
    gap: space[2],
  },
  start: { alignSelf: "flex-start" },
  target: {
    minHeight: 56,
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingHorizontal: space[4],
    paddingVertical: space[2],
  },
  answer: { gap: space[1], paddingHorizontal: space[4], paddingVertical: space[3] },
});
