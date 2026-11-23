import { useLocalSearchParams } from "expo-router";
import { Send, X } from "lucide-react-native";
import { useEffect, useState } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";

import { usePortal } from "@/api/hooks";
import { unlinkTelegramChat, usePortalTelegram } from "@/api/portal-own";
import { Button } from "@/components/button";
import { Header } from "@/components/header";
import { Card, Divider, Screen } from "@/components/surface";
import { Text } from "@/components/text";
import { PendingScreen } from "@/features/shared/pending-screen";
import { errorText, useTranslations } from "@/lib/i18n";
import { space, useTheme } from "@/lib/theme";

/** How long the page looks for the new chat after the student went to Telegram. */
export const TELEGRAM_WATCH_MS = 3 * 60_000;

/**
 * "Connect Telegram" on the student's side, in the app (A-216). The button
 * opens the centre's bot in Telegram with the student's code; back in the app
 * the new chat appears by itself. A connected chat can be removed here.
 */
export function TelegramScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const t = useTranslations();
  const { colors } = useTheme();
  const portal = usePortal(token);
  const [watching, setWatching] = useState(false);
  const query = usePortalTelegram(token, watching);
  const [busy, setBusy] = useState<string | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  useEffect(() => {
    if (!watching) return;
    const timer = setTimeout(() => setWatching(false), TELEGRAM_WATCH_MS);
    return () => clearTimeout(timer);
  }, [watching]);

  const header = (
    <Header back title={t("portal.telegram.title")} subtitle={portal.data?.portal.group.name} />
  );
  if (!query.data) return <PendingScreen header={header} query={query} />;
  const { link, chats } = query.data;

  const connect = () => {
    if (!link) return;
    setProblem(null);
    setWatching(true);
    Linking.openURL(link).catch(() => setProblem(t("mobile.telegram.noApp")));
  };
  const disconnect = (chatId: string) => {
    setBusy(chatId);
    setProblem(null);
    unlinkTelegramChat(token, chatId)
      .then(() => query.refetch())
      .catch((error: unknown) => setProblem(errorText(t, error)))
      .finally(() => setBusy(null));
  };

  return (
    <Screen header={header} onRefresh={() => void query.refetch()} refreshing={query.isRefetching}>
      <Card testID="telegram">
        <Text tone="mutedForeground">{t("portal.telegram.intro")}</Text>
        {chats.map((chat, index) => (
          <View key={chat.chatId} style={styles.rows}>
            {index > 0 ? <Divider /> : null}
            <View style={styles.line} testID={`telegram-chat-${chat.chatId}`}>
              <Text style={styles.fill}>
                {t("portal.telegram.connected", { name: chat.name ?? chat.chatId })}
              </Text>
              <Pressable
                onPress={() => disconnect(chat.chatId)}
                disabled={busy !== null}
                accessibilityRole="button"
                accessibilityLabel={t("portal.telegram.disconnect")}
                hitSlop={10}
                style={styles.remove}
                testID={`telegram-remove-${chat.chatId}`}
              >
                <X size={18} color={colors.mutedForeground} />
              </Pressable>
            </View>
          </View>
        ))}
        {link ? (
          <Button
            variant={chats.length > 0 ? "outline" : "primary"}
            label={
              chats.length > 0 ? t("portal.telegram.connectMore") : t("portal.telegram.connect")
            }
            icon={
              <Send
                size={18}
                color={chats.length > 0 ? colors.foreground : colors.primaryForeground}
              />
            }
            onPress={connect}
            testID="telegram-connect"
          />
        ) : (
          <Text variant="small" tone="mutedForeground" testID="telegram-not-ready">
            {t("portal.telegram.notReady")}
          </Text>
        )}
        {watching ? (
          <Text variant="small" tone="mutedForeground" testID="telegram-watching">
            {t("mobile.telegram.watching")}
          </Text>
        ) : null}
        {problem ? (
          <Text variant="small" tone="destructive" accessibilityRole="alert">
            {problem}
          </Text>
        ) : null}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  rows: { gap: space[3] },
  line: { flexDirection: "row", alignItems: "center", gap: space[3] },
  remove: { padding: space[1] },
});
