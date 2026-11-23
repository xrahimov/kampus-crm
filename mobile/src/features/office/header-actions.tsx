import { useRouter } from "expo-router";
import { Bell, Search } from "lucide-react-native";
import { StyleSheet, View } from "react-native";

import { useUnreadCount } from "@/api/office";
import { Press } from "@/components/motion";
import { Text } from "@/components/text";
import { useTranslations } from "@/lib/i18n";
import { useTheme } from "@/lib/theme";

/**
 * The two things on top of every page of the site, at the right of the home's
 * header (A-230): the search over students, groups and leads, and the bell
 * with how many notifications wait unread.
 */
export function HeaderActions() {
  const t = useTranslations();
  const router = useRouter();
  const { colors } = useTheme();
  const unread = useUnreadCount();
  const count = unread.data ?? 0;
  return (
    <View style={styles.row}>
      <Press
        accessibilityRole="button"
        accessibilityLabel={t("mobile.office.searchTitle")}
        hitSlop={8}
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
        hitSlop={8}
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
});
