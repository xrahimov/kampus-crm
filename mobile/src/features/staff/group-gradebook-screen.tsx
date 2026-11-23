import { useLocalSearchParams } from "expo-router";
import { StyleSheet, View } from "react-native";

import { useGroup } from "@/api/hooks";
import { useGroupGradebook } from "@/api/staff-group";
import type { GroupGradebook } from "@/api/types";
import { Header } from "@/components/header";
import { Card, EmptyState, Screen } from "@/components/surface";
import { Text } from "@/components/text";
import { PendingScreen } from "@/features/shared/pending-screen";
import { Meter } from "@/features/student/meter";
import { useTranslations } from "@/lib/i18n";
import { useLayout } from "@/lib/layout";
import { space } from "@/lib/theme";

type Row = GroupGradebook["students"][number];

/**
 * A group's gradebook on the teacher's side, in the app (A-217): each
 * student's final grade and level, and what it is made of. Reading only: the
 * weights are the course's and are changed in the office.
 */
export function GroupGradebookScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTranslations();
  const { wide } = useLayout();
  const group = useGroup(id);
  const query = useGroupGradebook(id);

  const header = (
    <Header back title={t("groups.detail.tabs.gradebook")} subtitle={group.data?.name} />
  );
  if (!query.data) return <PendingScreen header={header} query={query} />;
  const book = query.data;

  return (
    <Screen
      header={header}
      onRefresh={() => void query.refetch()}
      refreshing={query.isRefetching}
      contentStyle={styles.column}
    >
      <View style={styles.intro}>
        <Text tone="mutedForeground" testID="gradebook-intro">
          {t("groups.gradebook.intro", { course: book.courseName })}
        </Text>
        <Text variant="small" tone="mutedForeground" testID="gradebook-scale">
          {book.scaleName
            ? t("groups.gradebook.scale", { name: book.scaleName })
            : t("groups.gradebook.noScale")}
        </Text>
      </View>
      {book.students.length === 0 ? (
        <EmptyState title={t("groups.gradebook.empty")} />
      ) : (
        <View style={[styles.grid, wide && styles.gridWide]}>
          {book.students.map((row) => (
            <View key={row.membershipId} style={wide ? styles.half : undefined}>
              <StudentCard row={row} />
            </View>
          ))}
        </View>
      )}
    </Screen>
  );
}

function StudentCard({ row }: { row: Row }) {
  const t = useTranslations();
  return (
    <Card testID={`gradebook-${row.membershipId}`}>
      <View style={styles.head}>
        <View style={styles.fill}>
          <Text variant="heading" numberOfLines={1}>
            {row.fullName}
          </Text>
          {row.status !== "ACTIVE" ? (
            <Text variant="small" tone="mutedForeground">
              {t(`groups.memberStatuses.${row.status}`)}
            </Text>
          ) : null}
        </View>
        <View style={styles.final}>
          <Text variant="figure" testID="gradebook-final">
            {row.final === null ? "–" : `${row.final}%`}
          </Text>
          {row.level ? (
            <Text variant="small" tone="mutedForeground" testID="gradebook-level">
              {row.level}
            </Text>
          ) : null}
        </View>
      </View>
      {row.categories
        .filter((category) => category.weight > 0)
        .map((category) => {
          const name = t(`groups.gradebook.categories.${category.key}`);
          return (
            <View key={category.key} style={styles.category}>
              <View style={styles.head}>
                <Text variant="small" style={styles.fill}>
                  {name}
                </Text>
                <Text variant="small" tone="mutedForeground">
                  {category.percent === null
                    ? t("groups.gradebook.items", { count: 0 })
                    : `${category.percent}%, ${t("groups.gradebook.items", { count: category.count })}`}
                </Text>
              </View>
              <Meter percent={category.percent} label={name} />
            </View>
          );
        })}
    </Card>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  column: { gap: space[4] },
  intro: { gap: space[1] },
  grid: { gap: space[4] },
  gridWide: { flexDirection: "row", flexWrap: "wrap" },
  half: { width: "48.5%" },
  head: { flexDirection: "row", alignItems: "flex-start", gap: space[3] },
  final: { alignItems: "flex-end" },
  category: { gap: space[1] },
});
