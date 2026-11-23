import { useLocalSearchParams } from "expo-router";

import { useToday } from "@/api/hooks";
import { Button } from "@/components/button";
import { Header } from "@/components/header";
import { EmptyState, Loading, Screen } from "@/components/surface";
import { dayAsDate } from "@/lib/days";
import { errorText, useDate, useTranslations } from "@/lib/i18n";

import { LessonPanel } from "./lesson-panel";

/** One lesson on its own screen: where a phone marks a class. */
export function LessonScreen() {
  const { id, date } = useLocalSearchParams<{ id: string; date?: string }>();
  const t = useTranslations();
  const formatDate = useDate();
  const query = useToday(date ?? null);
  const lesson = query.data?.lessons.find((l) => l.id === id);

  const header = (
    <Header
      back
      title={lesson?.groupName ?? t("today.title")}
      subtitle={
        lesson
          ? `${formatDate(dayAsDate(lesson.date), { day: "numeric", month: "short" })}, ${lesson.startTime}–${lesson.endTime}, ${lesson.roomName ?? t("today.lesson.noRoom")}`
          : undefined
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
  if (!lesson || !query.data) {
    return (
      <Screen header={header}>
        <EmptyState
          title={query.isError ? errorText(t, query.error) : t("mobile.lessonGone")}
          action={
            <Button variant="outline" label={t("mobile.retry")} onPress={() => query.refetch()} />
          }
        />
      </Screen>
    );
  }
  return (
    <Screen header={header} onRefresh={() => query.refetch()} refreshing={query.isRefetching}>
      <LessonPanel
        lesson={lesson}
        canMark={query.data.canMark}
        canSeeBalances={query.data.canSeeBalances}
      />
    </Screen>
  );
}
