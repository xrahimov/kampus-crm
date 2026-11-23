import { useRouter } from "expo-router";
import { ListChecks } from "lucide-react-native";
import { Pressable, StyleSheet, View } from "react-native";

import type { PortalExerciseSummary } from "@/api/types";
import { Text } from "@/components/text";
import { useTranslations } from "@/lib/i18n";
import { radius, space, useTheme } from "@/lib/theme";

import { exerciseRoute } from "./exercise-screen";

/**
 * Self-check exercises as rows, each with the best go so far and **Practise**
 * or **Try again**; a row opens the exercise. Homework tasks (A-213) and the
 * course's topics (A-215) list them the same way. `testID` names the rows:
 * `<testID>-<exercise id>`.
 */
export function ExerciseRows({
  token,
  exercises,
  testID,
}: {
  token: string;
  exercises: PortalExerciseSummary[];
  testID: string;
}) {
  const t = useTranslations("portal.exercises");
  const { colors } = useTheme();
  const router = useRouter();
  if (exercises.length === 0) return null;
  return (
    <View style={styles.block} testID={`${testID}s`}>
      {exercises.map((exercise) => (
        <Pressable
          key={exercise.id}
          onPress={() => router.push(exerciseRoute(token, exercise))}
          accessibilityRole="button"
          accessibilityLabel={exercise.title}
          style={[styles.exercise, { borderColor: colors.border, backgroundColor: colors.card }]}
          testID={`${testID}-${exercise.id}`}
        >
          <ListChecks size={18} color={colors.primary} />
          <View style={styles.fill}>
            <Text numberOfLines={2}>{exercise.title}</Text>
            <Text variant="small" tone="mutedForeground">
              {[
                t("items", { count: exercise.itemCount }),
                exercise.best
                  ? t("best", {
                      score: exercise.best.score,
                      max: exercise.best.maxScore,
                      percent: exercise.best.percent,
                    })
                  : null,
              ]
                .filter(Boolean)
                .join(", ")}
            </Text>
          </View>
          <Text variant="smallStrong" tone="primary">
            {exercise.best ? t("again") : t("start")}
          </Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  block: { gap: space[2] },
  exercise: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingHorizontal: space[3],
    paddingVertical: space[2],
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
  },
});
