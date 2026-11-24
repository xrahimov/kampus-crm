import {
  EXERCISE_ITEMS_MAX,
  EXERCISE_KINDS,
  exerciseItemSchema,
  GAP_MARK,
  type ExerciseItem,
  type ExerciseKind,
} from "@kampus/lib/validation/exercises";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ArrowDown, ArrowUp, Plus, Trash2 } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import {
  useExercise,
  useExerciseResults,
  useSaveExercise,
  type ExerciseAnchor,
  type StaffExercise,
} from "@/api/topic-content";
import { Button } from "@/components/button";
import { Check } from "@/components/check";
import { Field } from "@/components/field";
import { Header } from "@/components/header";
import { Select } from "@/components/select";
import { Sheet } from "@/components/sheet";
import { Badge, Card, Divider, Notice, Screen, Segmented } from "@/components/surface";
import { Text } from "@/components/text";
import { PendingScreen } from "@/features/shared/pending-screen";
import { errorText, useTranslations } from "@/lib/i18n";
import { useLayout } from "@/lib/layout";
import { space, useTheme } from "@/lib/theme";

import { RowButton } from "./row-button";

const lines = (text: string) =>
  text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

/** One line that says an item's answer key, for the teacher's list. */
export function itemKey(item: ExerciseItem, yes: string, no: string): string {
  switch (item.kind) {
    case "CHOICE":
      return item.options.map((o, i) => (item.correct.includes(i) ? `✓ ${o}` : o)).join(" · ");
    case "TRUE_FALSE":
      return `✓ ${item.correct ? yes : no}`;
    case "GAP":
      return item.answers.map((accepted) => accepted.join(" | ")).join(" · ");
    case "MATCH":
      return item.pairs.map((pair) => `${pair.left} = ${pair.right}`).join(" · ");
    case "ORDER":
      return item.items.join(" → ");
    case "SHORT":
      return item.answers.join(" | ");
  }
}

/**
 * A self-check exercise written or changed (A-158, in the app A-263): a title
 * and items of six kinds, each with its answer key, checked by the site's own
 * rules before they join the list. An exercise there already is also shows how
 * the students did. `id` is "new" for one to add to the topic or homework the
 * address names.
 */
export function ExerciseEditorScreen() {
  const params = useLocalSearchParams<{ id: string; topic?: string; homework?: string }>();
  const te = useTranslations("exercises");
  const id = params.id === "new" ? null : params.id;
  const existing = useExercise(id);
  const title = id ? te("editTitle") : te("newTitle");

  if (id && !existing.data) {
    return <PendingScreen header={<Header back title={title} />} query={existing} />;
  }
  const anchor: ExerciseAnchor = params.topic
    ? { topicId: params.topic }
    : { homeworkId: params.homework };
  return (
    <Editor
      // The form starts from what the server holds; a saved change is shown by going back.
      key={existing.data?.id ?? "new"}
      exercise={existing.data ?? null}
      anchor={anchor}
      title={title}
    />
  );
}

function Editor({
  exercise,
  anchor,
  title: screenTitle,
}: {
  exercise: StaffExercise | null;
  anchor: ExerciseAnchor;
  title: string;
}) {
  const t = useTranslations();
  const te = useTranslations("exercises");
  const router = useRouter();
  const { wide } = useLayout();
  const save = useSaveExercise(exercise?.id ?? null, anchor);
  const [title, setTitle] = useState(exercise?.title ?? "");
  const [items, setItems] = useState<ExerciseItem[]>(exercise?.items ?? []);
  const [adding, setAdding] = useState(false);
  const ready = title.trim() !== "" && items.length > 0;

  const move = (index: number, by: -1 | 1) =>
    setItems((list) => {
      const to = index + by;
      if (to < 0 || to >= list.length) return list;
      const copy = [...list];
      [copy[index], copy[to]] = [copy[to]!, copy[index]!];
      return copy;
    });

  const form = (
    <View style={styles.block}>
      <Text tone="mutedForeground">{te("hint")}</Text>
      {save.error ? (
        <Notice tone="destructive" testID="exercise-problem">
          {errorText(t, save.error)}
        </Notice>
      ) : null}
      <Field
        label={te("title")}
        value={title}
        onChangeText={setTitle}
        maxLength={120}
        testID="exercise-title"
      />
      {items.map((item, index) => (
        <Card key={index} style={styles.item} testID={`exercise-item-${index}`}>
          <View style={styles.itemHead}>
            <Text tone="mutedForeground">{index + 1}.</Text>
            <Badge label={te(`kinds.${item.kind}`)} />
            <View style={styles.fill} />
            <RowButton
              icon={ArrowUp}
              label={te("moveUp")}
              disabled={index === 0}
              onPress={() => move(index, -1)}
              testID={`exercise-item-up-${index}`}
            />
            <RowButton
              icon={ArrowDown}
              label={te("moveDown")}
              disabled={index === items.length - 1}
              onPress={() => move(index, 1)}
              testID={`exercise-item-down-${index}`}
            />
            <RowButton
              icon={Trash2}
              label={te("remove")}
              destructive
              onPress={() => setItems((list) => list.filter((_, at) => at !== index))}
              testID={`exercise-item-remove-${index}`}
            />
          </View>
          <Text>{item.prompt}</Text>
          <Text variant="small" tone="mutedForeground">
            {itemKey(item, te("true"), te("false"))}
          </Text>
        </Card>
      ))}
      {items.length < EXERCISE_ITEMS_MAX ? (
        <Button
          variant="outline"
          label={te("addItem")}
          icon={<PlusIcon />}
          onPress={() => setAdding(true)}
          style={styles.start}
          testID="exercise-add-item"
        />
      ) : null}
      <Button
        label={t("common.save")}
        disabled={!ready}
        loading={save.isPending}
        onPress={() =>
          save.mutate({ title: title.trim(), items }, { onSuccess: () => router.back() })
        }
        testID="exercise-save"
      />
    </View>
  );

  return (
    <Screen
      header={<Header back title={screenTitle} subtitle={exercise?.title} />}
      contentStyle={wide ? styles.split : styles.column}
    >
      {wide ? <View style={styles.fill}>{form}</View> : form}
      {exercise ? (
        wide ? (
          <View style={styles.fill}>
            <Results id={exercise.id} />
          </View>
        ) : (
          <Results id={exercise.id} />
        )
      ) : null}
      <AddItemSheet
        open={adding}
        onClose={() => setAdding(false)}
        onAdd={(item) => {
          setItems((list) => [...list, item]);
          setAdding(false);
        }}
      />
    </Screen>
  );
}

function PlusIcon() {
  const { colors } = useTheme();
  return <Plus size={16} color={colors.foreground} />;
}

/** How the students did on an exercise: each one's best go. */
function Results({ id }: { id: string }) {
  const te = useTranslations("exercises");
  const results = useExerciseResults(id);
  if (!results.data) return null;
  return (
    <Card style={styles.flush} testID="exercise-results">
      <Text variant="heading" style={styles.resultsHead}>
        {te("results")}
      </Text>
      {results.data.length === 0 ? (
        <Text tone="mutedForeground" style={styles.none}>
          {te("noResults")}
        </Text>
      ) : (
        results.data.map((row) => (
          <View key={row.studentId}>
            <Divider />
            <View style={styles.result} testID={`exercise-result-${row.studentId}`}>
              <View style={styles.fill}>
                <Text variant="bodyStrong" numberOfLines={1}>
                  {row.fullName}
                </Text>
                <Text variant="small" tone="mutedForeground" numberOfLines={1}>
                  {row.groupName}
                </Text>
              </View>
              <Text variant="small">
                {te("bestOf", {
                  score: row.bestScore,
                  max: row.maxScore,
                  percent: row.bestPercent,
                  attempts: row.attempts,
                })}
              </Text>
            </View>
          </View>
        ))
      )}
    </Card>
  );
}

/** One new item; its kind decides which fields show, and the site's rules say what is missing. */
function AddItemSheet({
  open,
  onClose,
  onAdd,
}: {
  open: boolean;
  onClose: () => void;
  onAdd: (item: ExerciseItem) => void;
}) {
  const t = useTranslations();
  const te = useTranslations("exercises");
  const [kind, setKind] = useState<ExerciseKind>("CHOICE");
  const [prompt, setPrompt] = useState("");
  const [options, setOptions] = useState("");
  const [correct, setCorrect] = useState<number[]>([]);
  const [truth, setTruth] = useState<"true" | "false">("true");
  const [key, setKey] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      // The kind stays as it was: several items of one kind are usual.
      setPrompt("");
      setOptions("");
      setCorrect([]);
      setKey("");
      setProblem(null);
    }
  }
  const optionLines = lines(options);

  const build = (): unknown => {
    switch (kind) {
      case "CHOICE":
        return { kind, prompt, options: optionLines, correct };
      case "TRUE_FALSE":
        return { kind, prompt, correct: truth === "true" };
      case "GAP":
        return {
          kind,
          prompt,
          answers: lines(key).map((line) =>
            line
              .split("|")
              .map((answer) => answer.trim())
              .filter(Boolean),
          ),
        };
      case "MATCH":
        return {
          kind,
          prompt,
          pairs: lines(key).map((line) => {
            const [left, ...rest] = line.split("=");
            return { left: (left ?? "").trim(), right: rest.join("=").trim() };
          }),
        };
      case "ORDER":
        return { kind, prompt, items: lines(key) };
      case "SHORT":
        return { kind, prompt, answers: lines(key) };
    }
  };

  const add = () => {
    const parsed = exerciseItemSchema.safeParse(build());
    if (!parsed.success) {
      const message = parsed.error.issues[0]?.message ?? "errors.validation";
      setProblem(t.has(message) ? t(message) : t("errors.validation"));
      return;
    }
    onAdd(parsed.data);
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={te("addItem")}
      testID="exercise-item"
      footer={<Button label={te("addToList")} onPress={add} testID="exercise-item-add" />}
    >
      <View style={styles.block}>
        <Select
          label={te("kind")}
          value={kind}
          onChange={(next) => {
            if (!next) return;
            setKind(next);
            setProblem(null);
          }}
          options={EXERCISE_KINDS.map((one) => ({ value: one, label: te(`kinds.${one}`) }))}
          testID="exercise-item-kind"
        />
        <Text variant="small" tone="mutedForeground" testID="exercise-item-hint">
          {te(`kindHints.${kind}`, { mark: GAP_MARK })}
        </Text>
        <Field
          label={te("prompt")}
          value={prompt}
          onChangeText={setPrompt}
          multiline
          maxLength={1000}
          style={styles.two}
          testID="exercise-item-prompt"
        />
        {kind === "CHOICE" ? (
          <>
            <Field
              label={te("options")}
              value={options}
              onChangeText={(text) => {
                setOptions(text);
                // The ticks went with lines that may no longer be there.
                setCorrect([]);
              }}
              multiline
              style={styles.four}
              testID="exercise-item-options"
            />
            {optionLines.length > 0 ? (
              <View testID="exercise-item-correct">
                <Text variant="small" tone="mutedForeground">
                  {te("tickCorrect")}
                </Text>
                {optionLines.map((option, index) => (
                  <Check
                    key={`${index}-${option}`}
                    label={option}
                    value={correct.includes(index)}
                    onChange={(on) =>
                      setCorrect((ticked) =>
                        on
                          ? [...ticked, index].sort((a, b) => a - b)
                          : ticked.filter((at) => at !== index),
                      )
                    }
                    testID={`exercise-item-correct-${index}`}
                  />
                ))}
              </View>
            ) : null}
          </>
        ) : null}
        {kind === "TRUE_FALSE" ? (
          <Segmented<"true" | "false">
            value={truth}
            onChange={setTruth}
            options={[
              { value: "true", label: te("true") },
              { value: "false", label: te("false") },
            ]}
            testID="exercise-item-truth"
          />
        ) : null}
        {kind === "GAP" || kind === "MATCH" || kind === "ORDER" || kind === "SHORT" ? (
          <Field
            label={te(`keyLabels.${kind}`)}
            value={key}
            onChangeText={setKey}
            multiline
            autoCapitalize="none"
            style={styles.four}
            testID="exercise-item-key"
          />
        ) : null}
        {problem ? (
          <Notice tone="destructive" testID="exercise-item-problem">
            {problem}
          </Notice>
        ) : null}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  column: { gap: space[6] },
  split: { flexDirection: "row", alignItems: "flex-start", gap: space[6] },
  block: { gap: space[4] },
  start: { alignSelf: "flex-start" },
  item: { gap: space[2] },
  itemHead: { flexDirection: "row", alignItems: "center", gap: space[2] },
  flush: { padding: 0, gap: 0, overflow: "hidden" },
  resultsHead: { paddingHorizontal: space[4], paddingVertical: space[3] },
  none: { paddingHorizontal: space[4], paddingBottom: space[4] },
  result: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingHorizontal: space[4],
    paddingVertical: space[3],
  },
  two: { minHeight: 72, textAlignVertical: "top" },
  four: { minHeight: 112, textAlignVertical: "top" },
});
