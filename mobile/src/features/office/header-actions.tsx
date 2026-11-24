import { useRouter } from "expo-router";
import { Bell, Search, Sparkles } from "lucide-react-native";
import { StyleSheet, View } from "react-native";

import { useUnreadCount } from "@/api/office";
import { Press } from "@/components/motion";
import { Text } from "@/components/text";
import { useSummaryUnseen } from "@/features/assistant/summary-seen";
import { useTranslations } from "@/lib/i18n";
import { can, useMe } from "@/lib/session";
import { useTheme } from "@/lib/theme";

/**
 * How far past its edges a button of the header still takes a tap. Little at
 * the bottom: the page scrolls right under the header, and a tap on what sits
 * just below a button belongs to the page.
 */
const REACH = { top: 8, bottom: 2, left: 4, right: 4 };

/**
 * What stands on top of every page of the site, at the right of the home's
 * header (A-230): the search over students, groups and leads, and the bell
 * with how many notifications wait unread. With them the assistant (A-253),
 * for those the site shows its floating assistant to; it opens on the summary
 * and carries a dot until today's summary has been looked at.
 */
export function HeaderActions() {
  const t = useTranslations();
  const router = useRouter();
  const { colors } = useTheme();
  const unread = useUnreadCount();
  const count = unread.data ?? 0;
  const me = useMe();
  const assistant = can(me, "dashboard.view") || can(me, "groups.view");
  const unseen = useSummaryUnseen(me.user.id);
  return (
    <View style={styles.row}>
      {assistant ? (
        <Press
          accessibilityRole="button"
          accessibilityLabel={t("assistant.launcher.open")}
          hitSlop={REACH}
          sink={0.88}
          onPress={() => router.push({ pathname: "/staff/assistant", params: { tab: "summary" } })}
          style={styles.button}
          testID="open-assistant"
        >
          <Sparkles size={22} color={colors.foreground} />
          {unseen ? (
            <View
              style={[
                styles.dot,
                { backgroundColor: colors.saffron, borderColor: colors.background },
              ]}
              testID="summary-unseen"
            />
          ) : null}
        </Press>
      ) : null}
      <Press
        accessibilityRole="button"
        accessibilityLabel={t("mobile.office.searchTitle")}
        hitSlop={REACH}
        sink={0.88}
        onPress={() => router.push("/staff/search")}
        style={styles.button}
        testID="open-search"
      >
        <Search size={22} color={colors.foreground} />
      </Press>
      <Press
        accessibilityRole="button"
        accessibilityLabel={
          count > 0
            ? `${t("notifications.title")}: ${t("notifications.unreadCount", { count })}`
            : t("notifications.title")
        }
        hitSlop={REACH}
        sink={0.88}
        onPress={() => router.push("/staff/notifications")}
        style={styles.button}
        testID="open-notifications"
      >
        <Bell size={22} color={colors.foreground} />
        {count > 0 ? (
          <View style={[styles.count, { backgroundColor: colors.primary }]} testID="unread-count">
            <Text
              variant="smallStrong"
              style={[styles.countText, { color: colors.primaryForeground }]}
            >
              {count > 99 ? "99+" : count}
            </Text>
          </View>
        ) : null}
      </Press>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", gap: 4 },
  button: { width: 40, height: 36, alignItems: "center", justifyContent: "center" },
  count: {
    position: "absolute",
    top: -2,
    right: 0,
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    paddingHorizontal: 4,
    alignItems: "center",
    justifyContent: "center",
  },
  countText: { fontSize: 11, lineHeight: 14 },
  dot: {
    position: "absolute",
    top: 2,
    right: 6,
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
  },
});
