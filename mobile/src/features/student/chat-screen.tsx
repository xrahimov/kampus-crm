import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams } from "expo-router";
import { Send } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { usePortal } from "@/api/hooks";
import {
  fetchChat,
  fetchChatAfter,
  markChatRead,
  portalKeys,
  sendChatMessage,
  usePortalChat,
} from "@/api/portal";
import type { ChatMessage, PortalChat } from "@/api/types";
import { Button } from "@/components/button";
import { Header } from "@/components/header";
import { EmptyState, Loading, Screen } from "@/components/surface";
import { Text } from "@/components/text";
import { errorText, useDate, useTranslations } from "@/lib/i18n";
import { useLayout } from "@/lib/layout";
import { CONTENT_MAX_WIDTH, font, radius, space, useTheme } from "@/lib/theme";

/** How often an open chat asks for new messages (the site's pace). */
export const CHAT_POLL_MS = 10_000;
const MESSAGE_MAX = 2000;

/**
 * The group chat on the student's side, in the app (A-213): the same thread
 * the teacher sees on the group's page and students see on their personal
 * page or in Telegram. Opening it reads it.
 */
export function ChatScreen() {
  const { token } = useLocalSearchParams<{ token: string }>();
  const t = useTranslations();
  const portal = usePortal(token);
  const query = usePortalChat(token);
  const header = (
    <Header back title={t("portal.tabs.chat")} subtitle={portal.data?.portal.group.name} />
  );
  if (query.isLoading) {
    return (
      <Screen header={header} scroll={false}>
        <Loading />
      </Screen>
    );
  }
  if (!query.data) {
    return (
      <Screen header={header}>
        <EmptyState
          title={errorText(t, query.error)}
          action={
            <Button variant="outline" label={t("mobile.retry")} onPress={() => query.refetch()} />
          }
        />
      </Screen>
    );
  }
  return <Thread token={token} initial={query.data} header={header} />;
}

function Thread({
  token,
  initial,
  header,
}: {
  token: string;
  initial: PortalChat;
  header: React.ReactNode;
}) {
  const t = useTranslations();
  const { colors } = useTheme();
  const { wide } = useLayout();
  const insets = useSafeAreaInsets();
  const client = useQueryClient();
  const [messages, setMessages] = useState(initial.messages);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const list = useRef<FlatList<ChatMessage>>(null);
  const lastId = messages.length > 0 ? messages[messages.length - 1]!.id : null;

  const append = useCallback((rows: ChatMessage[]) => {
    if (rows.length === 0) return;
    setMessages((prev) => {
      const seen = new Set(prev.map((m) => m.id));
      const fresh = rows.filter((m) => !seen.has(m.id));
      return fresh.length > 0 ? [...prev, ...fresh] : prev;
    });
  }, []);

  // Reading the chat clears the count on the group's page too.
  const read = useCallback(() => {
    void markChatRead(token)
      .then(() =>
        client.setQueryData<PortalChat>(portalKeys.chat(token), (old) =>
          old ? { ...old, unread: 0 } : old,
        ),
      )
      .catch(() => undefined);
  }, [client, token]);

  useEffect(() => {
    read();
  }, [read]);

  useEffect(() => {
    const timer = setInterval(() => {
      (lastId ? fetchChatAfter(token, lastId) : fetchChat(token))
        .then((next) => {
          if (next.messages.length > 0) {
            append(next.messages);
            read();
          }
        })
        .catch(() => undefined);
    }, CHAT_POLL_MS);
    return () => clearInterval(timer);
  }, [lastId, token, append, read]);

  // What was written here is there when the chat is opened again.
  useEffect(() => {
    client.setQueryData<PortalChat>(portalKeys.chat(token), (old) =>
      old ? { ...old, messages } : old,
    );
  }, [client, token, messages]);

  const send = () => {
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    setProblem(null);
    sendChatMessage(token, text)
      .then((created) => {
        append([created]);
        setDraft("");
      })
      .catch((error: unknown) => setProblem(errorText(t, error)))
      .finally(() => setBusy(false));
  };

  const pad = wide ? space[8] : space[4];
  const ready = draft.trim().length > 0 && !busy;
  return (
    <View style={[styles.page, { backgroundColor: colors.background }]} testID="chat-screen">
      {header}
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <FlatList
          ref={list}
          data={messages}
          keyExtractor={(m) => m.id}
          renderItem={({ item }) => <Bubble message={item} />}
          onContentSizeChange={() => list.current?.scrollToEnd({ animated: false })}
          keyboardShouldPersistTaps="handled"
          style={styles.fill}
          contentContainerStyle={[styles.thread, { paddingHorizontal: pad }]}
          ListHeaderComponent={
            initial.teachers.length > 0 ? (
              <Text
                variant="small"
                tone="mutedForeground"
                style={styles.teachers}
                testID="chat-teachers"
              >
                {t("portal.chat.teachers", { names: initial.teachers.join(", ") })}
              </Text>
            ) : undefined
          }
          ListEmptyComponent={
            <Text tone="mutedForeground" style={styles.empty} testID="chat-empty">
              {t("portal.chat.empty")}
            </Text>
          }
          testID="chat-messages"
        />
        <View
          style={[
            styles.bar,
            {
              backgroundColor: colors.card,
              borderTopColor: colors.border,
              paddingHorizontal: pad,
              paddingBottom: space[2] + insets.bottom,
            },
          ]}
        >
          <View style={styles.column}>
            {problem ? (
              <Text variant="small" tone="destructive" accessibilityRole="alert">
                {problem}
              </Text>
            ) : null}
            <View style={styles.inputRow}>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder={t("portal.chat.placeholder")}
                placeholderTextColor={colors.mutedForeground}
                accessibilityLabel={t("portal.chat.placeholder")}
                multiline
                maxLength={MESSAGE_MAX}
                style={[
                  styles.input,
                  {
                    color: colors.foreground,
                    backgroundColor: colors.background,
                    borderColor: colors.input,
                  },
                ]}
                testID="chat-input"
              />
              <Pressable
                onPress={send}
                disabled={!ready}
                accessibilityRole="button"
                accessibilityLabel={busy ? t("portal.chat.sending") : t("portal.chat.send")}
                accessibilityState={{ disabled: !ready, busy }}
                style={[
                  styles.send,
                  { backgroundColor: ready ? colors.primary : colors.secondary },
                ]}
                testID="chat-send"
              >
                <Send size={20} color={ready ? colors.primaryForeground : colors.mutedForeground} />
              </Pressable>
            </View>
          </View>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

function Bubble({ message }: { message: ChatMessage }) {
  const t = useTranslations("portal.chat");
  const { colors } = useTheme();
  const formatDate = useDate();
  const staff = message.author.kind === "STAFF";
  const ink = message.mine ? colors.primaryForeground : colors.foreground;
  return (
    <View
      style={[styles.line, message.mine ? styles.mine : styles.theirs]}
      testID={message.mine ? "chat-message-mine" : "chat-message"}
    >
      <View
        style={[
          styles.bubble,
          message.mine
            ? [styles.bubbleMine, { backgroundColor: colors.primary, borderColor: colors.primary }]
            : [
                styles.bubbleTheirs,
                {
                  backgroundColor: staff ? colors.card : colors.secondary,
                  borderColor: staff ? colors.border : colors.secondary,
                },
              ],
        ]}
      >
        <Text
          variant="small"
          style={{ color: message.mine ? colors.primaryForeground : colors.mutedForeground }}
        >
          <Text variant="smallStrong" style={{ color: ink }}>
            {message.mine ? t("you") : message.author.name}
          </Text>
          {"  "}
          {formatDate(new Date(message.at), { dateStyle: "medium", timeStyle: "short" })}
          {message.source === "TELEGRAM" ? `, ${t("viaTelegram")}` : ""}
        </Text>
        <Text style={{ color: ink }}>{message.text}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  fill: { flex: 1 },
  thread: {
    flexGrow: 1,
    width: "100%",
    maxWidth: CONTENT_MAX_WIDTH,
    alignSelf: "center",
    paddingVertical: space[4],
    gap: space[2],
  },
  teachers: { marginBottom: space[2] },
  empty: { textAlign: "center", paddingVertical: space[8] },
  line: { flexDirection: "row" },
  mine: { justifyContent: "flex-end" },
  theirs: { justifyContent: "flex-start" },
  bubble: {
    maxWidth: "85%",
    borderWidth: 1,
    borderRadius: radius.lg,
    paddingHorizontal: space[3],
    paddingVertical: space[2],
    gap: 2,
  },
  bubbleMine: { borderBottomRightRadius: radius.sm },
  bubbleTheirs: { borderBottomLeftRadius: radius.sm },
  bar: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: space[2] },
  column: { width: "100%", maxWidth: CONTENT_MAX_WIDTH, alignSelf: "center", gap: space[1] },
  inputRow: { flexDirection: "row", alignItems: "flex-end", gap: space[2] },
  input: {
    flex: 1,
    minHeight: 44,
    maxHeight: 120,
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space[3],
    paddingVertical: space[2],
    fontFamily: font.regular,
    fontSize: 15,
    lineHeight: 22,
  },
  send: {
    width: 44,
    height: 44,
    borderRadius: radius.md,
    alignItems: "center",
    justifyContent: "center",
  },
});
