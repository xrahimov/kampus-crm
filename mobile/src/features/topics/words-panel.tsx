import { parseWordLines, VOCAB_WORDS_MAX, wordLines } from "@kampus/lib/validation/vocab";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { useSaveTopicWords, useTopicWords, type TopicWords } from "@/api/topic-content";
import { Button } from "@/components/button";
import { Field } from "@/components/field";
import { Card, Divider, Notice } from "@/components/surface";
import { Text } from "@/components/text";
import { errorText, useTranslations } from "@/lib/i18n";
import { space } from "@/lib/theme";

/**
 * A topic's word list for the vocabulary trainer (A-165, in the app A-263):
 * one "term — translation — example" per line, read by the site's own rule.
 * Someone who may not change the content reads the words.
 */
export function WordsPanel({ topicId }: { topicId: string }) {
  const words = useTopicWords(topicId);
  if (!words.data) return null;
  return <Words topicId={topicId} data={words.data} />;
}

function Words({ topicId, data }: { topicId: string; data: TopicWords }) {
  const t = useTranslations();
  const tv = useTranslations("vocab.editor");
  const save = useSaveTopicWords(topicId);
  const [text, setText] = useState(() => wordLines(data.words));
  const [saved, setSaved] = useState(false);
  const parsed = parseWordLines(text);
  const bad = parsed.filter((word) => !word.term || !word.translation).length;
  const tooMany = parsed.length > VOCAB_WORDS_MAX;

  return (
    <Card style={styles.card} testID="words-panel">
      <View style={styles.head}>
        <Text variant="heading" style={styles.fill}>
          {tv("title")}
        </Text>
        <Text variant="small" tone="mutedForeground" testID="words-count">
          {tv("count", { count: data.words.length })}
        </Text>
      </View>
      {data.canEdit ? (
        <>
          <Field
            label={tv("title")}
            hint={tv("hint")}
            value={text}
            onChangeText={(next) => {
              setText(next);
              setSaved(false);
            }}
            multiline
            autoCapitalize="none"
            autoCorrect={false}
            placeholder={tv("placeholder")}
            style={styles.text}
            testID="words-text"
          />
          <Text
            variant="small"
            tone={bad > 0 || tooMany ? "destructive" : "mutedForeground"}
            testID="words-parsed"
          >
            {bad > 0
              ? tv("badLines", { count: bad })
              : tv("parsed", { count: parsed.length, max: VOCAB_WORDS_MAX })}
          </Text>
          {save.error ? (
            <Notice tone="destructive" testID="words-problem">
              {errorText(t, save.error)}
            </Notice>
          ) : null}
          {saved ? (
            <Notice tone="success" testID="words-saved">
              {t("common.saved")}
            </Notice>
          ) : null}
          <Button
            variant="outline"
            label={tv("save")}
            disabled={bad > 0 || tooMany}
            loading={save.isPending}
            onPress={() =>
              save.mutate(parsed, {
                onSuccess: (next) => {
                  // The words as the server keeps them: trimmed, with one kind of dash.
                  setText(wordLines(next.words));
                  setSaved(true);
                },
              })
            }
            style={styles.start}
            testID="words-save"
          />
        </>
      ) : data.words.length > 0 ? (
        data.words.map((word, index) => (
          <View key={word.id} style={styles.word} testID={`word-${word.id}`}>
            {index > 0 ? <Divider /> : null}
            <Text>
              <Text variant="bodyStrong">{word.term}</Text> — {word.translation}
            </Text>
            {word.example ? (
              <Text variant="small" tone="mutedForeground">
                {word.example}
              </Text>
            ) : null}
          </View>
        ))
      ) : (
        <Text tone="mutedForeground">{tv("empty")}</Text>
      )}
    </Card>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  card: { gap: space[3] },
  head: { flexDirection: "row", alignItems: "baseline", gap: space[2] },
  text: { minHeight: 144, textAlignVertical: "top" },
  start: { alignSelf: "flex-start" },
  word: { gap: space[1] },
});
