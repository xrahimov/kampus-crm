import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowDown, ArrowUp, Check, X } from "lucide-react-native";
import { useState } from "react";
import { Pressable, StyleSheet, TextInput, View } from "react-native";

import { checkExercise, usePortalExercise } from "@/api/portal";
import type {
  ExerciseAnswer,
  PortalExercise,
  PortalExerciseItem,
  PortalExerciseResult,
} from "@/api/types";
import { Button } from "@/components/button";
import { Header } from "@/components/header";
import { Card, EmptyState, Loading, Notice, Screen } from "@/components/surface";
import { Text } from "@/components/text";
import { errorText, useTranslations } from "@/lib/i18n";
import { font, radius, space, useTheme } from "@/lib/theme";
import { GAP_MARK } from "@kampus/lib/validation/exercises";

import { Options, WordChip } from "./answer-parts";

type Answers = Record<string, ExerciseAnswer>;

/** The address of an exercise's screen, for `router.push`. */
export function exerciseRoute(token: string, exercise: { id: string; title: string }) {
  return {
    pathname: "/student/exercise/[token]" as const,
    params: { token, exercise: exercise.id, title: exercise.title },
  };
}

/** A piece's answers as they start: pieces to put in order start in the order given. */
function startingAnswers(exercise: PortalExercise): Answers {
  const answers: Answers = {};
  exercise.items.forEach((item, index) => {
    if (item.kind === "ORDER") answers[String(index)] = item.pieces;
  });
  return answers;
}

/**
 * One self-check exercise, done inside the app (A-213): the six kinds of item
 * the site has, checked by the server at once, with the right answers shown
 * for what went wrong. A student may try as often as they like; the best go
 * is kept.
 */
export function ExerciseScreen() {
  const { token, exercise, title } = useLocalSearchParams<{
    token: string;
    exercise: string;
    title?: string;
  }>();
  const t = useTranslations();
  const query = usePortalExercise(token, exercise);
  const header = <Header back title={query.data?.title ?? title ?? t("exercises.heading")} />;
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
  return <Run token={token} exercise={query.data} />;
}

function Run({ token, exercise }: { token: string; exercise: PortalExercise }) {
  const t = useTranslations();
  const te = useTranslations("portal.exercises");
  const router = useRouter();
  const client = useQueryClient();
  const [answers, setAnswers] = useState<Answers>(() => startingAnswers(exercise));
  const [result, setResult] = useState<PortalExerciseResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const best = result?.best ?? exercise.best;

  const check = () => {
    setBusy(true);
    setProblem(null);
    checkExercise(token, exercise.id, answers)
      .then((outcome) => {
        setResult(outcome);
        // The homework page shows the best go beside the exercise.
        void client.invalidateQueries({ queryKey: ["student", "homework", token] });
      })
      .catch((error: unknown) => setProblem(errorText(t, error)))
      .finally(() => setBusy(false));
  };
  const again = () => {
    setResult(null);
    setAnswers(startingAnswers(exercise));
  };

  return (
    <Screen
      header={
        <Header
          back
          title={exercise.title}
          subtitle={[
            te("items", { count: exercise.itemCount }),
            best
              ? te("best", { score: best.score, max: best.maxScore, percent: best.percent })
              : "",
          ]
            .filter(Boolean)
            .join(", ")}
        />
      }
      footer={
        result ? (
          <View style={styles.wrapRow}>
            <Button label={te("close")} onPress={() => router.back()} testID="exercise-done" />
            <Button variant="outline" label={te("again")} onPress={again} testID="exercise-again" />
          </View>
        ) : (
          <Button
            label={te("check")}
            loading={busy}
            onPress={check}
            testID="exercise-check"
            style={styles.start}
          />
        )
      }
      contentStyle={styles.list}
    >
      {result ? (
        <Card testID="exercise-result">
          <Text variant="title" testID="exercise-score">
            {te("score", { score: result.score, max: result.maxScore, percent: result.percent })}
          </Text>
        </Card>
      ) : null}
      {exercise.items.map((item, index) => (
        <ItemCard
          key={index}
          index={index}
          item={item}
          value={answers[String(index)]}
          outcome={result?.items[index] ?? null}
          onChange={(value) => setAnswers((a) => ({ ...a, [String(index)]: value }))}
        />
      ))}
      {problem ? (
        <Notice tone="destructive" testID="exercise-problem">
          {problem}
        </Notice>
      ) : null}
    </Screen>
  );
}

function ItemCard({
  index,
  item,
  value,
  outcome,
  onChange,
}: {
  index: number;
  item: PortalExerciseItem;
  value: ExerciseAnswer | undefined;
  outcome: PortalExerciseResult["items"][number] | null;
  onChange: (value: ExerciseAnswer) => void;
}) {
  const t = useTranslations("portal.exercises");
  const { colors } = useTheme();
  return (
    <Card testID={`exercise-item-${index}`}>
      <View style={styles.head}>
        {outcome ? (
          // The mark is read out as a word; the drawing itself says nothing to a screen reader.
          <View
            accessible
            accessibilityLabel={outcome.correct ? t("right") : t("wrong")}
            testID={`exercise-${outcome.correct ? "right" : "wrong"}-${index}`}
          >
            {outcome.correct ? (
              <Check size={20} color={colors.success} />
            ) : (
              <X size={20} color={colors.destructive} />
            )}
          </View>
        ) : null}
        <Text variant="bodyStrong" style={styles.fill}>
          {index + 1}. {item.kind === "GAP" && !outcome ? "" : item.prompt}
        </Text>
      </View>
      {outcome ? (
        <>
          {!outcome.correct ? (
            <Text variant="small" tone="mutedForeground" testID={`exercise-key-${index}`}>
              {t("key")}: {outcome.key.join(", ")}
            </Text>
          ) : null}
          {outcome.max > 1 ? (
            <Text variant="small" tone="mutedForeground">
              {t("partial", { points: outcome.points, max: outcome.max })}
            </Text>
          ) : null}
        </>
      ) : (
        <ItemInput index={index} item={item} value={value} onChange={onChange} />
      )}
    </Card>
  );
}

function ItemInput({
  index,
  item,
  value,
  onChange,
}: {
  index: number;
  item: PortalExerciseItem;
  value: ExerciseAnswer | undefined;
  onChange: (value: ExerciseAnswer) => void;
}) {
  const t = useTranslations("portal.exercises");
  const { colors } = useTheme();
  const inputLook = {
    color: colors.foreground,
    backgroundColor: colors.card,
    borderColor: colors.input,
  };
  switch (item.kind) {
    case "CHOICE": {
      const chosen = Array.isArray(value) ? (value as number[]) : [];
      return (
        <Options
          options={item.options}
          chosen={chosen}
          multiple={item.multiple}
          onPress={(k) =>
            onChange(
              item.multiple
                ? chosen.includes(k)
                  ? chosen.filter((x) => x !== k)
                  : [...chosen, k].sort((a, b) => a - b)
                : [k],
            )
          }
          testID={`exercise-option-${index}`}
        />
      );
    }
    case "TRUE_FALSE":
      return (
        <Options
          options={[t("true"), t("false")]}
          chosen={typeof value === "boolean" ? [value ? 0 : 1] : []}
          onPress={(k) => onChange(k === 0)}
          testID={`exercise-option-${index}`}
        />
      );
    case "GAP": {
      const parts = item.prompt.split(GAP_MARK);
      const given = Array.isArray(value) ? (value as string[]) : [];
      const fill = (k: number, text: string) => {
        const next = Array.from({ length: item.gaps }, (_, z) => given[z] ?? "");
        next[k] = text;
        onChange(next);
      };
      return (
        // Words and gaps wrap like a sentence: each word is its own piece of the row.
        <View style={styles.sentence}>
          {parts.flatMap((part, k) => [
            ...part
              .split(/\s+/)
              .filter(Boolean)
              .map((word, w) => (
                <Text key={`${k}-${w}`} style={styles.word}>
                  {word}
                </Text>
              )),
            k < parts.length - 1 ? (
              <TextInput
                key={`gap-${k}`}
                value={given[k] ?? ""}
                onChangeText={(text) => fill(k, text)}
                accessibilityLabel={t("gap", { number: k + 1 })}
                autoCapitalize="none"
                autoCorrect={false}
                maxLength={120}
                style={[styles.gap, inputLook]}
                testID={`exercise-gap-${index}-${k}`}
              />
            ) : null,
          ])}
        </View>
      );
    }
    case "MATCH": {
      const given = Array.isArray(value) ? (value as string[]) : [];
      const pick = (k: number, right: string) => {
        const next = Array.from({ length: item.lefts.length }, (_, z) => given[z] ?? "");
        next[k] = next[k] === right ? "" : right;
        onChange(next);
      };
      return (
        <View style={styles.pairs}>
          {item.lefts.map((left, k) => (
            <View key={k} style={styles.pair}>
              <Text variant="bodyStrong">{left}</Text>
              <View style={styles.chips}>
                {item.rights.map((right, r) => (
                  <WordChip
                    key={right}
                    label={right}
                    chosen={given[k] === right}
                    onPress={() => pick(k, right)}
                    accessibilityLabel={`${t("matchFor", { left })}: ${right}`}
                    testID={`exercise-match-${index}-${k}-${r}`}
                  />
                ))}
              </View>
            </View>
          ))}
        </View>
      );
    }
    case "ORDER": {
      const order = Array.isArray(value) ? (value as string[]) : item.pieces;
      const move = (k: number, by: -1 | 1) => {
        const j = k + by;
        if (j < 0 || j >= order.length) return;
        const next = [...order];
        [next[k], next[j]] = [next[j]!, next[k]!];
        onChange(next);
      };
      return (
        <View style={styles.pairs} testID={`exercise-order-${index}`}>
          {order.map((piece, k) => (
            <View key={piece} style={[styles.piece, { borderColor: colors.input }]}>
              <Text style={styles.fill}>{piece}</Text>
              <Pressable
                onPress={() => move(k, -1)}
                disabled={k === 0}
                accessibilityRole="button"
                accessibilityLabel={`${t("up")}: ${piece}`}
                hitSlop={6}
                style={[styles.arrow, k === 0 && styles.off]}
                testID={`exercise-up-${index}-${k}`}
              >
                <ArrowUp size={20} color={colors.foreground} />
              </Pressable>
              <Pressable
                onPress={() => move(k, 1)}
                disabled={k === order.length - 1}
                accessibilityRole="button"
                accessibilityLabel={`${t("down")}: ${piece}`}
                hitSlop={6}
                style={[styles.arrow, k === order.length - 1 && styles.off]}
                testID={`exercise-down-${index}-${k}`}
              >
                <ArrowDown size={20} color={colors.foreground} />
              </Pressable>
            </View>
          ))}
        </View>
      );
    }
    case "SHORT":
      return (
        <TextInput
          value={typeof value === "string" ? value : ""}
          onChangeText={onChange}
          accessibilityLabel={t("yourAnswer")}
          placeholder={t("yourAnswer")}
          placeholderTextColor={colors.mutedForeground}
          autoCapitalize="none"
          autoCorrect={false}
          maxLength={120}
          style={[styles.short, inputLook]}
          testID={`exercise-short-${index}`}
        />
      );
  }
}

const field = {
  borderWidth: 1,
  borderRadius: radius.md,
  paddingHorizontal: space[3],
  fontFamily: font.regular,
  fontSize: 15,
} as const;

const styles = StyleSheet.create({
  fill: { flex: 1 },
  list: { gap: space[4] },
  start: { alignSelf: "flex-start" },
  wrapRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space[3] },
  head: { flexDirection: "row", alignItems: "flex-start", gap: space[2] },
  sentence: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", rowGap: space[2] },
  word: { marginRight: space[1] },
  gap: { ...field, width: 120, height: 40, marginRight: space[1], paddingVertical: 0 },
  short: { ...field, height: 44 },
  pairs: { gap: space[3] },
  pair: { gap: space[2] },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  piece: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: space[1],
    borderWidth: 1,
    borderRadius: radius.md,
    paddingLeft: space[3],
    paddingRight: space[1],
  },
  arrow: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  off: { opacity: 0.3 },
});
