import { useRouter } from "expo-router";
import { ChevronLeft, ChevronRight } from "lucide-react-native";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";

import { useToday } from "@/api/hooks";
import type { Today, TodayLesson } from "@/api/types";
import { Button } from "@/components/button";
import { Header } from "@/components/header";
import { Badge, Card, EmptyState, Loading, Notice, Screen } from "@/components/surface";
import { Text } from "@/components/text";
import { ApiError } from "@/lib/api";
import { addDays, dayAsDate } from "@/lib/days";
import { errorText, useDate, useMoney, useTranslations } from "@/lib/i18n";
import { useLayout } from "@/lib/layout";
import { radius, space, useTheme } from "@/lib/theme";

import { LessonPanel } from "./lesson-panel";
import { OpenOnSite } from "./open-on-site";

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
  // null = the server's own today, so a phone with a wrong clock still opens the right day.
  const [date, setDate] = useState<string | null>(null);
  const query = useToday(date);
  const day = query.data;
  const [chosen, setChosen] = useState<string | null>(null);

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
      <ScrollView style={styles.master} contentContainerStyle={styles.column}>
        {list}
      </ScrollView>
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
          <Text variant="small" tone="mutedForeground" numberOfLines={1} style={styles.fill}>
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
  split: { flexDirection: "row", gap: space[6], maxWidth: 1280, paddingBottom: 0 },
  master: { flex: 4, maxWidth: 400 },
  detail: { flex: 7 },
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
  lessonTop: { flexDirection: "row", alignItems: "baseline", gap: space[3] },
  lessonFoot: { flexDirection: "row", flexWrap: "wrap", gap: space[2], marginTop: space[1] },
  debtor: { flexDirection: "row", alignItems: "center", gap: space[3] },
});
