import { useLocalSearchParams } from "expo-router";
import { StyleSheet } from "react-native";

import { Header } from "@/components/header";
import { Screen } from "@/components/surface";
import { Text } from "@/components/text";
import { useTranslations } from "@/lib/i18n";
import { space } from "@/lib/theme";

import { ExercisesPanel } from "./exercises-panel";

/**
 * The self-check exercises of one homework (A-158, in the app A-263), as the
 * site's "Exercises" on a homework. `name` is what the homework is called on
 * the page it was opened from.
 */
export function HomeworkExercisesScreen() {
  const { id, name } = useLocalSearchParams<{ id: string; name?: string }>();
  const t = useTranslations();
  return (
    <Screen
      header={<Header back title={t("groups.homework.exercises")} subtitle={name} />}
      contentStyle={styles.column}
    >
      <Text tone="mutedForeground">{t("exercises.hint")}</Text>
      <ExercisesPanel anchor={{ homeworkId: id }} />
    </Screen>
  );
}

const styles = StyleSheet.create({ column: { gap: space[4] } });
