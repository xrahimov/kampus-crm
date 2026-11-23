import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import {
  useTimetable,
  WEEKDAYS,
  type TimetableBlock,
  type TimetableMode,
} from "@/api/office-groups";
import { Button } from "@/components/button";
import { Chip } from "@/components/chip";
import { Header } from "@/components/header";
import { Select } from "@/components/select";
import { Card, EmptyState, Loading, Notice, Screen, Segmented } from "@/components/surface";
import { Text } from "@/components/text";
import { centreToday, weekdayAsDate, weekdayOf } from "@/lib/days";
import { errorText, useDate, useTranslations } from "@/lib/i18n";
import { useLayout } from "@/lib/layout";
import { space, useTheme } from "@/lib/theme";

/**
 * "Timetable" (A-233): one room's or one teacher's week, from the groups'
 * schedules. A phone shows a day at a time, a tablet the seven days side by
 * side; a lesson opens its group.
 */
export function TimetableScreen() {
  const t = useTranslations("timetable");
  const tAll = useTranslations();
  const date = useDate();
  const { wide } = useLayout();
  const [mode, setMode] = useState<TimetableMode | null>(null);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [weekday, setWeekday] = useState(() => weekdayOf(centreToday()));
  const query = useTimetable(mode, branchId, picked);
  const header = <Header back title={t("title")} />;

  if (query.isLoading) {
    return (
      <Screen header={header} scroll={false}>
        <Loading />
      </Screen>
    );
  }
  const data = query.data;
  if (!data) {
    return (
      <Screen header={header}>
        <EmptyState
          title={errorText(tAll, query.error)}
          action={
            <Button
              variant="outline"
              label={tAll("mobile.retry")}
              onPress={() => query.refetch()}
            />
          }
        />
      </Screen>
    );
  }
  const choices =
    data.mode === "room"
      ? data.rooms.map((r) => ({ value: r.id, label: r.name }))
      : data.teachers.map((x) => ({ value: x.id, label: x.fullName }));
  const byDay = (day: number) =>
    data.blocks
      .filter((b) => b.weekday === day)
      .sort((a, b) => a.startTime.localeCompare(b.startTime));
  const dayName = (day: number, style: "short" | "long") =>
    date(weekdayAsDate(day), { weekday: style });

  return (
    <Screen header={header} onRefresh={() => void query.refetch()} refreshing={query.isRefetching}>
      {query.isError ? <Notice tone="warning">{errorText(tAll, query.error)}</Notice> : null}
      <View style={[styles.tools, wide ? styles.toolsWide : null]}>
        <View style={wide ? styles.modes : null}>
          <Segmented
            value={data.mode}
            onChange={(next) => {
              setMode(next);
              setPicked(null);
            }}
            options={[
              { value: "room", label: t("byRoom") },
              { value: "teacher", label: t("byTeacher") },
            ]}
            testID="timetable-mode"
          />
        </View>
        {data.branches.length > 1 ? (
          <View style={wide ? styles.pick : null}>
            <Select
              compact
              label={t("branch")}
              value={data.branchId}
              onChange={(id) => {
                if (!id) return;
                setBranchId(id);
                setPicked(null);
              }}
              options={data.branches.map((b) => ({ value: b.id, label: b.name }))}
              testID="timetable-branch"
            />
          </View>
        ) : null}
        {choices.length > 0 ? (
          <View style={wide ? styles.pick : null}>
            <Select
              compact
              label={data.mode === "room" ? t("room") : t("teacher")}
              value={data.selectedId}
              onChange={(id) => {
                if (id) setPicked(id);
              }}
              options={choices}
              testID="timetable-pick"
            />
          </View>
        ) : null}
      </View>
      {choices.length === 0 ? (
        <EmptyState title={data.mode === "room" ? t("noRooms") : t("noTeachers")} />
      ) : data.blocks.length === 0 ? (
        <Card>
          <Text tone="mutedForeground" testID="timetable-nothing">
            {t("empty")}
          </Text>
        </Card>
      ) : wide ? (
        <View style={styles.week} testID="timetable-week">
          {WEEKDAYS.map((day) => (
            <View key={day} style={styles.column} testID={`timetable-day-${day}`}>
              <Text variant="smallStrong" style={styles.center}>
                {dayName(day, "short")}
              </Text>
              {byDay(day).map((b) => (
                <Block key={`${b.groupId}-${b.startTime}`} block={b} mode={data.mode} small />
              ))}
            </View>
          ))}
        </View>
      ) : (
        <>
          <View style={styles.days}>
            {WEEKDAYS.map((day) => (
              <Chip
                key={day}
                fill
                label={dayName(day, "short")}
                on={day === weekday}
                onPress={() => setWeekday(day)}
                testID={`timetable-weekday-${day}`}
              />
            ))}
          </View>
          {byDay(weekday).length === 0 ? (
            <Card>
              <Text tone="mutedForeground" testID="timetable-empty">
                {tAll("mobile.groups.nothingThatDay", { day: dayName(weekday, "long") })}
              </Text>
            </Card>
          ) : (
            <View style={styles.list} testID="timetable-list">
              {byDay(weekday).map((b) => (
                <Block key={`${b.groupId}-${b.startTime}`} block={b} mode={data.mode} />
              ))}
            </View>
          )}
        </>
      )}
    </Screen>
  );
}

function Block({
  block,
  mode,
  small = false,
}: {
  block: TimetableBlock;
  mode: TimetableMode;
  small?: boolean;
}) {
  const t = useTranslations("timetable");
  const router = useRouter();
  const { colors } = useTheme();
  const detail = mode === "room" ? block.teacherNames.join(", ") : (block.roomName ?? t("noRoom"));
  return (
    <Pressable
      onPress={() => router.push({ pathname: "/staff/group/[id]", params: { id: block.groupId } })}
      accessibilityRole="button"
      accessibilityLabel={`${block.groupName}, ${block.startTime}–${block.endTime}`}
      style={({ pressed }) => [
        styles.block,
        {
          backgroundColor: pressed ? colors.muted : colors.card,
          borderColor: colors.border,
          borderLeftColor: block.color ?? colors.primary,
        },
      ]}
      testID={`timetable-block-${block.groupId}-${block.weekday}`}
    >
      <Text variant={small ? "smallStrong" : "bodyStrong"} numberOfLines={small ? 2 : 1}>
        {block.groupName}
      </Text>
      <Text variant={small ? "small" : "figure"}>
        {block.startTime}–{block.endTime}
      </Text>
      {detail ? (
        <Text variant="small" tone="mutedForeground" numberOfLines={small ? 2 : 1}>
          {small ? detail : [block.courseName, detail].filter(Boolean).join(", ")}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tools: { gap: space[3] },
  toolsWide: { flexDirection: "row", alignItems: "center" },
  modes: { width: 280 },
  pick: { width: 220 },
  days: { flexDirection: "row", gap: 4 },
  list: { gap: space[2] },
  week: { flexDirection: "row", gap: space[2], alignItems: "flex-start" },
  column: { flex: 1, gap: space[2] },
  center: { textAlign: "center" },
  block: {
    borderWidth: 1,
    borderLeftWidth: 4,
    borderRadius: 10,
    paddingHorizontal: space[3],
    paddingVertical: space[2],
    gap: 2,
  },
});
