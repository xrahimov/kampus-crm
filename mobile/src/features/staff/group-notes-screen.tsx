import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { useGroup } from "@/api/hooks";
import { addGroupNote, staffGroupKeys, useGroupNotes } from "@/api/staff-group";
import type { GroupNote } from "@/api/types";
import { Button } from "@/components/button";
import { Field } from "@/components/field";
import { Header } from "@/components/header";
import { Card, EmptyState, Notice, Screen } from "@/components/surface";
import { Text } from "@/components/text";
import { PendingScreen } from "@/features/shared/pending-screen";
import { errorText, useDate, useTranslations } from "@/lib/i18n";
import { can, useMe } from "@/lib/session";
import { space } from "@/lib/theme";

/**
 * A group's notes, in the app (A-217): what the office and the teachers wrote
 * down about the group, newest first. Whoever may change the group adds one.
 */
export function GroupNotesScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTranslations();
  const formatDate = useDate();
  const client = useQueryClient();
  const me = useMe();
  const group = useGroup(id);
  const query = useGroupNotes(id);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const header = <Header back title={t("groups.detail.tabs.notes")} subtitle={group.data?.name} />;
  if (!query.data) return <PendingScreen header={header} query={query} />;

  const add = () => {
    const note = text.trim();
    if (!note || busy) return;
    setBusy(true);
    setProblem(null);
    addGroupNote(id, note)
      .then((saved) => {
        client.setQueryData<GroupNote[]>(staffGroupKeys.notes(id), (old) => [
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
      {can(me, "groups.update") ? (
        <Card testID="note-new">
          <Field
            label={t("groups.notes.newNote")}
            placeholder={t("groups.notes.placeholder")}
            value={text}
            onChangeText={setText}
            multiline
            maxLength={2000}
            style={styles.text}
            testID="note-text"
          />
          {problem ? <Notice tone="destructive">{problem}</Notice> : null}
          <Button
            label={t("common.add")}
            loading={busy}
            disabled={text.trim().length === 0}
            onPress={add}
            style={styles.start}
            testID="note-add"
          />
        </Card>
      ) : null}
      {query.data.length === 0 ? <EmptyState title={t("groups.notes.empty")} /> : null}
      {query.data.map((note) => (
        <Card key={note.id} testID={`note-${note.id}`}>
          <Text>{note.text}</Text>
          <View>
            <Text variant="small" tone="mutedForeground">
              {[
                note.authorName,
                formatDate(new Date(note.createdAt), { dateStyle: "medium", timeStyle: "short" }),
              ]
                .filter(Boolean)
                .join(", ")}
            </Text>
          </View>
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  column: { gap: space[4], maxWidth: 720 },
  text: { minHeight: 72, textAlignVertical: "top" },
  start: { alignSelf: "flex-start" },
});
