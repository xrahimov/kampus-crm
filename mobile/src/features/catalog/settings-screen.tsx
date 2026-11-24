import { ChevronRight, ExternalLink } from "lucide-react-native";
import { Pressable, StyleSheet, View } from "react-native";

import { Header } from "@/components/header";
import { Card, Divider, EmptyState, Notice, Screen } from "@/components/surface";
import { Text } from "@/components/text";
import { nativeRoute, useOpenPath } from "@/features/office/site-paths";
import { useTranslations } from "@/lib/i18n";
import { can, useMe } from "@/lib/session";
import { space, useTheme } from "@/lib/theme";

import { SETTINGS_SECTIONS } from "./settings-sections";

/**
 * Settings (A-234): the sections of the site's Settings the person may open,
 * in the site's order. Some are in the app (`nativeRoute` knows which); a
 * section the app does not have yet opens on the site, already signed in,
 * with the arrow that says so.
 */
export function SettingsScreen() {
  const t = useTranslations();
  const me = useMe();
  const { colors } = useTheme();
  const { open, error } = useOpenPath();
  const sections = SETTINGS_SECTIONS.filter((section) => can(me, section.permission));
  return (
    <Screen header={<Header back title={t("nav.settings")} />}>
      {error ? <Notice tone="destructive">{error}</Notice> : null}
      {sections.length === 0 ? (
        <EmptyState title={t("common.nothingFound")} />
      ) : (
        <Card style={styles.flush} testID="settings">
          {sections.map((section, index) => {
            const label = t(`settings.nav.${section.key}`);
            const onSite = nativeRoute(section.path) === null;
            return (
              <View key={section.key}>
                {index > 0 ? <Divider /> : null}
                <Pressable
                  onPress={() => open(section.path)}
                  accessibilityRole="button"
                  accessibilityLabel={onSite ? `${label}. ${t("mobile.openOnSite")}` : label}
                  style={({ pressed }) => [
                    styles.row,
                    pressed ? { backgroundColor: colors.muted } : null,
                  ]}
                  testID={`settings-${section.key}`}
                >
                  <Text variant="body" style={styles.fill} numberOfLines={1}>
                    {label}
                  </Text>
                  {onSite ? (
                    <ExternalLink
                      size={16}
                      color={colors.mutedForeground}
                      testID={`settings-${section.key}-site`}
                    />
                  ) : (
                    <ChevronRight size={18} color={colors.mutedForeground} />
                  )}
                </Pressable>
              </View>
            );
          })}
        </Card>
      )}
      <Text variant="small" tone="mutedForeground">
        {t("mobile.catalog.moreSettings")}
      </Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  flush: { padding: 0, gap: 0, overflow: "hidden" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingHorizontal: space[4],
    minHeight: 48,
  },
});
