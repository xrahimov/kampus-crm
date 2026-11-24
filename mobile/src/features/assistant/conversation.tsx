import { Send } from "lucide-react-native";
import { useState } from "react";
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from "react-native";

import { ASSISTANT_SUGGESTIONS, type AssistantAudience } from "@/api/office-assistant";
import { Button } from "@/components/button";
import { Notice } from "@/components/surface";
import { Text } from "@/components/text";
import { errorText, useLocaleChoice, useTranslations } from "@/lib/i18n";
import { font, radius, space, useTheme } from "@/lib/theme";

import { useAssistantChat } from "./assistant-store";

/** The server takes a turn of up to this many letters. */
const QUESTION_MAX = 4000;

/**
 * The conversation with the assistant (A-253): the turns and, while there are
 * none, a few questions to start from, as on the site. An answer can be
 * selected to copy, because a drafted SMS is of use only somewhere else.
 */
export function Conversation({
  userId,
  audience,
}: {
  userId: string;
  audience: AssistantAudience;
}) {
  const t = useTranslations();
  const ta = useTranslations("assistant");
  const { locale } = useLocaleChoice();
  const { colors } = useTheme();
  const { turns, busy, error, send } = useAssistantChat(userId);
  return (
    <View style={styles.thread} testID="assistant-messages">
      {turns.length === 0 ? (
        <View style={styles.empty}>
          <Text tone="mutedForeground" style={styles.center}>
            {ta("empty")}
          </Text>
          <View style={styles.suggestions}>
            {ASSISTANT_SUGGESTIONS[audience].map((key) => (
              <Pressable
                key={key}
                onPress={() => void send(ta(`suggestions.${key}`), locale)}
                disabled={busy}
                accessibilityRole="button"
                style={({ pressed }) => [
                  styles.suggestion,
                  {
                    borderColor: colors.input,
                    backgroundColor: pressed ? colors.muted : colors.card,
                  },
                ]}
                testID={`assistant-suggestion-${key}`}
              >
                <Text variant="small">{ta(`suggestions.${key}`)}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}
      {turns.map((turn, index) => {
        const mine = turn.role === "user";
        return (
          <View
            key={index}
            style={[styles.line, mine ? styles.mine : styles.theirs]}
            testID={`assistant-message-${turn.role}`}
          >
            <View
              style={[
                styles.bubble,
                mine ? styles.bubbleMine : styles.bubbleTheirs,
                { backgroundColor: mine ? colors.primary : colors.muted },
              ]}
            >
              <Text selectable tone={mine ? "primaryForeground" : "foreground"}>
                {turn.content}
              </Text>
              {turn.tools && turn.tools.length > 0 ? (
                <Text variant="small" tone="mutedForeground" testID="assistant-tools">
                  {ta("usedTools", { tools: turn.tools.join(", ") })}
                </Text>
              ) : null}
            </View>
          </View>
        );
      })}
      {busy ? (
        <View style={styles.thinking} testID="assistant-thinking">
          <ActivityIndicator size="small" color={colors.mutedForeground} />
          <Text variant="small" tone="mutedForeground">
            {ta("thinking")}
          </Text>
        </View>
      ) : null}
      {error ? (
        <Notice tone="destructive" testID="assistant-problem">
          {errorText(t, error)}
        </Notice>
      ) : null}
    </View>
  );
}

/** The box to ask in, under the conversation. */
export function QuestionBar({ userId }: { userId: string }) {
  const ta = useTranslations("assistant");
  const { locale } = useLocaleChoice();
  const { colors } = useTheme();
  const { busy, send } = useAssistantChat(userId);
  const [draft, setDraft] = useState("");
  const ready = draft.trim().length > 0 && !busy;
  const submit = () => {
    if (!ready) return;
    const question = draft;
    setDraft("");
    void send(question, locale);
  };
  return (
    <View style={styles.inputRow}>
      <TextInput
        value={draft}
        onChangeText={setDraft}
        placeholder={ta("placeholder")}
        placeholderTextColor={colors.mutedForeground}
        accessibilityLabel={ta("placeholder")}
        multiline
        maxLength={QUESTION_MAX}
        style={[
          styles.input,
          { color: colors.foreground, backgroundColor: colors.card, borderColor: colors.input },
        ]}
        testID="assistant-input"
      />
      <Button
        label={ta("send")}
        icon={<Send size={18} color={colors.primaryForeground} />}
        loading={busy}
        disabled={!ready}
        onPress={submit}
        testID="assistant-send"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  thread: { gap: space[3] },
  empty: { gap: space[3], paddingVertical: space[5] },
  center: { textAlign: "center" },
  suggestions: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", gap: space[2] },
  suggestion: {
    borderWidth: 1,
    borderRadius: radius.md,
    paddingHorizontal: space[3],
    paddingVertical: space[2],
    maxWidth: "100%",
  },
  line: { flexDirection: "row" },
  mine: { justifyContent: "flex-end" },
  theirs: { justifyContent: "flex-start" },
  bubble: {
    maxWidth: "88%",
    borderRadius: radius.lg,
    paddingHorizontal: space[3],
    paddingVertical: space[2],
    gap: space[1],
  },
  bubbleMine: { borderBottomRightRadius: radius.sm },
  bubbleTheirs: { borderBottomLeftRadius: radius.sm },
  thinking: { flexDirection: "row", alignItems: "center", gap: space[2] },
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
});
