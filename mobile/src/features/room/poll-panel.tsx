import { Check, Plus, Trash2, X } from "lucide-react-native";
import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, View } from "react-native";

import { Text } from "@/components/text";
import { useTranslations } from "@/lib/i18n";
import { radius, space } from "@/lib/theme";
import {
  POLL_MAX_OPTIONS,
  POLL_MIN_OPTIONS,
  POLL_OPTION_MAX,
  POLL_QUESTION_MAX,
} from "@kampus/lib/validation/video";
import type { CallEngine } from "@kampus/lib/video/call-engine";
import type { PollDto } from "@kampus/lib/video/dto";

import { room } from "./look";
import { PanelButton, PanelInput } from "./panel-parts";

/*
 * Polls in the lesson room, in the app (A-153, A-211). The teacher writes a
 * question with two to six answers and watches the answers come in; students
 * tap one; when the teacher closes it everyone sees the result. The same poll
 * as on the site: the engine carries it.
 */

/** The teacher's panel: the form, then the answers as they come in. */
export function PollPanel({ engine }: { engine: CallEngine }) {
  const t = useTranslations("video.poll");
  const poll = engine.poll;
  const [composing, setComposing] = useState(false);

  if (composing || !poll) {
    return (
      <PollForm
        onAsk={(question, options) => {
          engine.openPoll(question, options);
          setComposing(false);
        }}
        onCancel={poll ? () => setComposing(false) : undefined}
      />
    );
  }
  return (
    <ScrollView
      contentContainerStyle={styles.body}
      keyboardShouldPersistTaps="handled"
      testID="poll-panel"
    >
      <PollResults poll={poll} />
      {poll.voters && poll.voters.length > 0 ? (
        <View style={styles.voters} testID="poll-voters">
          {poll.options.map((option, index) => {
            const names = poll.voters?.filter((v) => v.option === index).map((v) => v.name) ?? [];
            if (names.length === 0) return null;
            return (
              <Text key={`${index}-${option}`} variant="small" style={styles.muted}>
                <Text variant="smallStrong" style={styles.ink}>
                  {option}:
                </Text>{" "}
                {names.join(", ")}
              </Text>
            );
          })}
        </View>
      ) : null}
      {poll.open ? (
        <PanelButton
          label={t("close")}
          tone="main"
          disabled={engine.pollPending}
          onPress={() => engine.closePoll()}
          testID="poll-close"
        />
      ) : null}
      <PanelButton label={t("new")} onPress={() => setComposing(true)} testID="poll-new" />
    </ScrollView>
  );
}

/** The question, each answer with its bar and count, and how many answered. */
function PollResults({ poll }: { poll: PollDto }) {
  const t = useTranslations("video.poll");
  const max = Math.max(1, ...(poll.counts ?? [0]));
  return (
    <View style={styles.results}>
      <View>
        <Text variant="small" style={styles.muted}>
          {poll.open ? t("open") : t("closed")}
        </Text>
        <Text variant="bodyStrong" style={styles.ink} testID="poll-question">
          {poll.question}
        </Text>
      </View>
      {poll.options.map((option, index) => {
        const count = poll.counts?.[index] ?? 0;
        const mine = poll.myVote === index;
        return (
          <View
            key={`${index}-${option}`}
            style={[styles.result, mine && styles.resultMine]}
            testID={`poll-result-${index}`}
          >
            {poll.counts ? (
              <View style={[styles.bar, { width: `${(count / max) * 100}%` }]} />
            ) : null}
            {mine ? (
              <Check size={14} color={room.ink} accessibilityLabel={t("yourAnswer")} />
            ) : null}
            <Text variant="small" style={[styles.ink, styles.fill]}>
              {option}
            </Text>
            {poll.counts ? (
              <Text variant="smallStrong" style={styles.ink}>
                {count}
              </Text>
            ) : null}
          </View>
        );
      })}
      <Text variant="small" style={styles.muted} testID="poll-total">
        {t("answers", { count: poll.total })}
      </Text>
    </View>
  );
}

function PollForm({
  onAsk,
  onCancel,
}: {
  onAsk: (question: string, options: string[]) => void;
  onCancel?: () => void;
}) {
  const t = useTranslations("video.poll");
  const [question, setQuestion] = useState("");
  const [options, setOptions] = useState<string[]>(["", ""]);
  const filled = options.map((o) => o.trim()).filter(Boolean);
  const ready = question.trim().length > 0 && filled.length >= POLL_MIN_OPTIONS;

  return (
    <ScrollView
      contentContainerStyle={styles.body}
      keyboardShouldPersistTaps="handled"
      testID="poll-form"
    >
      <View style={styles.field}>
        <Text variant="small" style={styles.muted}>
          {t("question")}
        </Text>
        <PanelInput
          value={question}
          onChangeText={setQuestion}
          maxLength={POLL_QUESTION_MAX}
          multiline
          accessibilityLabel={t("question")}
          testID="poll-question-input"
        />
      </View>
      <View style={styles.field}>
        <Text variant="small" style={styles.muted}>
          {t("options")}
        </Text>
        {options.map((option, index) => (
          // The answers have no identity but their place while they are being typed.
          <View key={index} style={styles.optionRow}>
            <PanelInput
              value={option}
              onChangeText={(text) =>
                setOptions((cur) => cur.map((o, j) => (j === index ? text : o)))
              }
              maxLength={POLL_OPTION_MAX}
              placeholder={t("option", { number: index + 1 })}
              accessibilityLabel={t("option", { number: index + 1 })}
              style={styles.fill}
              testID={`poll-option-input-${index}`}
            />
            {options.length > POLL_MIN_OPTIONS ? (
              <Pressable
                onPress={() => setOptions((cur) => cur.filter((_, j) => j !== index))}
                accessibilityRole="button"
                accessibilityLabel={t("removeOption", { number: index + 1 })}
                hitSlop={6}
                style={({ pressed }) => [styles.remove, pressed && styles.pressed]}
                testID={`poll-remove-option-${index}`}
              >
                <Trash2 size={18} color={room.ink} />
              </Pressable>
            ) : null}
          </View>
        ))}
        {options.length < POLL_MAX_OPTIONS ? (
          <PanelButton
            label={t("addOption")}
            icon={<Plus size={16} color={room.ink} />}
            onPress={() => setOptions((cur) => [...cur, ""])}
            testID="poll-add-option"
          />
        ) : null}
      </View>
      <PanelButton
        label={t("ask")}
        tone="main"
        disabled={!ready}
        onPress={() => onAsk(question.trim(), filled)}
        testID="poll-ask"
      />
      {onCancel ? (
        <PanelButton label={t("cancel")} onPress={onCancel} testID="poll-cancel" />
      ) : null}
    </ScrollView>
  );
}

/**
 * What a student sees of a poll, above the pictures: the answers to tap while
 * it is open, then the result once the teacher closed it, until they put it
 * away.
 */
export function PollCard({ engine }: { engine: CallEngine }) {
  const t = useTranslations("video.poll");
  const tr = useTranslations("video.room");
  const poll = engine.poll;
  if (!poll) return null;
  if (!poll.open) {
    if (!engine.pollUnseen) return null;
    return (
      <View style={styles.card} testID="poll-result-card">
        <View style={styles.cardClose}>
          <Pressable
            onPress={() => engine.markPollSeen()}
            accessibilityRole="button"
            accessibilityLabel={tr("dismiss")}
            hitSlop={8}
            testID="poll-result-close"
          >
            <X size={18} color={room.ink} />
          </Pressable>
        </View>
        <PollResults poll={poll} />
      </View>
    );
  }
  return (
    <View style={styles.card} testID="poll-card">
      <Text variant="bodyStrong" style={styles.ink}>
        {poll.question}
      </Text>
      <View style={styles.choices}>
        {poll.options.map((option, index) => {
          const chosen = poll.myVote === index;
          return (
            <Pressable
              key={`${index}-${option}`}
              accessibilityRole="button"
              accessibilityState={{ selected: chosen }}
              onPress={() => engine.votePoll(index)}
              style={[styles.choice, chosen && styles.choiceChosen]}
              testID={`poll-option-${index}`}
            >
              <Text variant="smallStrong" style={chosen ? styles.activeInk : styles.ink}>
                {option}
              </Text>
            </Pressable>
          );
        })}
      </View>
      <Text variant="small" style={styles.muted} testID="poll-hint">
        {poll.myVote === null ? t("tapToAnswer") : t("canChange")}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  ink: { color: room.ink },
  activeInk: { color: room.activeInk },
  muted: { color: room.inkMuted },
  pressed: { opacity: 0.75 },
  body: { padding: space[4], gap: space[3] },
  field: { gap: space[2] },
  optionRow: { flexDirection: "row", alignItems: "center", gap: space[2] },
  remove: {
    width: 44,
    height: 44,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md,
    backgroundColor: room.surfaceRaised,
  },
  results: { gap: space[2] },
  result: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    paddingHorizontal: space[3],
    paddingVertical: space[2],
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: room.border,
    overflow: "hidden",
  },
  resultMine: { borderColor: room.active },
  bar: {
    position: "absolute",
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: "rgba(88, 212, 208, 0.3)",
  },
  voters: { gap: space[1] },
  card: {
    padding: space[3],
    gap: space[2],
    borderRadius: radius.md,
    backgroundColor: room.surface,
    borderWidth: 1,
    borderColor: room.active,
    marginBottom: space[1],
  },
  cardClose: { position: "absolute", right: space[2], top: space[2], zIndex: 1 },
  choices: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  choice: {
    minHeight: 40,
    justifyContent: "center",
    paddingHorizontal: space[3],
    borderRadius: radius.full,
    backgroundColor: room.surfaceRaised,
  },
  choiceChosen: { backgroundColor: room.active },
});
