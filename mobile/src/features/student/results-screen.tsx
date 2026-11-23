import { useLocalSearchParams } from "expo-router";
import {
  Award,
  BookOpenText,
  CalendarCheck,
  Coins,
  Dumbbell,
  Flame,
  Medal,
  Sparkles,
  Target,
  Trophy,
} from "lucide-react-native";
import { StyleSheet, View } from "react-native";

import { usePortal } from "@/api/hooks";
import { usePortalBadges, usePortalGradebook } from "@/api/portal";
import type { BadgeCode, Portal, PortalBadge, PortalGradebook } from "@/api/types";
import { Header } from "@/components/header";
import { Badge, Card, Divider, Screen, type Tone } from "@/components/surface";
import { Text } from "@/components/text";
import { PendingScreen } from "@/features/shared/pending-screen";
import { dayAsDate } from "@/lib/days";
import { useDate, useTranslations } from "@/lib/i18n";
import { useLayout } from "@/lib/layout";
import { radius, space, useTheme } from "@/lib/theme";

import { Meter } from "./meter";

/** A month counts as perfect from this many lessons (the server's `PERFECT_MONTH_LESSONS`). */
const PERFECT_MONTH_LESSONS = 8;

const BADGE_ICON: Record<BadgeCode, typeof Award> = {
  firstHomework: Award,
  homework10: Medal,
  streak10: Flame,
  perfectMonth: CalendarCheck,
  exercises10: Dumbbell,
  exerciseAce: Target,
  testAce: Trophy,
  coins100: Coins,
  words50: BookOpenText,
  vocabStreak7: Sparkles,
};

/**
 * How the student is doing, in the app (A-215): the grade in the course part
 * by part, the badges earned and still to earn, exams and the tests taken.
 */
export function ResultsScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const t = useTranslations();
  const { wide } = useLayout();
  const portal = usePortal(token);
  const gradebook = usePortalGradebook(token);
  const badges = usePortalBadges(token);

  const header = (
    <Header back title={t("portal.tabs.results")} subtitle={portal.data?.portal.group.name} />
  );
  if (!portal.data) return <PendingScreen header={header} query={portal} />;
  const refresh = () => {
    void portal.refetch();
    void gradebook.refetch();
    void badges.refetch();
  };
  const grade = gradebook.data ? <Gradebook data={gradebook.data} /> : null;
  const earned = badges.data ? <Badges badges={badges.data} /> : null;
  const taken = (
    <>
      <Exams portal={portal.data.portal} />
      <Tests portal={portal.data.portal} />
    </>
  );
  return (
    <Screen
      header={header}
      onRefresh={refresh}
      refreshing={portal.isRefetching}
      contentStyle={wide ? styles.split : styles.block}
    >
      {wide ? (
        <>
          <View style={styles.column}>
            {grade}
            {taken}
          </View>
          <View style={styles.column}>{earned}</View>
        </>
      ) : (
        <>
          {grade}
          {earned}
          {taken}
        </>
      )}
    </Screen>
  );
}

function Gradebook({ data }: { data: PortalGradebook }) {
  const t = useTranslations("portal.gradebook");
  const shown = data.categories.filter((c) => c.weight > 0);
  return (
    <Card testID="gradebook">
      <Text variant="heading">{t("title", { course: data.courseName })}</Text>
      <View style={styles.line}>
        <Text variant="title" testID="gradebook-final">
          {data.final === null ? t("noGrade") : `${data.final}%`}
        </Text>
        {data.level ? <Badge tone="accent" label={data.level} /> : null}
      </View>
      <Meter percent={data.final} label={t("final")} />
      {shown.map((category) => (
        <View key={category.key} style={styles.line} testID={`gradebook-${category.key}`}>
          <View style={styles.fill}>
            <Text>{t(`categories.${category.key}`)}</Text>
            <Text variant="small" tone="mutedForeground">
              {t("weight", { percent: category.weight })}
            </Text>
          </View>
          <Text variant="figure">
            {category.percent === null ? t("none") : `${category.percent}%`}
          </Text>
        </View>
      ))}
      <Text variant="small" tone="mutedForeground">
        {t("hint")}
      </Text>
    </Card>
  );
}

function Badges({ badges }: { badges: PortalBadge[] }) {
  const t = useTranslations("badges");
  const formatDate = useDate();
  const { colors } = useTheme();
  const earned = badges.filter((b) => b.earnedAt).length;
  return (
    <Card testID="badges">
      <Text variant="heading">{t("title")}</Text>
      <Text variant="small" tone="mutedForeground" testID="badges-count">
        {t("count", { earned, total: badges.length })}
      </Text>
      <View style={styles.tiles}>
        {badges.map((badge) => {
          const Icon = BADGE_ICON[badge.code];
          const done = badge.earnedAt !== null;
          return (
            <View
              key={badge.code}
              style={[
                styles.tile,
                {
                  borderColor: done ? colors.ring : colors.border,
                  backgroundColor: done ? colors.accent : colors.card,
                },
              ]}
              accessibilityState={{ checked: done }}
              testID={done ? `badge-earned-${badge.code}` : `badge-locked-${badge.code}`}
            >
              <Icon size={22} color={done ? colors.ring : colors.mutedForeground} />
              <View style={styles.fill}>
                <Text variant="smallStrong" tone={done ? "accentForeground" : "foreground"}>
                  {t(`items.${badge.code}.name`)}
                </Text>
                <Text variant="small" tone={done ? "accentForeground" : "mutedForeground"}>
                  {done
                    ? t("earned", {
                        date: formatDate(new Date(badge.earnedAt!), { dateStyle: "medium" }),
                      })
                    : t(`items.${badge.code}.hint`, { count: PERFECT_MONTH_LESSONS })}
                </Text>
              </View>
            </View>
          );
        })}
      </View>
    </Card>
  );
}

function Exams({ portal }: { portal: Portal }) {
  const t = useTranslations("portal.results");
  const formatDate = useDate();
  return (
    <Card testID="exams">
      <Text variant="heading">{t("exams")}</Text>
      {portal.exams.length === 0 ? (
        <Text variant="small" tone="mutedForeground">
          {t("noExams")}
        </Text>
      ) : null}
      {portal.exams.map((exam, index) => {
        const outcome: { label: string; tone: Tone } = !exam.isPresent
          ? { label: t("missed"), tone: "warning" }
          : exam.passed === null
            ? { label: t("pending"), tone: "neutral" }
            : exam.passed
              ? { label: t("passed"), tone: "success" }
              : { label: t("failed"), tone: "destructive" };
        return (
          <View key={exam.id} style={styles.rows}>
            {index > 0 ? <Divider /> : null}
            <View style={styles.line} testID={`exam-${exam.id}`}>
              <View style={styles.fill}>
                <Text>{exam.name}</Text>
                <Text variant="small" tone="mutedForeground">
                  {[formatDate(dayAsDate(exam.date), { dateStyle: "medium" }), exam.level]
                    .filter(Boolean)
                    .join(", ")}
                </Text>
              </View>
              {exam.score !== null ? (
                <Text variant="figure">
                  {exam.score} / {exam.maxScore}
                </Text>
              ) : null}
              <Badge tone={outcome.tone} label={outcome.label} />
            </View>
          </View>
        );
      })}
    </Card>
  );
}

function Tests({ portal }: { portal: Portal }) {
  const t = useTranslations("portal.results");
  const formatDate = useDate();
  return (
    <Card testID="test-results">
      <Text variant="heading">{t("tests")}</Text>
      {portal.tests.length === 0 ? (
        <Text variant="small" tone="mutedForeground">
          {t("noTests")}
        </Text>
      ) : null}
      {portal.tests.map((test, index) => (
        <View key={test.id} style={styles.rows}>
          {index > 0 ? <Divider /> : null}
          <View style={styles.line} testID={`test-result-${test.id}`}>
            <View style={styles.fill}>
              <Text>{test.testName}</Text>
              <Text variant="small" tone="mutedForeground">
                {[test.subject, formatDate(new Date(test.submittedAt), { dateStyle: "medium" })]
                  .filter(Boolean)
                  .join(", ")}
              </Text>
            </View>
            <Text variant="figure">
              {test.score} / {test.maxScore}
            </Text>
            <Text tone="mutedForeground">{test.percent}%</Text>
          </View>
        </View>
      ))}
    </Card>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  block: { gap: space[4] },
  split: { flexDirection: "row", alignItems: "flex-start", gap: space[6] },
  column: { flex: 1, gap: space[4] },
  line: { flexDirection: "row", alignItems: "center", gap: space[3] },
  rows: { gap: space[3] },
  tiles: { gap: space[2] },
  tile: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space[3],
    padding: space[3],
    borderWidth: 1,
    borderRadius: radius.md,
  },
});
