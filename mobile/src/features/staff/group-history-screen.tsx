import { useLocalSearchParams } from "expo-router";
import { StyleSheet, View } from "react-native";

import { useGroup } from "@/api/hooks";
import { HISTORY_PAGE, useGroupHistory } from "@/api/staff-group";
import type { GroupHistoryRow } from "@/api/types";
import { Header } from "@/components/header";
import { Card, Divider, EmptyState, Screen } from "@/components/surface";
import { Text } from "@/components/text";
import { PendingScreen } from "@/features/shared/pending-screen";
import { weekdayAsDate } from "@/lib/days";
import { useDate, useTranslations } from "@/lib/i18n";
import { space } from "@/lib/theme";
import { historyActionKey } from "@kampus/lib/group-history";

type Translate = ReturnType<typeof useTranslations>;
type FormatDate = ReturnType<typeof useDate>;

/** A changed value in words: a status by its name, people by theirs, a day with its time. */
export function historyValue(value: unknown, t: Translate, formatDate: FormatDate): string {
  if (value === null || value === undefined || value === "") return "–";
  if (typeof value === "string") {
    for (const space of ["groups.statuses", "groups.patterns"]) {
      if (t.has(`${space}.${value}`)) return t(`${space}.${value}`);
    }
    return value;
  }
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    // An empty list reads as nothing, like an empty field.
    if (value.length === 0) return "–";
    return value
      .map((item) => {
        if (item && typeof item === "object") {
          const o = item as Record<string, unknown>;
          if ("fullName" in o) {
            const share =
              "shareValue" in o
                ? ` ${String(o.shareValue)}${o.shareType === "PERCENT" ? "%" : ""}`
                : "";
            return `${String(o.fullName)}${share}`;
          }
          if ("weekday" in o) {
            const day = formatDate(weekdayAsDate(Number(o.weekday)), { weekday: "short" });
            const room = o.roomName ? ` (${String(o.roomName)})` : "";
            return `${day} ${String(o.startTime)}–${String(o.endTime)}${room}`;
          }
          return JSON.stringify(o);
        }
        return String(item);
      })
      .join("; ");
  }
  return JSON.stringify(value);
}

/**
 * A group's history, in the app (A-219): what was changed about the group,
 * by whom and when, the newest change first.
 */
export function GroupHistoryScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTranslations();
  const group = useGroup(id);
  const query = useGroupHistory(id);

  const header = (
    <Header back title={t("groups.detail.tabs.history")} subtitle={group.data?.name} />
  );
  if (!query.data) return <PendingScreen header={header} query={query} />;
  const { items, total } = query.data;

  return (
    <Screen
      header={header}
      onRefresh={() => void query.refetch()}
      refreshing={query.isRefetching}
      contentStyle={styles.column}
    >
      {items.length === 0 ? (
        <EmptyState title={t("groups.history.empty")} />
      ) : (
        <Card style={styles.flush}>
          {items.map((row, index) => (
            <View key={row.id}>
              {index > 0 ? <Divider /> : null}
              <Change row={row} />
            </View>
          ))}
        </Card>
      )}
      {total > HISTORY_PAGE ? (
        <Text variant="small" tone="mutedForeground" testID="history-latest">
          {t("mobile.history.latest", { count: HISTORY_PAGE })}
        </Text>
      ) : null}
    </Screen>
  );
}

function Change({ row }: { row: GroupHistoryRow }) {
  const t = useTranslations();
  const th = useTranslations("groups.history");
  const formatDate = useDate();
  const title = row.field
    ? th.has(`fields.${row.field}`)
      ? th(`fields.${row.field}`)
      : row.field
    : th(`actions.${historyActionKey(row.action, (key) => th.has(`actions.${key}`))}`);
  return (
    <View style={styles.change} testID={`history-${row.id}`}>
      <Text variant="bodyStrong">{title}</Text>
      {row.field ? (
        <View>
          <Text variant="small" tone="mutedForeground" testID="history-before">
            {th("before")}: {historyValue(row.before, t, formatDate)}
          </Text>
          <Text variant="small" testID="history-after">
            {th("after")}: {historyValue(row.after, t, formatDate)}
          </Text>
        </View>
      ) : null}
      <Text variant="small" tone="mutedForeground">
        {[row.actorName, formatDate(new Date(row.at), { dateStyle: "medium", timeStyle: "short" })]
          .filter(Boolean)
          .join(", ")}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  column: { gap: space[4], maxWidth: 720 },
  flush: { padding: 0, gap: 0 },
  change: { gap: space[1], paddingHorizontal: space[4], paddingVertical: space[3] },
});
