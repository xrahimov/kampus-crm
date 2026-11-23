import { useRouter } from "expo-router";
import { ArrowLeft } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useTranslations } from "@/lib/i18n";
import { useLayout } from "@/lib/layout";
import { CONTENT_MAX_WIDTH, space, useTheme } from "@/lib/theme";

import { Text } from "./text";

/**
 * The bar at the top of a screen: its name, a way back on pushed screens, and
 * at most one action on the right. It keeps clear of the status bar itself.
 */
export function Header({
  title,
  subtitle,
  back = false,
  right,
}: {
  title: string;
  subtitle?: string;
  back?: boolean;
  right?: ReactNode;
}) {
  const { colors } = useTheme();
  const { wide } = useLayout();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const t = useTranslations();
  const pad = wide ? space[8] : space[4];
  return (
    <View
      style={[
        styles.bar,
        {
          backgroundColor: colors.background,
          borderBottomColor: colors.border,
          paddingTop: insets.top + space[3],
          paddingHorizontal: pad,
        },
      ]}
    >
      <View style={styles.row}>
        {back ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t("common.back")}
            testID="back"
            hitSlop={12}
            onPress={() => (router.canGoBack() ? router.back() : router.replace("/"))}
            style={styles.back}
          >
            <ArrowLeft size={22} color={colors.foreground} />
          </Pressable>
        ) : null}
        <View style={styles.titles}>
          <Text variant={back ? "heading" : "title"} numberOfLines={1} accessibilityRole="header">
            {title}
          </Text>
          {subtitle ? (
            <Text variant="small" tone="mutedForeground" numberOfLines={1}>
              {subtitle}
            </Text>
          ) : null}
        </View>
        {right}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { borderBottomWidth: StyleSheet.hairlineWidth, paddingBottom: space[3] },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    width: "100%",
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: "center",
    minHeight: 36,
  },
  back: { width: 36, height: 36, alignItems: "center", justifyContent: "center", marginLeft: -8 },
  titles: { flex: 1 },
});
