import { useRouter } from "expo-router";
import { ChevronRight, ListChecks, Plus, Trash2 } from "lucide-react-native";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import {
  useDeleteExercise,
  useExercises,
  type ExerciseAnchor,
  type StaffExercise,
} from "@/api/topic-content";
import { Button } from "@/components/button";
import { Confirm } from "@/components/confirm";
import { Card, Divider, Loading } from "@/components/surface";
import { Text } from "@/components/text";
import { errorText, useTranslations } from "@/lib/i18n";
import { space, useTheme } from "@/lib/theme";

/**
 * The self-check exercises on a topic or on a homework, for staff (A-158, in
 * the app A-263): each with how many items it has and how many students tried
 * it. Whoever the server lets write adds one, opens one to change it and see
 * the results, or deletes it after a question.
 */
export function ExercisesPanel({ anchor }: { anchor: ExerciseAnchor }) {
  const t = useTranslations();
  const te = useTranslations("exercises");
  const router = useRouter();
  const { colors } = useTheme();
  const list = useExercises(anchor);
  const remove = useDeleteExercise();
  const [deleting, setDeleting] = useState<StaffExercise | null>(null);
  const canEdit = list.data?.canEdit ?? false;
  const where = anchor.topicId ? { topic: anchor.topicId } : { homework: anchor.homeworkId ?? "" };
  const open = (id: string) =>
    router.push({ pathname: "/staff/exercise/[id]", params: { id, ...where } });

  return (
    <Card style={styles.flush} testID="exercises-panel">
      <View style={styles.head}>
        <ListChecks size={18} color={colors.mutedForeground} />
        <Text variant="heading" style={styles.fill}>
          {te("heading")}
        </Text>
        {canEdit ? (
          <Button
            compact
            variant="outline"
            label={te("new")}
            icon={<Plus size={16} color={colors.foreground} />}
            onPress={() => open("new")}
            testID="exercise-new"
          />
        ) : null}
      </View>
      {list.isLoading ? (
        <Loading />
      ) : !list.data || list.data.items.length === 0 ? (
        <Text tone="mutedForeground" style={styles.empty} testID="exercises-empty">
          {list.isError ? errorText(t, list.error) : te("empty")}
        </Text>
      ) : (
        list.data.items.map((one) => (
          <View key={one.id}>
            <Divider />
            <View style={styles.row} testID={`exercise-${one.id}`}>
              <Pressable
                disabled={!canEdit}
                onPress={() => open(one.id)}
                accessibilityRole="button"
                accessibilityLabel={one.title}
                style={({ pressed }) => [
                  styles.words,
                  pressed ? { backgroundColor: colors.muted } : null,
                ]}
                testID={`exercise-open-${one.id}`}
              >
                <View style={styles.fill}>
                  <Text variant="bodyStrong" numberOfLines={2}>
                    {one.title}
                  </Text>
                  <Text variant="small" tone="mutedForeground">
                    {te("summary", { items: one.items.length, attempted: one.attempted })}
                  </Text>
                </View>
                {canEdit ? <ChevronRight size={18} color={colors.mutedForeground} /> : null}
              </Pressable>
              {canEdit ? (
                <Pressable
                  onPress={() => {
                    remove.reset();
                    setDeleting(one);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={`${te("delete")}: ${one.title}`}
                  hitSlop={6}
                  style={styles.bin}
                  testID={`exercise-delete-${one.id}`}
                >
                  <Trash2 size={18} color={colors.destructive} />
                </Pressable>
              ) : null}
            </View>
          </View>
        ))
      )}
      <Confirm
        open={deleting !== null}
        onClose={() => setDeleting(null)}
        title={te("deleteTitle")}
        text={te("deleteText")}
        label={te("delete")}
        destructive
        loading={remove.isPending}
        problem={remove.error ? errorText(t, remove.error) : null}
        onConfirm={() => {
          if (deleting) remove.mutate(deleting.id, { onSuccess: () => setDeleting(null) });
        }}
        testID="exercise-delete"
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  flush: { padding: 0, gap: 0, overflow: "hidden" },
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    paddingHorizontal: space[4],
    paddingVertical: space[3],
  },
  empty: { paddingHorizontal: space[4], paddingBottom: space[4] },
  row: { flexDirection: "row", alignItems: "stretch" },
  words: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    paddingLeft: space[4],
    paddingRight: space[2],
    paddingVertical: space[3],
    minHeight: 56,
  },
  bin: { width: 48, alignItems: "center", justifyContent: "center" },
});
