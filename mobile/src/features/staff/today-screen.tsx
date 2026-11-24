import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronLeft, ChevronRight, ScanLine } from "lucide-react-native";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";

import { useToday } from "@/api/hooks";
import type { Today, TodayLesson } from "@/api/types";
import { Button } from "@/components/button";
import { Header } from "@/components/header";
import {
  Badge,
  Card,
  EmptyState,
  Loading,
  Notice,
  Screen,
  usePullToReload,
} from "@/components/surface";
import { Text } from "@/components/text";
import { ApiError } from "@/lib/api";
import { addDays, dayAsDate } from "@/lib/days";
import { errorText, useDate, useMoney, useTranslations } from "@/lib/i18n";
import { useLayout } from "@/lib/layout";
import { radius, space, useTheme } from "@/lib/theme";

import { LessonPanel } from "./lesson-panel";
import { OpenOnSite } from "./open-on-site";

/** A day from an address, if it is one: "2026-11-23". */
function dayParam(value: unknown): string | null {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

/**
 * The teacher's day. On a phone: the day's lessons as a list, each opening its
 * own screen. On a tablet: the list stays on the left and the chosen lesson is
 * worked on beside it, so marking a class never leaves the page.
 */
export function TodayScreen() {
  const t = useTranslations();
  const formatDate = useDate();
  const router = useRouter();
  const { wide } = useLayout();
  const { colors } = useTheme();
  // null = the server's own today, so a phone with a wrong clock still opens the right day.
  // A day asked for from elsewhere (A-253): the summary's "not marked" opens the day it counted.
  const asked = dayParam(useLocalSearchParams<{ date?: string }>().date);
  const [date, setDate] = useState<string | null>(asked);
  const [chosen, setChosen] = useState<string | null>(null);
  const [taken, setTaken] = useState<string | null>(asked);
  if (asked !== taken) {
    setTaken(asked);
    if (asked) {
      setDate(asked);
      setChosen(null);
    }
  }
  const query = useToday(date);
  const day = query.data;
  // The lesson list of the two-column layout reloads on a pull, as the phone's page does.
  const reload = usePullToReload({
    onRefresh: () => void query.refetch(),
    refreshing: query.isRefetching,
  });

  const shown = day?.date ?? date;
  const isToday = !day || day.date === day.today;
  const move = (days: number) => {
    if (shown) setDate(addDays(shown, days));
    setChosen(null);
  };

  const selected = day?.lessons.find((l) => l.id === chosen) ?? day?.lessons[0] ?? null;

  const subtitle = shown
    ? `${formatDate(dayAsDate(shown), { weekday: "long" })}, ${formatDate(dayAsDate(shown), { day: "numeric", month: "short" })}`
    : undefined;

  const header = (
    <Header
      title={isToday ? t("today.title") : (subtitle ?? t("today.title"))}
      subtitle={isToday ? subtitle : undefined}
      right={
        <DaySwitch
          onPrev={() => move(-1)}
          onNext={() => move(1)}
          onToday={isToday ? undefined : () => setDate(null)}
        />
      }
    />
  );

  if (query.isLoading) {
    return (
      <Screen header={header} scroll={false}>
        <Loading />
      </Screen>
    );
  }
  if (!day) {
    const forbidden = query.error instanceof ApiError && query.error.status === 403;
    return (
      <Screen header={header}>
        {forbidden ? (
          <EmptyState
            title={t("mobile.noTeachingTitle")}
            text={t("mobile.noTeachingText")}
            action={<OpenOnSite path="/" />}
          />
        ) : (
          <EmptyState
            title={errorText(t, query.error)}
            action={
              <Button variant="outline" label={t("mobile.retry")} onPress={() => query.refetch()} />
            }
          />
        )}
      </Screen>
    );
  }

  const open = (lesson: TodayLesson) => {
    if (wide) setChosen(lesson.id);
    else
      router.push({ pathname: "/staff/lesson/[id]", params: { id: lesson.id, date: lesson.date } });
  };

  const list = (
    <>
      {query.isError ? <Notice tone="warning">{errorText(t, query.error)}</Notice> : null}
      {day.canMark && isToday && day.lessons.length > 0 ? (
        // At the door: a badge marks its student present in their lesson of the day (A-264).
        <Button
          compact
          variant="outline"
          label={t("today.scan.button")}
          icon={<ScanLine size={16} color={colors.foreground} />}
          onPress={() => router.push("/staff/scan")}
          style={styles.scan}
          testID="scan-door"
        />
      ) : null}
      {day.lessons.length === 0 ? (
        <EmptyState title={t("today.lessons.empty")} text={t("mobile.emptyDayHint")} />
      ) : (
        day.lessons.map((lesson) => (
          <LessonCard
            key={lesson.id}
            lesson={lesson}
            selected={wide && selected?.id === lesson.id}
            onPress={() => open(lesson)}
          />
        ))
      )}
      <NextLesson day={day} />
      <Debtors day={day} />
    </>
  );

  if (!wide) {
    return (
      <Screen header={header} onRefresh={() => query.refetch()} refreshing={query.isRefetching}>
        {list}
      </Screen>
    );
  }
  return (
    <Screen header={header} scroll={false} contentStyle={styles.split}>
      <View style={styles.master}>
        <ScrollView
          style={styles.fill}
          contentContainerStyle={styles.column}
          testID="today-lessons"
          {...reload.scrollProps}
        >
          {list}
        </ScrollView>
        {reload.sign}
      </View>
      <ScrollView
        style={styles.detail}
        contentContainerStyle={styles.column}
        keyboardShouldPersistTaps="handled"
      >
        {selected ? (
          <>
            <LessonTitle lesson={selected} />
            <LessonPanel
              lesson={selected}
              canMark={day.canMark}
              canSeeBalances={day.canSeeBalances}
            />
          </>
        ) : (
          <EmptyState title={t("today.lessons.empty")} />
        )}
      </ScrollView>
    </Screen>
  );
}

function DaySwitch({
  onPrev,
  onNext,
  onToday,
}: {
  onPrev: () => void;
  onNext: () => void;
  onToday?: () => void;
}) {
  const t = useTranslations();
  const { colors } = useTheme();
  const arrow = [styles.arrow, { borderColor: colors.input, backgroundColor: colors.card }];
  return (
    <View style={styles.switch}>
      {onToday ? (
        <Button
          compact
          variant="ghost"
          label={t("today.title")}
          onPress={onToday}
          testID="back-to-today"
        />
      ) : null}
      <Pressable
        onPress={onPrev}
        accessibilityRole="button"
        accessibilityLabel={t("today.prevDay")}
        testID="prev-day"
        style={arrow}
      >
        <ChevronLeft size={20} color={colors.foreground} />
      </Pressable>
      <Pressable
        onPress={onNext}
        accessibilityRole="button"
        accessibilityLabel={t("today.nextDay")}
        testID="next-day"
        style={arrow}
      >
        <ChevronRight size={20} color={colors.foreground} />
      </Pressable>
    </View>
  );
}

/** The name of the lesson above its panel, on the tablet's right-hand side. */
export function LessonTitle({ lesson }: { lesson: TodayLesson }) {
  const t = useTranslations();
  return (
    <View>
      <Text variant="title">{lesson.groupName}</Text>
      <Text tone="mutedForeground">
        {[
          `${lesson.startTime}–${lesson.endTime}`,
          lesson.roomName ?? t("today.lesson.noRoom"),
          lesson.courseName,
        ].join(", ")}
      </Text>
    </View>
  );
}

function LessonCard({
  lesson,
  selected,
  onPress,
}: {
  lesson: TodayLesson;
  selected: boolean;
  onPress: () => void;
}) {
  const t = useTranslations();
  const { colors } = useTheme();
  const total = lesson.members.length;
  const done = total > 0 && lesson.marked === total;
  return (
    <Card
      onPress={onPress}
      testID={`lesson-card-${lesson.id}`}
      accessibilityLabel={`${lesson.groupName}, ${lesson.startTime}`}
      style={[
        styles.lesson,
        selected ? { borderColor: colors.ring, backgroundColor: colors.accent } : null,
      ]}
    >
      {/* The course's own colour, as in the site's timetable. */}
      <View style={[styles.edge, { backgroundColor: lesson.color ?? colors.primary }]} />
      <View style={styles.lessonBody}>
        <View style={styles.lessonTop}>
          <Text variant="figure" tone={selected ? "accentForeground" : "foreground"}>
            {lesson.startTime}–{lesson.endTime}
          </Text>
          {/* In the tablet's narrow list the "Extra" badge goes to a line of its own
              before the room is cut to a letter. */}
          <Text variant="small" tone="mutedForeground" numberOfLines={1} style={styles.room}>
            {lesson.roomName ?? t("today.lesson.noRoom")}
          </Text>
          {lesson.isExtra ? <Badge label={t("today.lesson.extra")} /> : null}
        </View>
        <Text variant="heading" numberOfLines={2}>
          {lesson.groupName}
        </Text>
        {lesson.topic ? (
          <Text variant="small" tone="mutedForeground" numberOfLines={1}>
            {lesson.topic}
          </Text>
        ) : null}
        <View style={styles.lessonFoot}>
          <Badge
            tone={done ? "success" : "neutral"}
            label={t("today.attendance.summary", {
              marked: lesson.marked,
              total,
              present: lesson.present,
            })}
          />
          {lesson.homework && lesson.homework.toCheck > 0 ? (
            <Badge
              tone="warning"
              label={t("today.homework.toCheck", { count: lesson.homework.toCheck })}
            />
          ) : null}
        </View>
      </View>
    </Card>
  );
}

function NextLesson({ day }: { day: Today }) {
  const t = useTranslations();
  const formatDate = useDate();
  if (!day.next || day.date !== day.today) return null;
  return (
    <Card>
      <Text variant="small" tone="mutedForeground">
        {t("today.next.title")}
      </Text>
      <Text variant="bodyStrong">{day.next.groupName}</Text>
      <Text tone="mutedForeground">
        {t("today.next.at", {
          date:
            day.next.date === day.today
              ? t("today.todayWord")
              : formatDate(dayAsDate(day.next.date), { day: "numeric", month: "short" }),
          time: day.next.startTime,
        })}
      </Text>
    </Card>
  );
}

function Debtors({ day }: { day: Today }) {
  const t = useTranslations();
  const money = useMoney();
  if (!day.canSeeBalances || day.debtorCount === 0) return null;
  return (
    <Card testID="debtors">
      <Text variant="heading">{t("today.debtors.title")}</Text>
      <Text variant="small" tone="mutedForeground">
        {t("today.debtors.summary", { count: day.debtorCount, amount: money(day.debtTotal) })}
      </Text>
      {day.debtors.slice(0, 5).map((debtor) => (
        <View key={`${debtor.studentId}-${debtor.groupId}`} style={styles.debtor}>
          <View style={styles.fill}>
            <Text variant="bodyStrong" numberOfLines={1}>
              {debtor.fullName}
            </Text>
            <Text variant="small" tone="mutedForeground" numberOfLines={1}>
              {debtor.groupName}
            </Text>
          </View>
          <Text variant="figure" tone="destructive">
            {money(debtor.amount)}
          </Text>
        </View>
      ))}
      {day.debtorCount > 5 ? (
        <Text variant="small" tone="mutedForeground">
          {t("today.debtors.more", { count: day.debtorCount - 5 })}
        </Text>
      ) : null}
    </Card>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  scan: { alignSelf: "flex-start" },
  split: { flexDirection: "row", gap: space[6], maxWidth: 1280, paddingBottom: 0 },
  // The lesson gets three parts of the width and the list two, and the list stops at 400: on
  // an upright iPad even columns left the attendance row too little room and names wrapped.
  // Written out, because a ScrollView brings a `flexGrow` of 1 that wins over `flex: n`.
  master: { flexGrow: 2, flexShrink: 1, flexBasis: 0, maxWidth: 400 },
  detail: { flexGrow: 3, flexShrink: 1, flexBasis: 0 },
  column: { gap: space[4], paddingBottom: space[8] },
  switch: { flexDirection: "row", alignItems: "center", gap: space[2] },
  arrow: {
    width: 40,
    height: 40,
    borderWidth: 1,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
  lesson: { flexDirection: "row", padding: 0, gap: 0, overflow: "hidden" },
  edge: { width: 5 },
  lessonBody: { flex: 1, padding: space[4], gap: space[2] },
  lessonTop: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "baseline",
    columnGap: space[3],
    rowGap: space[1],
  },
  room: { flexGrow: 1, flexShrink: 1, flexBasis: 72 },
  lessonFoot: { flexDirection: "row", flexWrap: "wrap", gap: space[2], marginTop: space[1] },
  debtor: { flexDirection: "row", alignItems: "center", gap: space[3] },
});
