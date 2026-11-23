import { ExternalLink } from "lucide-react-native";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { useMarkRead, useNotifications, type StaffNotification } from "@/api/office";
import { Button } from "@/components/button";
import { Header } from "@/components/header";
import { Card, Divider, EmptyState, Notice, Screen, Segmented } from "@/components/surface";
import { Text } from "@/components/text";
import { PendingScreen } from "@/features/shared/pending-screen";
import { errorText, useDate, useMoney, useTranslations } from "@/lib/i18n";
import { space, useTheme } from "@/lib/theme";

import { nativeRoute, useOpenPath } from "./site-paths";

/** The values of a notification's sentence; money is written the centre's way. */
export function notificationValues(
  n: StaffNotification,
  money: (value: number) => string,
): Record<string, string | number> {
  const values = { ...n.params };
  if (
    (n.kind === "PAYMENT" || n.kind === "DEBT_PROMISE_BROKEN") &&
    typeof values.amount === "number"
  ) {
    values.amount = money(values.amount);
  }
  return values;
}

/**
 * The bell's list (A-230): what needs the person's attention, newest first.
 * Pressing one marks it read and opens what it is about, in the app where the
 * app has that page and on the site where it does not yet.
 */
export function NotificationsScreen() {
  const t = useTranslations();
  const tn = useTranslations("notifications");
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const query = useNotifications(filter === "unread");
  const markRead = useMarkRead();
  const { open, error } = useOpenPath();

  const header = <Header title={tn("title")} back />;
  if (!query.data) return <PendingScreen header={header} query={query} />;
  const rows = query.data.pages.flatMap((page) => page.items);
  const unread = query.data.pages[0]?.unread ?? 0;

  const press = (n: StaffNotification) => {
    if (!n.readAt) markRead.mutate({ ids: [n.id] });
    if (n.href) open(n.href);
  };

  return (
    <Screen
      header={header}
      onRefresh={() => void query.refetch()}
      refreshing={query.isRefetching && !query.isFetchingNextPage}
      contentStyle={styles.column}
    >
      <Segmented
        testID="notifications-filter"
        value={filter}
        onChange={setFilter}
        options={[
          { value: "all", label: tn("title") },
          { value: "unread", label: tn("unreadCount", { count: unread }) },
        ]}
      />
      {error ? <Notice tone="destructive">{error}</Notice> : null}
      {markRead.error ? <Notice tone="destructive">{errorText(t, markRead.error)}</Notice> : null}
      {rows.length === 0 ? (
        <EmptyState title={tn("empty")} />
      ) : (
        <Card style={styles.flush} testID="notifications">
          {rows.map((n, index) => (
            <View key={n.id}>
              {index > 0 ? <Divider /> : null}
              <Row n={n} onPress={() => press(n)} />
            </View>
          ))}
        </Card>
      )}
      {query.hasNextPage ? (
        <Button
          variant="outline"
          label={t("mobile.studentsPage.more")}
          loading={query.isFetchingNextPage}
          onPress={() => void query.fetchNextPage()}
          style={styles.start}
          testID="notifications-more"
        />
      ) : null}
      {unread > 0 ? (
        <Button
          variant="ghost"
          label={tn("markAllRead")}
          loading={markRead.isPending}
          onPress={() => markRead.mutate({ all: true })}
          testID="mark-all-read"
        />
      ) : null}
    </Screen>
  );
}

function Row({ n, onPress }: { n: StaffNotification; onPress: () => void }) {
  const tn = useTranslations("notifications");
  const money = useMoney();
  const date = useDate();
  const { colors } = useTheme();
  const onSite = n.href !== null && nativeRoute(n.href) === null;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.row, pressed ? { backgroundColor: colors.muted } : null]}
      testID={`notification-${n.id}`}
    >
      <View
        style={[styles.dot, { backgroundColor: n.readAt ? "transparent" : colors.sidebarActive }]}
        testID={n.readAt ? undefined : `unread-${n.id}`}
      />
      <View style={styles.fill}>
        <Text variant={n.readAt ? "body" : "bodyStrong"}>
          {tn(`kinds.${n.kind}`, notificationValues(n, money))}
        </Text>
        <Text variant="small" tone="mutedForeground">
          {date(new Date(n.createdAt), { dateStyle: "medium", timeStyle: "short" })}
        </Text>
      </View>
      {onSite ? <ExternalLink size={16} color={colors.mutedForeground} /> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  column: { gap: space[4] },
  flush: { padding: 0, overflow: "hidden" },
  start: { alignSelf: "flex-start" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingHorizontal: space[4],
    paddingVertical: space[3],
  },
  dot: { width: 8, height: 8, borderRadius: 4 },
});
