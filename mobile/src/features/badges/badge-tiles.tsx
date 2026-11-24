import { PERFECT_MONTH_LESSONS } from "@kampus/lib/validation/badges";
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

import type { BadgeCode, PortalBadge } from "@/api/types";
import { Card } from "@/components/surface";
import { Text } from "@/components/text";
import { useDate, useTranslations } from "@/lib/i18n";
import { radius, space, useTheme } from "@/lib/theme";

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
 * Every badge as a tile (A-163): an earned one in colour with its day, a
 * locked one with what earns it. The student sees their own (A-215); staff see
 * a student's on the student's page, with the group it was earned in (A-264).
 */
export function BadgeTiles({
  badges,
  title,
  withGroup = false,
  testID = "badges",
}: {
  badges: PortalBadge[];
  title: string;
  /** Says the group after the day, as the site's student page does. */
  withGroup?: boolean;
  testID?: string;
}) {
  const t = useTranslations("badges");
  const formatDate = useDate();
  const { colors } = useTheme();
  const earned = badges.filter((b) => b.earnedAt).length;
  return (
    <Card testID={testID}>
      <Text variant="heading">{title}</Text>
      <Text variant="small" tone="mutedForeground" testID={`${testID}-count`}>
        {t("count", { earned, total: badges.length })}
      </Text>
      <View style={styles.tiles}>
        {badges.map((badge) => {
          const Icon = BADGE_ICON[badge.code];
          const done = badge.earnedAt !== null;
          const when = done
            ? t("earned", {
                date: formatDate(new Date(badge.earnedAt!), { dateStyle: "medium" }),
              })
            : null;
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
                  {when
                    ? withGroup && badge.groupName
                      ? `${when}, ${badge.groupName}`
                      : when
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

const styles = StyleSheet.create({
  fill: { flex: 1 },
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
