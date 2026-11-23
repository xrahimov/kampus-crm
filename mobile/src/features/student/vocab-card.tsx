import { Check, Flame, RotateCcw, Sparkles } from "lucide-react-native";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { reviewWord } from "@/api/portal";
import type { PortalVocab, VocabCard as Word } from "@/api/types";
import { Button } from "@/components/button";
import { Card } from "@/components/surface";
import { Text } from "@/components/text";
import { errorText, useTranslations } from "@/lib/i18n";
import { radius, space, useTheme } from "@/lib/theme";

/**
 * Flashcards on the student's Course page (A-215): the figures, then a run
 * through the cards that are due. A card shows the word; a tap turns it;
 * **I knew it** sends it further away, **Again** brings it back at the end of
 * this run. The server keeps the boxes and the streak.
 */
export function VocabCard({
  token,
  vocab,
  onChange,
}: {
  token: string;
  vocab: PortalVocab;
  onChange: (next: PortalVocab) => void;
}) {
  const t = useTranslations("portal.vocab");
  const ta = useTranslations();
  const { colors } = useTheme();
  const [queue, setQueue] = useState<Word[] | null>(null);
  const [turned, setTurned] = useState(false);
  const [right, setRight] = useState(0);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  if (vocab.total === 0) return null;
  const current = queue?.[0] ?? null;
  const toPractise = Math.min(vocab.due, vocab.cards.length);

  const start = () => {
    setQueue(vocab.cards);
    setRight(0);
    setTurned(false);
    setProblem(null);
  };
  const answer = (known: boolean) => {
    if (!current || busy) return;
    setBusy(true);
    setProblem(null);
    reviewWord(token, current.id, known)
      .then((next) => {
        onChange(next);
        // A missed word comes round again at the end of this run.
        setQueue((q) => (q ? (known ? q.slice(1) : [...q.slice(1), q[0]!]) : q));
        if (known) setRight((n) => n + 1);
        setTurned(false);
      })
      .catch((error: unknown) => setProblem(errorText(ta, error)))
      .finally(() => setBusy(false));
  };

  return (
    <Card testID="vocab">
      <Text variant="heading">{t("title")}</Text>
      <View style={styles.figures}>
        <Text variant="small" tone="mutedForeground" testID="vocab-learned">
          {t("learned", { learned: vocab.learned, total: vocab.total })}
        </Text>
        <Text variant="small" tone="mutedForeground" testID="vocab-due">
          {t("due", { count: vocab.due })}
        </Text>
        <View style={styles.streak}>
          <Flame size={14} color={colors.warning} />
          <Text variant="small" tone="mutedForeground" testID="vocab-streak">
            {t("streak", { count: vocab.streak })}
          </Text>
        </View>
      </View>

      {queue === null ? (
        vocab.due > 0 ? (
          <Button
            label={t("start", { count: toPractise })}
            icon={<Sparkles size={18} color={colors.primaryForeground} />}
            onPress={start}
            style={styles.start}
            testID="vocab-start"
          />
        ) : (
          <Text variant="small" tone="mutedForeground" testID="vocab-nothing-due">
            {t("nothingDue")}
          </Text>
        )
      ) : current ? (
        <View style={styles.run} testID="vocab-run">
          <Text variant="small" tone="mutedForeground">
            {t("progress", { done: right, total: right + queue.length })}, {current.topicTitle}
          </Text>
          <Pressable
            onPress={() => setTurned(true)}
            accessibilityRole="button"
            accessibilityLabel={turned ? current.translation : `${current.term}. ${t("tapToFlip")}`}
            style={[styles.card, { borderColor: colors.input, backgroundColor: colors.muted }]}
            testID="vocab-flip"
          >
            <Text variant="title" style={styles.center} testID="vocab-term">
              {current.term}
            </Text>
            {turned ? (
              <View style={styles.back} testID="vocab-translation">
                <Text style={styles.center}>{current.translation}</Text>
                {current.example ? (
                  <Text variant="small" tone="mutedForeground" style={styles.center}>
                    {current.example}
                  </Text>
                ) : null}
              </View>
            ) : (
              <Text variant="small" tone="mutedForeground" style={styles.center}>
                {t("tapToFlip")}
              </Text>
            )}
          </Pressable>
          {turned ? (
            <View style={styles.answers}>
              <Button
                variant="outline"
                label={t("again")}
                icon={<RotateCcw size={18} color={colors.foreground} />}
                disabled={busy}
                onPress={() => answer(false)}
                style={styles.fill}
                testID="vocab-again"
              />
              <Button
                label={t("known")}
                icon={<Check size={18} color={colors.primaryForeground} />}
                disabled={busy}
                onPress={() => answer(true)}
                style={styles.fill}
                testID="vocab-known"
              />
            </View>
          ) : null}
          {problem ? (
            <Text variant="small" tone="destructive" accessibilityRole="alert">
              {problem}
            </Text>
          ) : null}
        </View>
      ) : (
        <View style={styles.run} testID="vocab-done">
          <Text variant="bodyStrong">{t("finished", { count: right })}</Text>
          {vocab.due > 0 ? (
            <Button
              variant="outline"
              label={t("start", { count: toPractise })}
              onPress={start}
              style={styles.start}
              testID="vocab-start"
            />
          ) : (
            <Text variant="small" tone="mutedForeground">
              {t("nothingDue")}
            </Text>
          )}
        </View>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  center: { textAlign: "center" },
  start: { alignSelf: "flex-start" },
  figures: { flexDirection: "row", flexWrap: "wrap", columnGap: space[4], rowGap: space[1] },
  streak: { flexDirection: "row", alignItems: "center", gap: space[1] },
  run: { gap: space[3] },
  card: {
    minHeight: 148,
    justifyContent: "center",
    gap: space[2],
    paddingHorizontal: space[4],
    paddingVertical: space[6],
    borderWidth: 1,
    borderRadius: radius.lg,
  },
  back: { gap: space[1] },
  answers: { flexDirection: "row", gap: space[2] },
});
