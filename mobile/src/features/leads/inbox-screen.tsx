import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { useInbox, type Conversation, type InboxStatus } from "@/api/leads";
import { Field } from "@/components/field";
import { Header } from "@/components/header";
import {
  Avatar,
  Badge,
  Card,
  Divider,
  EmptyState,
  Notice,
  Screen,
  Segmented,
} from "@/components/surface";
import { Text } from "@/components/text";
import { PendingScreen } from "@/features/shared/pending-screen";
import { errorText, useDate, useTranslations } from "@/lib/i18n";
import { useRested } from "@/lib/rested";
import { space, useTheme } from "@/lib/theme";

/**
 * Leads → Inbox (A-232): the people who wrote to the centre's Telegram bot or
 * Instagram, open chats first. A press opens the chat. The list asks again
 * every half minute, so a new message shows up by itself.
 */
export function InboxScreen() {
  const t = useTranslations();
  const ti = useTranslations("leads.inbox");
  const router = useRouter();
  const [status, setStatus] = useState<InboxStatus>("open");
  const [typed, setTyped] = useState("");
  const q = useRested(typed);
  const query = useInbox(status, q);

  const header = <Header title={ti("title")} back />;
  if (!query.data) return <PendingScreen header={header} query={query} />;
  const rows = query.data;

  return (
    <Screen
      header={header}
      onRefresh={() => void query.refetch()}
      refreshing={query.isRefetching}
      contentStyle={styles.column}
    >
      <Segmented
        testID="inbox-status"
        value={status}
        onChange={setStatus}
        options={[
          { value: "open", label: ti("status.open") },
          { value: "closed", label: ti("status.closed") },
          { value: "all", label: ti("status.all") },
        ]}
      />
      <Field
        label={t("leads.calls.filters.search")}
        value={typed}
        onChangeText={setTyped}
        autoCapitalize="none"
        autoCorrect={false}
        returnKeyType="search"
        testID="inbox-search"
      />
      {query.error ? <Notice tone="destructive">{errorText(t, query.error)}</Notice> : null}
      {rows.length === 0 ? (
        <EmptyState title={ti("empty")} text={ti("hint")} />
      ) : (
        <Card style={styles.flush} testID="inbox">
          {rows.map((c, index) => (
            <View key={c.id}>
              {index > 0 ? <Divider /> : null}
              <Row
                conversation={c}
                onPress={() =>
                  router.push({ pathname: "/staff/leads/inbox/[id]", params: { id: c.id } })
                }
              />
            </View>
          ))}
        </Card>
      )}
    </Screen>
  );
}

function Row({ conversation: c, onPress }: { conversation: Conversation; onPress: () => void }) {
  const ti = useTranslations("leads.inbox");
  const date = useDate();
  const { colors } = useTheme();
  const last = c.lastMessage
    ? `${c.lastMessage.direction === "OUT" ? `${ti("you")}: ` : ""}${c.lastMessage.text}`
    : ti("noMessages");
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.row, pressed ? { backgroundColor: colors.muted } : null]}
      testID={`conversation-${c.id}`}
    >
      <Avatar name={c.displayName} />
      <View style={styles.fill}>
        <View style={styles.line}>
          <Text
            variant={c.unreadCount > 0 ? "bodyStrong" : "body"}
            style={styles.fill}
            numberOfLines={1}
          >
            {c.displayName}
          </Text>
          <Text variant="small" tone="mutedForeground">
            {date(new Date(c.lastMessageAt), { day: "numeric", month: "short" })}
          </Text>
        </View>
        <View style={styles.line}>
          <Text variant="small" tone="mutedForeground" style={styles.fill} numberOfLines={1}>
            {last}
          </Text>
          {c.unreadCount > 0 ? (
            <Badge label={String(c.unreadCount)} tone="accent" testID={`unread-${c.id}`} />
          ) : c.isClosed ? (
            <Badge label={ti("closed")} />
          ) : null}
        </View>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  column: { gap: space[4] },
  fill: { flex: 1 },
  flush: { padding: 0, overflow: "hidden" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingHorizontal: space[4],
    paddingVertical: space[3],
  },
  line: { flexDirection: "row", alignItems: "center", gap: space[2] },
});
