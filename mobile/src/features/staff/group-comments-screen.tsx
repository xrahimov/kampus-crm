import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { ScrollView, StyleSheet, View } from "react-native";

import { useGroup, useMonthGrid } from "@/api/hooks";
import { addStudentComment, staffGroupKeys, useGroupComments } from "@/api/staff-group";
import type { StudentComment } from "@/api/types";
import { Button } from "@/components/button";
import { Field } from "@/components/field";
import { Header } from "@/components/header";
import { Card, EmptyState, Notice, Screen } from "@/components/surface";
import { Text } from "@/components/text";
import { PendingScreen } from "@/features/shared/pending-screen";
import { WordChip } from "@/features/student/answer-parts";
import { errorText, useDate, useTranslations } from "@/lib/i18n";
import { can, useMe } from "@/lib/session";
import { space } from "@/lib/theme";

/** Tashkent's month now, as "2026-11". */
function thisMonth(): string {
  return new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 7);
}

/**
 * Comments on the students of a group, in the app (A-219): what teachers and
 * the office wrote about one student, newest first, and a new one written
 * from the phone. Students and parents never see these.
 */
export function GroupCommentsScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTranslations();
  const tc = useTranslations("students.comments");
  const formatDate = useDate();
  const client = useQueryClient();
  const me = useMe();
  const group = useGroup(id);
  const query = useGroupComments(id);
  const canWrite = can(me, "students.view") && group.data?.status !== "ARCHIVED";
  // Who can be written about: the group's students this month.
  const grid = useMonthGrid(id, thisMonth(), canWrite);
  const [studentId, setStudentId] = useState<string | null>(null);
  const [only, setOnly] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const header = (
    <Header back title={t("groups.detail.tabs.comments")} subtitle={group.data?.name} />
  );
  if (!query.data) return <PendingScreen header={header} query={query} />;
  // Someone who left the group is no longer a teacher's to write about.
  const members = (grid.data?.members ?? []).filter(
    (member) => member.status !== "ARCHIVED" && member.status !== "GRADUATED",
  );
  const shown = only ? query.data.filter((c) => c.studentId === only) : query.data;
  // The list can be narrowed to anyone who has a comment.
  const written = [...new Map(query.data.map((c) => [c.studentId, c.studentName])).entries()];

  const add = () => {
    const note = text.trim();
    if (!note || busy) return;
    if (!studentId) {
      setProblem(t("validation.studentRequired"));
      return;
    }
    setBusy(true);
    setProblem(null);
    addStudentComment(id, studentId, note)
      .then((saved) => {
        client.setQueryData<StudentComment[]>(staffGroupKeys.comments(id), (old) => [
          saved,
          ...(old ?? []),
        ]);
        setText("");
      })
      .catch((error: unknown) => setProblem(errorText(t, error)))
      .finally(() => setBusy(false));
  };

  return (
    <Screen
      header={header}
      onRefresh={() => void query.refetch()}
      refreshing={query.isRefetching}
      contentStyle={styles.column}
    >
      {canWrite && members.length > 0 ? (
        <Card testID="comment-new">
          <View style={styles.block}>
            <Text variant="smallStrong">{t("groups.members.student")}</Text>
            <View style={styles.wrap}>
              {members.map((member) => (
                <WordChip
                  key={member.studentId}
                  label={member.fullName}
                  chosen={studentId === member.studentId}
                  onPress={() => {
                    setStudentId(member.studentId);
                    setProblem(null);
                  }}
                  testID={`comment-student-${member.studentId}`}
                />
              ))}
            </View>
          </View>
          <Field
            label={tc("new")}
            placeholder={tc("placeholder")}
            value={text}
            onChangeText={setText}
            multiline
            maxLength={2000}
            style={styles.text}
            testID="comment-text"
          />
          {problem ? (
            <Notice tone="destructive" testID="comment-problem">
              {problem}
            </Notice>
          ) : null}
          <Button
            label={t("common.add")}
            loading={busy}
            disabled={text.trim().length === 0}
            onPress={add}
            style={styles.start}
            testID="comment-add"
          />
        </Card>
      ) : null}
      {written.length > 1 ? (
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
          keyboardShouldPersistTaps="handled"
        >
          <WordChip
            label={t("mobile.comments.everyone")}
            chosen={only === null}
            onPress={() => setOnly(null)}
            testID="comment-only-all"
          />
          {written.map(([student, name]) => (
            <WordChip
              key={student}
              label={name}
              chosen={only === student}
              onPress={() => setOnly(student)}
              testID={`comment-only-${student}`}
            />
          ))}
        </ScrollView>
      ) : null}
      {shown.length === 0 ? <EmptyState title={tc("empty")} /> : null}
      {shown.map((comment) => (
        <Card key={comment.id} testID={`comment-${comment.id}`}>
          <Text variant="bodyStrong">{comment.studentName}</Text>
          <Text>{comment.text}</Text>
          <Text variant="small" tone="mutedForeground">
            {[
              comment.authorName,
              formatDate(new Date(comment.createdAt), { dateStyle: "medium", timeStyle: "short" }),
            ]
              .filter(Boolean)
              .join(", ")}
          </Text>
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  column: { gap: space[4], maxWidth: 720 },
  block: { gap: space[2] },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  chips: { gap: space[2], paddingRight: space[2] },
  text: { minHeight: 72, textAlignVertical: "top" },
  start: { alignSelf: "flex-start" },
});
