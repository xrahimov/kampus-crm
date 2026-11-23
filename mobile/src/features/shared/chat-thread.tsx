import { Send } from "lucide-react-native";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
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

import type { ChatMessage, GroupChat } from "@/api/types";
import { Text } from "@/components/text";
import { errorText, useDate, useTranslations } from "@/lib/i18n";
import { useLayout } from "@/lib/layout";
import { CONTENT_MAX_WIDTH, font, radius, space, useTheme } from "@/lib/theme";

/** How often an open chat asks for new messages (the site's pace). */
export const CHAT_POLL_MS = 10_000;
const MESSAGE_MAX = 2000;

/**
 * A group's chat as a thread of bubbles with a box to write in, shared by the
 * student's page (A-213) and the teacher's (A-214). `load` fetches messages
 * newer than the last one shown (everything when `after` is null), `send`
 * posts one, and `markRead` is called when the thread opens and whenever new
 * messages arrive while it is open. `onMessages` hears every change, so the
 * caller can keep its own copy.
 */
export function ChatThread({
  header,
  initial,
  note,
  emptyText,
  placeholder,
  load,
  send,
  markRead,
  onMessages,
}: {
  header: ReactNode;
  initial: ChatMessage[];
  /** A line above the first message: who the teachers are. */
  note?: string;
  emptyText: string;
  /** What the empty box says; the student's wording when left out. */
  placeholder?: string;
  load: (after: string | null) => Promise<GroupChat>;
  send: (text: string) => Promise<ChatMessage>;
  markRead: () => void;
  onMessages?: (messages: ChatMessage[]) => void;
}) {
  const t = useTranslations();
  const { colors } = useTheme();
  const { wide } = useLayout();
  const insets = useSafeAreaInsets();
  const [messages, setMessages] = useState(initial);
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

  useEffect(() => {
    markRead();
  }, [markRead]);

  useEffect(() => {
    const timer = setInterval(() => {
      load(lastId)
        .then((next) => {
          if (next.messages.length > 0) {
            append(next.messages);
            markRead();
          }
        })
        .catch(() => undefined);
    }, CHAT_POLL_MS);
    return () => clearInterval(timer);
  }, [lastId, load, append, markRead]);

  useEffect(() => {
    onMessages?.(messages);
  }, [onMessages, messages]);

  const submit = () => {
    const text = draft.trim();
    if (!text || busy) return;
    setBusy(true);
    setProblem(null);
    send(text)
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
            note ? (
              <Text
                variant="small"
                tone="mutedForeground"
                style={styles.teachers}
                testID="chat-teachers"
              >
                {note}
              </Text>
            ) : undefined
          }
          ListEmptyComponent={
            <Text tone="mutedForeground" style={styles.empty} testID="chat-empty">
              {emptyText}
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
                placeholder={placeholder ?? t("portal.chat.placeholder")}
                placeholderTextColor={colors.mutedForeground}
                accessibilityLabel={placeholder ?? t("portal.chat.placeholder")}
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
                onPress={submit}
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
