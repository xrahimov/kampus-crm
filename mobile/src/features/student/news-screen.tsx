import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { useEffect, useRef } from "react";
import { StyleSheet, View } from "react-native";

import { usePortal } from "@/api/hooks";
import { markNewsRead, portalKeys, usePortalNews } from "@/api/portal";
import { Header } from "@/components/header";
import { Badge, Card, EmptyState, Screen } from "@/components/surface";
import { Text } from "@/components/text";
import { PendingScreen } from "@/features/shared/pending-screen";
import { useDate, useTranslations } from "@/lib/i18n";
import { space } from "@/lib/theme";

/**
 * The centre's notices on the student's side, in the app (A-215), newest
 * first. Opening the page counts as reading them: the ones that were new keep
 * their mark until the page is left.
 */
export function NewsScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const t = useTranslations();
  const formatDate = useDate();
  const client = useQueryClient();
  const portal = usePortal(token);
  const query = usePortalNews(token);
  const items = query.data;

  const told = useRef(false);
  useEffect(() => {
    if (!items || told.current) return;
    const unread = items.filter((a) => !a.read).map((a) => a.id);
    if (unread.length === 0) return;
    told.current = true;
    void markNewsRead(token, unread).catch(() => {
      told.current = false;
    });
  }, [items, token]);
  // The group's page counts what is unread: after this visit, nothing.
  useEffect(
    () => () => {
      if (told.current) void client.invalidateQueries({ queryKey: portalKeys.news(token) });
    },
    [client, token],
  );

  const header = (
    <Header back title={t("portal.tabs.announcements")} subtitle={portal.data?.portal.group.name} />
  );
  if (!items) return <PendingScreen header={header} query={query} />;
  return (
    <Screen
      header={header}
      onRefresh={() => void query.refetch()}
      refreshing={query.isRefetching}
      contentStyle={styles.list}
    >
      {items.length === 0 ? <EmptyState title={t("portal.announcements.empty")} /> : null}
      {items.map((notice) => (
        <Card key={notice.id} testID={`news-${notice.id}`}>
          <View style={styles.head}>
            <Text variant="bodyStrong" style={styles.fill}>
              {notice.title}
            </Text>
            {notice.read ? null : <Badge tone="accent" label={t("portal.announcements.new")} />}
          </View>
          <Text>{notice.body}</Text>
          <Text variant="small" tone="mutedForeground">
            {formatDate(new Date(notice.createdAt), { dateStyle: "medium" })},{" "}
            {t("portal.announcements.from", { from: notice.from })}
          </Text>
        </Card>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  list: { gap: space[4] },
  head: { flexDirection: "row", alignItems: "flex-start", gap: space[3] },
});
