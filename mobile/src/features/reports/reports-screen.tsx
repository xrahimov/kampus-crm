import { ChevronRight, ExternalLink } from "lucide-react-native";
import { StyleSheet, View } from "react-native";

import { REPORTS } from "@/api/office-reports";
import { Header } from "@/components/header";
import { Card, EmptyState, Notice, Screen } from "@/components/surface";
import { Text } from "@/components/text";
import { nativeRoute, useOpenPath } from "@/features/office/site-paths";
import { useTranslations } from "@/lib/i18n";
import { useLayout } from "@/lib/layout";
import { can, useMe } from "@/lib/session";
import { space, useTheme } from "@/lib/theme";

/**
 * Reports (A-238): the site's list of reports, the ones the person may see.
 * A report the app has opens here; one it does not have yet opens on the
 * site and carries the sign of a page that leaves the app.
 */
export function ReportsScreen() {
  const t = useTranslations("reports");
  const me = useMe();
  const { wide } = useLayout();
  const { colors } = useTheme();
  const { open, error } = useOpenPath();
  const items = REPORTS.filter((item) => can(me, item.permission));
  return (
    <Screen header={<Header back title={t("title")} />}>
      <Text tone="mutedForeground">{t("description")}</Text>
      {error ? <Notice tone="destructive">{error}</Notice> : null}
      {items.length === 0 ? (
        <EmptyState title={t("title")} />
      ) : (
        <View style={styles.grid} testID="reports-list">
          {items.map((item) => (
            <View key={item.key} style={wide ? styles.half : styles.full}>
              <Card
                onPress={() => open(item.path)}
                style={styles.card}
                testID={`report-${item.key}`}
              >
                <Text variant="bodyStrong" style={styles.fill}>
                  {t(`items.${item.key}`)}
                </Text>
                {nativeRoute(item.path) ? (
                  <ChevronRight size={18} color={colors.mutedForeground} />
                ) : (
                  <ExternalLink
                    size={16}
                    color={colors.mutedForeground}
                    testID={`report-${item.key}-site`}
                  />
                )}
              </Card>
            </View>
          ))}
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  grid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -space[2], rowGap: space[3] },
  full: { width: "100%", paddingHorizontal: space[2] },
  half: { width: "50%", paddingHorizontal: space[2] },
  card: { flexDirection: "row", alignItems: "center", gap: space[2], minHeight: 56 },
});
