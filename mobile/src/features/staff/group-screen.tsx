import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { useGroup, useMonthGrid } from "@/api/hooks";
import type { GridLesson } from "@/api/types";
import { Button } from "@/components/button";
import { Header } from "@/components/header";
import { Avatar, Badge, Card, Divider, EmptyState, Loading, Screen } from "@/components/surface";
import { Text } from "@/components/text";
import { addMonths, dayAsDate } from "@/lib/days";
import { errorText, useDate, useTranslations } from "@/lib/i18n";
import { useLayout } from "@/lib/layout";
import { radius, space, useTheme } from "@/lib/theme";

import { useScheduleLine } from "./groups-screen";
import { OpenOnSite } from "./open-on-site";

/** Tashkent's month now, as "2026-11". */
function thisMonth(): string {
  return new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 7);
}

/**
 * One group: the month's lessons (each opens to be marked) and the students
 * with their average grade. The rest of the group's page (payments, notes,
 * materials) is a tap away on the site.
 */
export function GroupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTranslations();
  const { wide } = useLayout();
  const schedule = useScheduleLine();
  const [month, setMonth] = useState(thisMonth);
  const group = useGroup(id);
  const grid = useMonthGrid(id, month);

  const header = (
    <Header
      back
      title={group.data?.name ?? t("nav.groups")}
      subtitle={group.data ? `${group.data.courseName}, ${schedule(group.data)}` : undefined}
    />
  );
  const refresh = () => {
    void group.refetch();
    void grid.refetch();
  };

  const lessons = (
    <View style={styles.block}>
      <MonthSwitch month={month} onChange={setMonth} />
      {grid.isLoading ? (
        <Loading />
      ) : !grid.data ? (
        <EmptyState
          title={errorText(t, grid.error)}
          action={<Button variant="outline" label={t("mobile.retry")} onPress={refresh} />}
        />
      ) : grid.data.lessons.length === 0 ? (
        <Card>
          <Text tone="mutedForeground">{t("groups.attendance.noLessons")}</Text>
        </Card>
      ) : (
        <Card style={styles.flush}>
          {grid.data.lessons.map((lesson, index) => (
            <View key={lesson.id}>
              {index > 0 ? <Divider /> : null}
              <LessonRow lesson={lesson} />
            </View>
          ))}
        </Card>
      )}
    </View>
  );

  const students = grid.data ? (
    <View style={styles.block}>
      <Text variant="heading">{t("mobile.students", { count: grid.data.members.length })}</Text>
      <Card style={styles.flush}>
        {grid.data.members.map((member, index) => (
          <View key={member.membershipId}>
            {index > 0 ? <Divider /> : null}
            <View style={styles.row}>
              <Avatar name={member.fullName} />
              <View style={styles.fill}>
                <Text variant="bodyStrong" numberOfLines={1}>
                  {member.fullName}
                </Text>
                {member.status !== "ACTIVE" ? (
                  <Text variant="small" tone="mutedForeground">
                    {t(`groups.memberStatuses.${member.status}`)}
                  </Text>
                ) : null}
              </View>
              {member.average !== null ? (
                <View style={styles.average}>
                  <Text variant="figure">{member.average}</Text>
                  <Text variant="small" tone="mutedForeground">
                    {t("groups.grades.average")}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>
        ))}
      </Card>
      <OpenOnSite path={`/groups/${id}`} label={t("mobile.groupOnSite")} />
    </View>
  ) : null;

  return (
    <Screen
      header={header}
      onRefresh={refresh}
      refreshing={group.isRefetching || grid.isRefetching}
      contentStyle={wide ? styles.split : undefined}
    >
      {wide ? (
        <>
          <View style={styles.fill}>{lessons}</View>
          <View style={styles.fill}>{students}</View>
        </>
      ) : (
        <>
          {lessons}
          {students}
        </>
      )}
    </Screen>
  );
}

function MonthSwitch({ month, onChange }: { month: string; onChange: (month: string) => void }) {
  const t = useTranslations();
  const formatDate = useDate();
  const { colors } = useTheme();
  const arrow = [styles.arrow, { borderColor: colors.input, backgroundColor: colors.card }];
  return (
    <View style={styles.month}>
      <Text variant="heading" style={styles.fill} testID="month-name">
        {formatDate(dayAsDate(`${month}-15`), { month: "short", year: "numeric" })}
      </Text>
      <Pressable
        onPress={() => onChange(addMonths(month, -1))}
        accessibilityRole="button"
        accessibilityLabel={t("mobile.prevMonth")}
        testID="prev-month"
        style={arrow}
      >
        <ChevronLeft size={20} color={colors.foreground} />
      </Pressable>
      <Pressable
        onPress={() => onChange(addMonths(month, 1))}
        accessibilityRole="button"
        accessibilityLabel={t("mobile.nextMonth")}
        testID="next-month"
        style={arrow}
      >
        <ChevronRight size={20} color={colors.foreground} />
      </Pressable>
    </View>
  );
}

function LessonRow({ lesson }: { lesson: GridLesson }) {
  const t = useTranslations();
  const formatDate = useDate();
  const router = useRouter();
  const { colors } = useTheme();
  const marks = Object.values(lesson.attendance).filter((a) => a.status !== "NOT_MARKED");
  const present = marks.filter((a) => a.status === "PRESENT").length;
  const date = dayAsDate(lesson.date);
  return (
    <Pressable
      testID={`month-lesson-${lesson.id}`}
      accessibilityRole="button"
      onPress={() =>
        router.push({
          pathname: "/staff/lesson/[id]",
          params: { id: lesson.id, date: lesson.date },
        })
      }
      style={({ pressed }) => [styles.row, pressed && { backgroundColor: colors.muted }]}
    >
      <View style={styles.day}>
        <Text variant="figure">{formatDate(date, { day: "numeric", month: "short" })}</Text>
        <Text variant="small" tone="mutedForeground">
          {formatDate(date, { weekday: "short" })}, {lesson.startTime}
        </Text>
      </View>
      <View style={styles.fill}>
        <Text
          numberOfLines={2}
          tone={lesson.topic || lesson.courseTopicTitle ? "foreground" : "mutedForeground"}
        >
          {lesson.topic ?? lesson.courseTopicTitle ?? t("mobile.noTopic")}
        </Text>
      </View>
      {marks.length > 0 ? <Badge tone="success" label={`${present}/${marks.length}`} /> : null}
      <ChevronRight size={18} color={colors.mutedForeground} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  split: { flexDirection: "row", alignItems: "flex-start", gap: space[6] },
  block: { gap: space[3] },
  flush: { padding: 0, gap: 0, overflow: "hidden" },
  month: { flexDirection: "row", alignItems: "center", gap: space[2] },
  arrow: {
    width: 40,
    height: 40,
    borderWidth: 1,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    minHeight: 60,
  },
  day: { width: 92 },
  average: { alignItems: "flex-end" },
});
