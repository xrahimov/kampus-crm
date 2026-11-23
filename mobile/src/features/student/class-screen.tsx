import { useLocalSearchParams, useRouter } from "expo-router";
import {
  Award,
  BookOpen,
  CalendarDays,
  ChevronRight,
  ClipboardCheck,
  CreditCard,
  FolderOpen,
  Gift,
  Megaphone,
  MessageCircle,
  MessagesSquare,
  NotebookPen,
  Send,
  type LucideIcon,
} from "lucide-react-native";
import { Pressable, StyleSheet, View } from "react-native";

import { usePortal } from "@/api/hooks";
import { usePortalChat, usePortalCourse, usePortalNews } from "@/api/portal";
import { usePortalTelegram } from "@/api/portal-own";
import type { AttendanceStatus, PayOptions, Portal } from "@/api/types";
import { Button } from "@/components/button";
import { Header } from "@/components/header";
import { Badge, Card, Divider, EmptyState, Loading, Screen, type Tone } from "@/components/surface";
import { Text } from "@/components/text";
import { dayAsDate } from "@/lib/days";
import { errorText, useDate, useMoney, useTranslations } from "@/lib/i18n";
import { useLayout } from "@/lib/layout";
import { space, useTheme } from "@/lib/theme";

import { LessonRating } from "./lesson-rating";

const ATTENDANCE_TONE: Record<AttendanceStatus, Tone> = {
  PRESENT: "success",
  ABSENT: "destructive",
  EXCUSED: "warning",
  NOT_MARKED: "neutral",
};

/**
 * One group as the student sees it: the next lesson, how they are doing, each
 * past lesson with its mark, grade and the student's own rating, and the
 * payments. Everything else the personal page has is a page of the app
 * (A-212, A-213, A-215, A-216), so nothing here opens the site.
 */
export function ClassScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const t = useTranslations();
  const { wide } = useLayout();
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
      <LearningPages token={token} />
      <GroupPages token={token} />
      <Money portal={portal} pay={query.data?.pay} token={token} />
      <OwnPages token={token} />
    </View>
  );
  const lessons = (
    <View style={styles.block}>
      <Text variant="heading">{t("portal.tabs.lessons")}</Text>
      <Lessons portal={portal} token={token} />
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

interface PageRow {
  id: string;
  label: string;
  Icon: LucideIcon;
  /** How many are unread, or waiting. */
  count?: number;
  /** A quiet word on the right, such as "Not connected". */
  note?: string;
  pathname:
    | "/student/homework/[token]"
    | "/student/tests/[token]"
    | "/student/course/[token]"
    | "/student/materials/[token]"
    | "/student/results/[token]"
    | "/student/chat/[token]"
    | "/student/stream/[token]"
    | "/student/news/[token]"
    | "/student/schedule/[token]"
    | "/student/telegram/[token]"
    | "/student/invite/[token]";
}

/** Rows that each open a page of the group. */
function PageRows({ token, rows, testID }: { token: string; rows: PageRow[]; testID: string }) {
  const { colors } = useTheme();
  const router = useRouter();
  return (
    <Card style={styles.flush} testID={testID}>
      {rows.map(({ id, label, Icon, count = 0, note, pathname }, index) => (
        <View key={id}>
          {index > 0 ? <Divider /> : null}
          <Pressable
            onPress={() => router.push({ pathname, params: { token } })}
            accessibilityRole="button"
            accessibilityLabel={label}
            style={({ pressed }) => [styles.page, pressed && { backgroundColor: colors.muted }]}
            testID={`open-${id}`}
          >
            <Icon size={20} color={colors.primary} />
            <Text variant="bodyStrong" style={styles.fill}>
              {label}
            </Text>
            {count > 0 ? (
              <Badge tone="accent" label={String(count)} testID={`unread-${id}`} />
            ) : null}
            {note ? (
              <Text variant="small" tone="mutedForeground" testID={`note-${id}`}>
                {note}
              </Text>
            ) : null}
            <ChevronRight size={20} color={colors.mutedForeground} />
          </Pressable>
        </View>
      ))}
    </Card>
  );
}

/**
 * What the student learns from: homework, tests, the course once it has
 * topics, materials and results.
 */
function LearningPages({ token }: { token: string }) {
  const t = useTranslations();
  const hasCourse = (usePortalCourse(token).data?.total ?? 0) > 0;
  const rows: PageRow[] = [
    {
      id: "homework",
      label: t("portal.tabs.homework"),
      Icon: NotebookPen,
      pathname: "/student/homework/[token]",
    },
    {
      id: "tests",
      label: t("portal.tabs.tests"),
      Icon: ClipboardCheck,
      pathname: "/student/tests/[token]",
    },
    ...(hasCourse
      ? [
          {
            id: "course",
            label: t("portal.tabs.course"),
            Icon: BookOpen,
            pathname: "/student/course/[token]" as const,
          },
        ]
      : []),
    {
      id: "materials",
      label: t("portal.tabs.materials"),
      Icon: FolderOpen,
      pathname: "/student/materials/[token]",
    },
    {
      id: "results",
      label: t("portal.tabs.results"),
      Icon: Award,
      pathname: "/student/results/[token]",
    },
  ];
  return <PageRows token={token} rows={rows} testID="pages" />;
}

/** The group itself: its chat, stream and news with what is unread, and its times. */
function GroupPages({ token }: { token: string }) {
  const t = useTranslations();
  const unread = usePortalChat(token).data?.unread ?? 0;
  const unreadNews = (usePortalNews(token).data ?? []).filter((item) => !item.read).length;
  const rows: PageRow[] = [
    {
      id: "chat",
      label: t("portal.tabs.chat"),
      Icon: MessageCircle,
      count: unread,
      pathname: "/student/chat/[token]",
    },
    {
      id: "stream",
      label: t("portal.tabs.stream"),
      Icon: MessagesSquare,
      pathname: "/student/stream/[token]",
    },
    {
      id: "news",
      label: t("portal.tabs.announcements"),
      Icon: Megaphone,
      count: unreadNews,
      pathname: "/student/news/[token]",
    },
    {
      id: "schedule",
      label: t("portal.tabs.schedule"),
      Icon: CalendarDays,
      pathname: "/student/schedule/[token]",
    },
  ];
  return <PageRows token={token} rows={rows} testID="group-pages" />;
}

/** Telegram with how many chats are connected, and the invite code. */
function OwnPages({ token }: { token: string }) {
  const t = useTranslations();
  const telegram = usePortalTelegram(token, false).data;
  const rows: PageRow[] = [
    {
      id: "telegram",
      label: t("portal.telegram.title"),
      Icon: Send,
      note: telegram
        ? t("mobile.telegram.connectedCount", { count: telegram.chats.length })
        : undefined,
      pathname: "/student/telegram/[token]",
    },
    {
      id: "invite",
      label: t("portal.referral.title"),
      Icon: Gift,
      pathname: "/student/invite/[token]",
    },
  ];
  return <PageRows token={token} rows={rows} testID="own-pages" />;
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

function Money({ portal, pay, token }: { portal: Portal; pay?: PayOptions; token: string }) {
  const t = useTranslations();
  const money = useMoney();
  const formatDate = useDate();
  const router = useRouter();
  const { colors } = useTheme();
  const { balance, payments, nextPaymentDate } = portal.money;
  const canPay = (pay?.providers.length ?? 0) > 0;
  return (
    <Card testID="money">
      <Text variant="heading">{t("portal.tabs.money")}</Text>
      {balance < 0 ? (
        <Text tone="destructive" testID="debt">
          {canPay
            ? t("mobile.debtOnline", { amount: money(-balance) })
            : t("portal.money.debt", { amount: money(-balance) })}
        </Text>
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
      {portal.packages && portal.packages.offers.length > 0 ? (
        <View style={styles.offers} testID="package-offers">
          <Text variant="small" tone="mutedForeground">
            {t("portal.money.packages")}
          </Text>
          {portal.packages.offers.map((offer) => (
            <Text key={offer.id}>
              {t("portal.money.packageOffer", {
                name: offer.name,
                lessons: offer.lessons,
                price: money(offer.price),
              })}
            </Text>
          ))}
        </View>
      ) : null}
      {canPay ? (
        <Button
          variant="saffron"
          label={t("mobile.payOnline")}
          icon={<CreditCard size={18} color={colors.saffronForeground} />}
          onPress={() => router.push({ pathname: "/student/pay/[token]", params: { token } })}
          testID="open-pay"
        />
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

function Lessons({ portal, token }: { portal: Portal; token: string }) {
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
            {lesson.canRate || lesson.rating ? (
              <View style={styles.rating}>
                <LessonRating token={token} lesson={lesson} />
              </View>
            ) : null}
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
  flush: { padding: 0, gap: 0, overflow: "hidden" },
  page: {
    minHeight: 52,
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingHorizontal: space[4],
    paddingVertical: space[3],
  },
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
  offers: { gap: 2 },
  rating: { paddingHorizontal: space[4], paddingBottom: space[3] },
  marks: { alignItems: "flex-end", gap: space[1] },
});
