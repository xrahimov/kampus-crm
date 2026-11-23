import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import {
  Award,
  ChartNoAxesColumn,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ClipboardList,
  Coins,
  FileQuestion,
  FolderOpen,
  GraduationCap,
  History,
  ListChecks,
  Megaphone,
  MessageSquare,
  MessageSquareText,
  StickyNote,
} from "lucide-react-native";
import { useCallback, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { useGroupChat } from "@/api/group-pages";
import { useCheckingQueue, useGroup, useMonthGrid } from "@/api/hooks";
import type { GridLesson } from "@/api/types";
import { Button } from "@/components/button";
import { Header } from "@/components/header";
import { Avatar, Badge, Card, Divider, EmptyState, Loading, Screen } from "@/components/surface";
import { Text } from "@/components/text";
import { addMonths, dayAsDate } from "@/lib/days";
import { errorText, useDate, useTranslations } from "@/lib/i18n";
import { useLayout } from "@/lib/layout";
import { can, useMe } from "@/lib/session";
import { radius, space, useTheme } from "@/lib/theme";

import { useScheduleLine } from "./groups-screen";
import { OpenOnSite } from "./open-on-site";

/** Tashkent's month now, as "2026-11". */
function thisMonth(): string {
  return new Date(Date.now() + 5 * 3600_000).toISOString().slice(0, 7);
}

/**
 * One group: its homework, chat, materials, stream, gradebook and notes, the
 * month's lessons (each opens to be marked) and the students with their
 * average grade. What is left of the group's page (the office's side:
 * payments, discounts, history) is a tap away on the site.
 */
export function GroupScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTranslations();
  const { wide } = useLayout();
  const schedule = useScheduleLine();
  const [month, setMonth] = useState(thisMonth);
  const group = useGroup(id);
  const grid = useMonthGrid(id, month);
  const router = useRouter();
  const { colors } = useTheme();
  const maySeeStudents = can(useMe(), "students.view");

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
      <GroupPages id={id} />
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
            <Pressable
              // A student's page opens for someone who may see students; one who
              // left the group is no longer a teacher's to open.
              disabled={
                !maySeeStudents || member.status === "ARCHIVED" || member.status === "GRADUATED"
              }
              onPress={() =>
                router.push({ pathname: "/staff/student/[id]", params: { id: member.studentId } })
              }
              accessibilityRole="button"
              accessibilityLabel={member.fullName}
              style={({ pressed }) => [
                styles.row,
                pressed ? { backgroundColor: colors.muted } : null,
              ]}
              testID={`member-${member.membershipId}`}
            >
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
            </Pressable>
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

/** How many of a group's pages show before "More pages" is pressed. */
const FIRST_PAGES = 6;

/** The group's other pages, each a screen of its own (A-214, A-217 to A-219). */
function GroupPages({ id }: { id: string }) {
  const t = useTranslations();
  const router = useRouter();
  const { colors } = useTheme();
  const me = useMe();
  const chat = useGroupChat(id);
  const checking = useCheckingQueue(can(me, "groups.attendance.mark"));
  const refetchChat = chat.refetch;
  const refetchChecking = checking.refetch;
  const mayCheck = can(me, "groups.attendance.mark");
  // Coming back from the chat shows it as read; from the homework, what is still to check.
  useFocusEffect(
    useCallback(() => {
      void refetchChat();
      if (mayCheck) void refetchChecking();
    }, [refetchChat, refetchChecking, mayCheck]),
  );
  const [all, setAll] = useState(false);
  const unread = chat.data?.unread ?? 0;
  const toCheck = checking.data?.items.filter((item) => item.groupId === id).length ?? 0;
  const pages = [
    {
      key: "homework",
      label: t("groups.detail.tabs.homework"),
      Icon: ClipboardList,
      pathname: "/staff/homework/[id]" as const,
      count: toCheck,
      countLabel: t("today.homework.toCheck", { count: toCheck }),
      tone: "warning" as const,
    },
    {
      key: "chat",
      label: t("groups.detail.tabs.chat"),
      Icon: MessageSquare,
      pathname: "/staff/chat/[id]" as const,
      count: unread,
      countLabel: t("notifications.unreadCount", { count: unread }),
      tone: "accent" as const,
    },
    {
      key: "materials",
      label: t("groups.detail.tabs.materials"),
      Icon: FolderOpen,
      pathname: "/staff/materials/[id]" as const,
    },
    {
      key: "stream",
      label: t("groups.detail.tabs.stream"),
      Icon: Megaphone,
      pathname: "/staff/stream/[id]" as const,
    },
    {
      key: "coins",
      label: t("groups.detail.tabs.coins"),
      Icon: Coins,
      pathname: "/staff/coins/[id]" as const,
    },
    {
      key: "plan",
      label: t("groups.detail.tabs.syllabus"),
      Icon: ListChecks,
      pathname: "/staff/plan/[id]" as const,
    },
    {
      key: "gradebook",
      label: t("groups.detail.tabs.gradebook"),
      Icon: GraduationCap,
      pathname: "/staff/gradebook/[id]" as const,
    },
    // Tests show to someone who may see them; a teacher may by default.
    ...(can(me, "tests.view")
      ? [
          {
            key: "tests",
            label: t("groups.detail.tabs.tests"),
            Icon: FileQuestion,
            pathname: "/staff/tests/[id]" as const,
          },
          {
            key: "knowledge",
            label: t("groups.detail.tabs.knowledge"),
            Icon: ChartNoAxesColumn,
            pathname: "/staff/knowledge/[id]" as const,
          },
        ]
      : []),
    ...(can(me, "exams.view")
      ? [
          {
            key: "exams",
            label: t("groups.detail.tabs.exams"),
            Icon: Award,
            pathname: "/staff/exams/[id]" as const,
          },
        ]
      : []),
    {
      key: "notes",
      label: t("groups.detail.tabs.notes"),
      Icon: StickyNote,
      pathname: "/staff/notes/[id]" as const,
    },
    {
      key: "comments",
      label: t("groups.detail.tabs.comments"),
      Icon: MessageSquareText,
      pathname: "/staff/comments/[id]" as const,
    },
    {
      key: "history",
      label: t("groups.detail.tabs.history"),
      Icon: History,
      pathname: "/staff/history/[id]" as const,
    },
  ];
  // The pages a teacher opens every day come first; the rest wait behind one button.
  const shown = all ? pages : pages.slice(0, FIRST_PAGES);
  return (
    <View style={styles.pages} testID="group-pages">
      {shown.map(({ key, label, Icon, pathname, count = 0, countLabel, tone }) => (
        <Pressable
          key={key}
          onPress={() => router.push({ pathname, params: { id } })}
          accessibilityRole="button"
          accessibilityLabel={count > 0 ? `${label}, ${countLabel}` : label}
          style={({ pressed }) => [
            styles.page,
            { borderColor: colors.input, backgroundColor: pressed ? colors.muted : colors.card },
          ]}
          testID={`open-${key}`}
        >
          <Icon size={20} color={colors.foreground} />
          <Text variant="bodyStrong" style={styles.fill} numberOfLines={2}>
            {label}
          </Text>
          {count > 0 ? <Badge tone={tone} label={String(count)} testID={`count-${key}`} /> : null}
        </Pressable>
      ))}
      {pages.length > FIRST_PAGES ? (
        <Button
          compact
          variant="ghost"
          label={all ? t("mobile.pages.fewer") : t("mobile.pages.more")}
          icon={
            all ? (
              <ChevronUp size={16} color={colors.foreground} />
            ) : (
              <ChevronDown size={16} color={colors.foreground} />
            )
          }
          onPress={() => setAll((was) => !was)}
          style={styles.morePages}
          testID="pages-more"
        />
      ) : null}
    </View>
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
  pages: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  morePages: { flexBasis: "100%", alignSelf: "flex-start" },
  page: {
    // Two to a row: the gap is taken off each half.
    flexBasis: "45%",
    flexGrow: 1,
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    paddingHorizontal: space[3],
    borderWidth: 1,
    borderRadius: radius.md,
  },
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
