import { useLocalSearchParams } from "expo-router";
import { ExternalLink } from "lucide-react-native";
import { StyleSheet, View } from "react-native";

import { usePortal } from "@/api/hooks";
import type { AttendanceStatus, Portal } from "@/api/types";
import { Button } from "@/components/button";
import { Header } from "@/components/header";
import { Badge, Card, Divider, EmptyState, Loading, Screen, type Tone } from "@/components/surface";
import { Text } from "@/components/text";
import { dayAsDate } from "@/lib/days";
import { errorText, useDate, useLocaleChoice, useMoney, useTranslations } from "@/lib/i18n";
import { useLayout } from "@/lib/layout";
import { space, useTheme } from "@/lib/theme";

import { openPersonalPage } from "./open-page";

const ATTENDANCE_TONE: Record<AttendanceStatus, Tone> = {
  PRESENT: "success",
  ABSENT: "destructive",
  EXCUSED: "warning",
  NOT_MARKED: "neutral",
};

/**
 * One group as the student sees it: the next lesson, how they are doing, each
 * past lesson with its mark and grade, and the payments. Answering homework,
 * tests, chat and the online lesson open on the personal page for now.
 */
export function ClassScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const t = useTranslations();
  const { locale } = useLocaleChoice();
  const { wide } = useLayout();
  const { colors } = useTheme();
  const query = usePortal(token);
  const portal = query.data?.portal;

  const header = (
    <Header
      back
      title={portal?.group.name ?? t("studentApp.title")}
      subtitle={portal ? [portal.group.courseName, ...portal.group.teachers].join(", ") : undefined}
    />
  );
  if (query.isLoading) {
    return (
      <Screen header={header} scroll={false}>
        <Loading />
      </Screen>
    );
  }
  if (!portal) {
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

  const summary = (
    <View style={styles.block}>
      <NextLesson portal={portal} />
      <Stats portal={portal} />
      <Button
        variant="outline"
        label={t("mobile.myPage")}
        icon={<ExternalLink size={18} color={colors.foreground} />}
        onPress={() => void openPersonalPage(locale, token)}
        testID="open-my-page"
      />
      <Text variant="small" tone="mutedForeground">
        {t("mobile.myPageHint")}
      </Text>
      <Money portal={portal} />
    </View>
  );
  const lessons = (
    <View style={styles.block}>
      <Text variant="heading">{t("portal.tabs.lessons")}</Text>
      <Lessons portal={portal} />
    </View>
  );

  return (
    <Screen
      header={header}
      onRefresh={() => query.refetch()}
      refreshing={query.isRefetching}
      contentStyle={wide ? styles.split : undefined}
    >
      {wide ? (
        <>
          <View style={styles.fill}>{summary}</View>
          <View style={styles.fill}>{lessons}</View>
        </>
      ) : (
        <>
          {summary}
          {lessons}
        </>
      )}
    </Screen>
  );
}

function NextLesson({ portal }: { portal: Portal }) {
  const t = useTranslations();
  const formatDate = useDate();
  const next = portal.nextLesson;
  if (!next) return null;
  const date = dayAsDate(next.date);
  return (
    <Card>
      <Text variant="small" tone="mutedForeground">
        {t("today.next.title")}
      </Text>
      <Text variant="title">
        {formatDate(date, { weekday: "long" })},{" "}
        {formatDate(date, { day: "numeric", month: "short" })}
      </Text>
      <Text variant="figure">
        {next.startTime}–{next.endTime}
      </Text>
      {next.topic ? <Text tone="mutedForeground">{next.topic}</Text> : null}
    </Card>
  );
}

function Stats({ portal }: { portal: Portal }) {
  const t = useTranslations();
  const { stats } = portal;
  const cells = [
    {
      label: t("portal.stats.attendance"),
      value: stats.attendancePercent === null ? "–" : `${stats.attendancePercent}%`,
    },
    {
      label: t("portal.stats.grade"),
      value: stats.gradeAverage === null ? "–" : String(stats.gradeAverage),
    },
    { label: t("portal.stats.coins"), value: String(portal.student.coins) },
  ];
  return (
    <Card style={styles.stats}>
      {cells.map((cell) => (
        <View key={cell.label} style={styles.stat}>
          <Text variant="title">{cell.value}</Text>
          <Text variant="small" tone="mutedForeground">
            {cell.label}
          </Text>
        </View>
      ))}
    </Card>
  );
}

function Money({ portal }: { portal: Portal }) {
  const t = useTranslations();
  const money = useMoney();
  const formatDate = useDate();
  const { balance, payments, nextPaymentDate } = portal.money;
  return (
    <Card testID="money">
      <Text variant="heading">{t("portal.tabs.money")}</Text>
      {balance < 0 ? (
        <Text tone="destructive">{t("portal.money.debt", { amount: money(-balance) })}</Text>
      ) : (
        <View style={styles.line}>
          <Text tone="mutedForeground" style={styles.fill}>
            {t("portal.money.balance")}
          </Text>
          <Text variant="figure">{money(balance)}</Text>
        </View>
      )}
      {portal.packages ? (
        <View style={styles.line}>
          <Text tone="mutedForeground" style={styles.fill}>
            {t("portal.money.lessonsLeft")}
          </Text>
          <Text variant="figure">{portal.packages.lessonsLeft}</Text>
        </View>
      ) : nextPaymentDate ? (
        <View style={styles.line}>
          <Text tone="mutedForeground" style={styles.fill}>
            {t("portal.money.nextPayment")}
          </Text>
          <Text variant="figure">
            {formatDate(dayAsDate(nextPaymentDate), { day: "numeric", month: "short" })}
          </Text>
        </View>
      ) : null}
      {payments.length === 0 ? (
        <Text variant="small" tone="mutedForeground">
          {t("portal.money.empty")}
        </Text>
      ) : (
        payments.slice(0, 6).map((payment) => (
          <View key={payment.id}>
            <Divider />
            <View style={[styles.line, styles.payment]}>
              <Text style={styles.fill}>
                {formatDate(dayAsDate(payment.paidAt), { dateStyle: "medium" })}
                {payment.method ? `, ${payment.method}` : ""}
              </Text>
              <Text variant="figure">{money(payment.amount)}</Text>
            </View>
          </View>
        ))
      )}
    </Card>
  );
}

function Lessons({ portal }: { portal: Portal }) {
  const t = useTranslations();
  const formatDate = useDate();
  if (portal.lessons.length === 0) {
    return (
      <Card>
        <Text tone="mutedForeground">{t("portal.lessons.empty")}</Text>
      </Card>
    );
  }
  return (
    <Card style={styles.flush}>
      {portal.lessons.map((lesson, index) => {
        const date = dayAsDate(lesson.date);
        return (
          <View key={lesson.id}>
            {index > 0 ? <Divider /> : null}
            <View style={styles.lesson}>
              <View style={styles.day}>
                <Text variant="figure">{formatDate(date, { day: "numeric", month: "short" })}</Text>
                <Text variant="small" tone="mutedForeground">
                  {formatDate(date, { weekday: "short" })}, {lesson.startTime}
                </Text>
              </View>
              <View style={styles.fill}>
                <Text numberOfLines={2} tone={lesson.topic ? "foreground" : "mutedForeground"}>
                  {lesson.topic ?? t("mobile.noTopic")}
                </Text>
                {lesson.studentNote ? (
                  <Text variant="small" tone="mutedForeground" numberOfLines={3}>
                    {lesson.studentNote}
                  </Text>
                ) : null}
              </View>
              <View style={styles.marks}>
                {lesson.attendance && lesson.attendance !== "NOT_MARKED" ? (
                  <Badge
                    tone={ATTENDANCE_TONE[lesson.attendance]}
                    label={t(`groups.attendance.${lesson.attendance}`)}
                  />
                ) : null}
                {lesson.grade !== null ? <Text variant="figure">{lesson.grade}</Text> : null}
              </View>
            </View>
          </View>
        );
      })}
    </Card>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  block: { gap: space[4] },
  split: { flexDirection: "row", alignItems: "flex-start", gap: space[6] },
  flush: { padding: 0, gap: 0 },
  stats: { flexDirection: "row" },
  stat: { flex: 1, gap: 2 },
  line: { flexDirection: "row", alignItems: "center", gap: space[3] },
  payment: { paddingTop: space[3] },
  lesson: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space[3],
    paddingHorizontal: space[4],
    paddingVertical: space[3],
  },
  day: { width: 92 },
  marks: { alignItems: "flex-end", gap: space[1] },
});
