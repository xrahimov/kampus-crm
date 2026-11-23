import { useRouter } from "expo-router";
import { Plus } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import {
  GROUP_STATUSES,
  useGroupList,
  useGroupOptions,
  WEEKDAY_PATTERNS,
  type GroupListFilters,
} from "@/api/office-groups";
import type { Group, GroupStatus } from "@/api/types";
import { Button } from "@/components/button";
import { Field } from "@/components/field";
import { Header } from "@/components/header";
import { Select } from "@/components/select";
import { Badge, Card, EmptyState, Loading, Notice, Screen } from "@/components/surface";
import { Text } from "@/components/text";
import { errorText, useTranslations } from "@/lib/i18n";
import { useLayout } from "@/lib/layout";
import { useRested } from "@/lib/rested";
import { can, useMe } from "@/lib/session";
import { space, useTheme } from "@/lib/theme";

import { useScheduleLine } from "../staff/groups-screen";
import { GroupFormSheet } from "./group-form";
import { GROUP_STATUS_TONE } from "./group-office";

/**
 * The centre's groups for the office (A-233): every group the person may see,
 * by name, with the site's filters (status, course, teacher, days) and a
 * search, and "New group". A teacher keeps the short list of their own groups.
 */
export function OfficeGroupsScreen() {
  const t = useTranslations();
  const tf = useTranslations("groups.filters");
  const me = useMe();
  const router = useRouter();
  const { wide } = useLayout();
  const { colors } = useTheme();
  const [typed, setTyped] = useState("");
  const [status, setStatus] = useState<GroupStatus | "ALL">("ACTIVE");
  const [courseId, setCourseId] = useState<string | null>(null);
  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [weekdayPattern, setPattern] = useState<GroupListFilters["weekdayPattern"]>(null);
  const [adding, setAdding] = useState(false);
  const q = useRested(typed);
  const query = useGroupList({ status, courseId, teacherId, weekdayPattern, q });
  const options = useGroupOptions();
  const open = (id: string) => router.push({ pathname: "/staff/group/[id]", params: { id } });

  const header = (
    <Header
      title={t("nav.groups")}
      right={
        can(me, "groups.create") ? (
          <Button
            compact
            icon={<Plus size={16} color={colors.primaryForeground} />}
            label={t("groups.form.add")}
            onPress={() => setAdding(true)}
            testID="groups-add"
          />
        ) : undefined
      }
    />
  );
  const groups = (query.data?.pages ?? []).flatMap((page) => page.items);
  const total = query.data?.pages[0]?.total ?? 0;

  return (
    <Screen
      header={header}
      onRefresh={() => void query.refetch()}
      refreshing={query.isRefetching && !query.isFetchingNextPage}
    >
      <Field
        label={t("mobile.groups.search")}
        value={typed}
        onChangeText={setTyped}
        autoCorrect={false}
        testID="groups-search"
      />
      <View style={styles.filters}>
        <View style={wide ? styles.quarter : styles.half}>
          <Select
            compact
            label={t("common.status")}
            value={status}
            onChange={(value) => setStatus(value ?? "ALL")}
            options={[
              ...GROUP_STATUSES.map((s) => ({ value: s, label: t(`groups.statuses.${s}`) })),
              { value: "ALL" as const, label: tf("all") },
            ]}
            testID="groups-status"
          />
        </View>
        <View style={wide ? styles.quarter : styles.half}>
          <Select
            compact
            label={t("groups.columns.course")}
            value={courseId}
            onChange={setCourseId}
            clearLabel={tf("anyCourse")}
            placeholder={tf("anyCourse")}
            options={(options.data?.courses ?? []).map((c) => ({ value: c.id, label: c.name }))}
            testID="groups-course"
          />
        </View>
        <View style={wide ? styles.quarter : styles.half}>
          <Select
            compact
            label={t("groups.columns.teacher")}
            value={teacherId}
            onChange={setTeacherId}
            clearLabel={tf("anyTeacher")}
            placeholder={tf("anyTeacher")}
            options={(options.data?.teachers ?? []).map((x) => ({
              value: x.id,
              label: x.fullName,
            }))}
            testID="groups-teacher"
          />
        </View>
        <View style={wide ? styles.quarter : styles.half}>
          <Select
            compact
            label={t("groups.columns.days")}
            value={weekdayPattern}
            onChange={setPattern}
            clearLabel={tf("anyDays")}
            placeholder={tf("anyDays")}
            options={WEEKDAY_PATTERNS.map((p) => ({ value: p, label: t(`groups.patterns.${p}`) }))}
            testID="groups-days"
          />
        </View>
      </View>
      {query.isLoading ? (
        <Loading />
      ) : !query.data ? (
        <EmptyState
          title={errorText(t, query.error)}
          action={
            <Button variant="outline" label={t("mobile.retry")} onPress={() => query.refetch()} />
          }
        />
      ) : (
        <>
          {query.isError ? <Notice tone="warning">{errorText(t, query.error)}</Notice> : null}
          <Text variant="small" tone="mutedForeground" testID="groups-count">
            {t("mobile.groups.count", { count: total })}
          </Text>
          {groups.length === 0 ? (
            <EmptyState title={t("common.nothingFound")} />
          ) : (
            <View style={styles.grid} testID="groups-list">
              {groups.map((group) => (
                <View key={group.id} style={wide ? styles.cell : styles.full}>
                  <OfficeGroupCard group={group} onPress={() => open(group.id)} />
                </View>
              ))}
            </View>
          )}
          {query.hasNextPage ? (
            <Button
              variant="outline"
              label={t("mobile.studentsPage.more")}
              loading={query.isFetchingNextPage}
              onPress={() => void query.fetchNextPage()}
              style={styles.start}
              testID="groups-more"
            />
          ) : null}
        </>
      )}
      <GroupFormSheet
        open={adding}
        onClose={() => setAdding(false)}
        onSaved={(group) => open(group.id)}
      />
    </Screen>
  );
}

function OfficeGroupCard({ group, onPress }: { group: Group; onPress: () => void }) {
  const t = useTranslations();
  const { colors } = useTheme();
  const schedule = useScheduleLine();
  const teachers = group.teachers.map((x) => x.fullName).join(", ");
  return (
    <Card onPress={onPress} testID={`group-${group.id}`} style={styles.card}>
      <View style={[styles.edge, { backgroundColor: group.courseColor ?? colors.primary }]} />
      <View style={styles.body}>
        <View style={styles.name}>
          <Text variant="heading" numberOfLines={2} style={styles.fill}>
            {group.name}
          </Text>
          {group.status !== "ACTIVE" ? (
            <Badge
              label={t(`groups.statuses.${group.status}`)}
              tone={GROUP_STATUS_TONE[group.status]}
            />
          ) : null}
        </View>
        <Text variant="small" tone="mutedForeground" numberOfLines={1}>
          {[group.courseName, teachers].filter(Boolean).join(", ")}
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
  filters: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -space[1],
    rowGap: space[2],
  },
  half: { width: "50%", paddingHorizontal: space[1] },
  quarter: { width: "25%", paddingHorizontal: space[1] },
  grid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -space[2], rowGap: space[4] },
  full: { width: "100%", paddingHorizontal: space[2] },
  cell: { width: "50%", paddingHorizontal: space[2] },
  card: { flexDirection: "row", padding: 0, gap: 0, overflow: "hidden", flex: 1 },
  edge: { width: 5 },
  body: { flex: 1, padding: space[4], gap: space[1] },
  name: { flexDirection: "row", alignItems: "flex-start", gap: space[2] },
  fill: { flex: 1 },
  start: { alignSelf: "flex-start" },
});
