import { useRouter } from "expo-router";
import { StyleSheet, View } from "react-native";

import { useGroups } from "@/api/hooks";
import type { Group } from "@/api/types";
import { Button } from "@/components/button";
import { Header } from "@/components/header";
import { Card, EmptyState, Loading, Notice, Screen } from "@/components/surface";
import { Text } from "@/components/text";
import { weekdayAsDate } from "@/lib/days";
import { errorText, useDate, useTranslations } from "@/lib/i18n";
import { useLayout } from "@/lib/layout";
import { space, useTheme } from "@/lib/theme";

/** "Mon, Wed, Fri 19:30–21:30": the days that share a time are written together. */
export function useScheduleLine(): (group: Pick<Group, "slots">) => string {
  const formatDate = useDate();
  return (group) => {
    const byTime = new Map<string, number[]>();
    for (const slot of group.slots) {
      const time = `${slot.startTime}–${slot.endTime}`;
      byTime.set(time, [...(byTime.get(time) ?? []), slot.weekday]);
    }
    return [...byTime.entries()]
      .map(
        ([time, days]) =>
          `${days
            .sort((a, b) => a - b)
            .map((d) => formatDate(weekdayAsDate(d), { weekday: "short" }))
            .join(", ")} ${time}`,
      )
      .join("; ");
  };
}

/** The groups the person teaches (a teacher) or may see (the office). */
export function GroupsScreen() {
  const t = useTranslations();
  const router = useRouter();
  const { wide } = useLayout();
  const query = useGroups();
  const header = <Header title={t("nav.groups")} />;

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
  const groups = query.data.items;
  return (
    <Screen header={header} onRefresh={() => query.refetch()} refreshing={query.isRefetching}>
      {query.isError ? <Notice tone="warning">{errorText(t, query.error)}</Notice> : null}
      {groups.length === 0 ? (
        <EmptyState title={t("mobile.noGroupsTitle")} text={t("mobile.noGroupsText")} />
      ) : (
        <View style={styles.grid}>
          {groups.map((group) => (
            <View key={group.id} style={wide ? styles.half : styles.full}>
              <GroupCard
                group={group}
                onPress={() =>
                  router.push({ pathname: "/staff/group/[id]", params: { id: group.id } })
                }
              />
            </View>
          ))}
        </View>
      )}
    </Screen>
  );
}

function GroupCard({ group, onPress }: { group: Group; onPress: () => void }) {
  const t = useTranslations();
  const { colors } = useTheme();
  const schedule = useScheduleLine();
  return (
    <Card onPress={onPress} testID={`group-${group.id}`} style={styles.card}>
      <View style={[styles.edge, { backgroundColor: group.courseColor ?? colors.primary }]} />
      <View style={styles.body}>
        <Text variant="heading" numberOfLines={2}>
          {group.name}
        </Text>
        <Text variant="small" tone="mutedForeground" numberOfLines={1}>
          {group.courseName}
        </Text>
        <Text variant="figure" numberOfLines={2}>
          {schedule(group) || t("groups.noLessonYet")}
        </Text>
        <Text variant="small" tone="mutedForeground">
          {t("mobile.students", { count: group.activeStudents })}
          {group.slots[0]?.roomName ? `, ${group.slots[0].roomName}` : ""}
        </Text>
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -space[2], rowGap: space[4] },
  full: { width: "100%", paddingHorizontal: space[2] },
  half: { width: "50%", paddingHorizontal: space[2] },
  card: { flexDirection: "row", padding: 0, gap: 0, overflow: "hidden", flex: 1 },
  edge: { width: 5 },
  body: { flex: 1, padding: space[4], gap: space[1] },
});
