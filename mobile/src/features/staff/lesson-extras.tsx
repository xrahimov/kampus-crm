import { Star } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { useLessonRatings } from "@/api/group-lessons";
import { useMonthGrid, useSetTopic } from "@/api/hooks";
import { useGroupPlan } from "@/api/staff-group";
import type { GridLesson, TodayLesson } from "@/api/types";
import { Field } from "@/components/field";
import { Select } from "@/components/select";
import { Card, Divider, Notice } from "@/components/surface";
import { Text } from "@/components/text";
import { dayAsDate, monthOf } from "@/lib/days";
import { errorText, useDate, useTranslations } from "@/lib/i18n";
import { space, useTheme } from "@/lib/theme";

/**
 * The rest of what the site's lesson window holds (A-262): which topic of the
 * course plan the lesson covers, a link put on the lesson, the teacher's note
 * to the students, and what the students thought of the lesson. All of it
 * comes with the group's month, where the lesson's grades come from too.
 */
export function LessonExtras({ lesson, canMark }: { lesson: TodayLesson; canMark: boolean }) {
  const t = useTranslations("groups.attendance");
  const grid = useMonthGrid(lesson.groupId, monthOf(lesson.date));
  const row = grid.data?.lessons.find((one) => one.id === lesson.id);
  if (!row) return null;
  return (
    <>
      {canMark ? (
        // A new key when the server has something else, so the fields show it.
        <ForStudents
          key={`${row.id}-${row.courseTopicId ?? ""}-${row.attachmentUrl ?? ""}-${row.studentNote ?? ""}`}
          lesson={lesson}
          row={row}
        />
      ) : row.studentNote ? (
        <Card testID="student-note-shown">
          <Text variant="small" tone="mutedForeground">
            {t("studentNote")}
          </Text>
          <Text>{row.studentNote}</Text>
        </Card>
      ) : null}
      {/* A stale count of none is put right when the month is read again. */}
      {(row.rating?.count ?? 0) > 0 ? <Ratings lessonId={row.id} /> : null}
    </>
  );
}

function ForStudents({ lesson, row }: { lesson: TodayLesson; row: GridLesson }) {
  const t = useTranslations();
  const ta = useTranslations("groups.attendance");
  const plan = useGroupPlan(lesson.groupId);
  const save = useSetTopic(lesson);
  const [link, setLink] = useState(row.attachmentUrl ?? "");
  const [note, setNote] = useState(row.studentNote ?? "");
  const [error, setError] = useState<unknown>(null);
  const topics = plan.data?.topics ?? [];
  const send = (input: Parameters<typeof save.mutate>[0]) => {
    setError(null);
    save.mutate(input, { onError: setError });
  };
  const commitLink = () => {
    const next = link.trim() || null;
    if (next !== (row.attachmentUrl ?? null)) send({ attachmentUrl: next });
  };
  const commitNote = () => {
    const next = note.trim() || null;
    if (next !== (row.studentNote ?? null)) send({ studentNote: next });
  };

  return (
    <Card style={styles.form} testID="lesson-extras">
      {error ? (
        <Notice tone="destructive" testID="lesson-extras-problem">
          {errorText(t, error)}
        </Notice>
      ) : null}
      {topics.length > 0 ? (
        <Select
          label={ta("syllabusTopic")}
          value={row.courseTopicId}
          onChange={(courseTopicId) => send({ courseTopicId })}
          options={topics.map((topic) => ({
            value: topic.id,
            label: `${topic.sortOrder}. ${topic.title}`,
          }))}
          clearLabel={t("mobile.lessons.noPlanTopic")}
          testID="plan-topic"
        />
      ) : null}
      <Field
        label={ta("studentNote")}
        hint={ta("studentNoteHint")}
        value={note}
        onChangeText={setNote}
        onBlur={commitNote}
        multiline
        maxLength={1000}
        style={styles.note}
        testID="student-note"
      />
      <Field
        label={ta("attachment")}
        value={link}
        onChangeText={setLink}
        onBlur={commitLink}
        onSubmitEditing={commitLink}
        returnKeyType="done"
        keyboardType="url"
        autoCapitalize="none"
        autoCorrect={false}
        maxLength={500}
        placeholder="https://"
        testID="lesson-link"
      />
    </Card>
  );
}

/** One to five stars, said aloud as a number. */
function Stars({ count, label }: { count: number; label: string }) {
  const { colors } = useTheme();
  return (
    <View style={styles.stars} accessibilityRole="image" accessibilityLabel={label}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star
          key={n}
          size={14}
          color={n <= count ? colors.warning : colors.input}
          fill={n <= count ? colors.warning : "transparent"}
        />
      ))}
    </View>
  );
}

function Ratings({ lessonId }: { lessonId: string }) {
  const t = useTranslations();
  const date = useDate();
  const { colors } = useTheme();
  const ratings = useLessonRatings(lessonId, true);
  const data = ratings.data;
  if (!data || data.rows.length === 0) return null;
  return (
    <Card style={styles.flush} testID="lesson-ratings">
      <View style={styles.head}>
        <Text variant="heading" style={styles.fill}>
          {t("groups.attendance.ratings")}
        </Text>
        <Star size={16} color={colors.warning} fill={colors.warning} />
        <Text variant="bodyStrong" testID="lesson-ratings-average">
          {data.average}
        </Text>
        <Text variant="small" tone="mutedForeground">
          ({data.rows.length})
        </Text>
      </View>
      {data.rows.map((one) => (
        <View key={one.membershipId}>
          <Divider />
          <View style={styles.rating} testID={`lesson-rating-${one.membershipId}`}>
            <View style={styles.fill}>
              <Text variant="bodyStrong" numberOfLines={2}>
                {one.fullName}
              </Text>
              {one.comment ? <Text tone="mutedForeground">{one.comment}</Text> : null}
            </View>
            <View style={styles.when}>
              <Stars count={one.rating} label={t("portal.lessons.stars", { count: one.rating })} />
              <Text variant="small" tone="mutedForeground">
                {date(dayAsDate(one.at.slice(0, 10)), { day: "numeric", month: "short" })}
              </Text>
            </View>
          </View>
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  form: { gap: space[4] },
  note: { minHeight: 96, textAlignVertical: "top" },
  flush: { padding: 0, gap: 0, overflow: "hidden" },
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[1],
    paddingHorizontal: space[4],
    paddingVertical: space[3],
  },
  rating: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space[3],
    paddingHorizontal: space[4],
    paddingVertical: space[3],
  },
  when: { alignItems: "flex-end", gap: space[1] },
  stars: { flexDirection: "row", gap: 2 },
});
