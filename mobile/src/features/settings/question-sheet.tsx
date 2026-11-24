import { Plus, Trash2 } from "lucide-react-native";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import {
  MAX_OPTIONS,
  MIN_OPTIONS,
  useQuestionBankOptions,
  useQuestionStep,
  type Question,
} from "@/api/office-tests";
import { Button } from "@/components/button";
import { Chip } from "@/components/chip";
import { Confirm } from "@/components/confirm";
import { Field } from "@/components/field";
import { Sheet } from "@/components/sheet";
import { Notice } from "@/components/surface";
import { Text } from "@/components/text";
import { fieldErrorOf, hasFieldErrors } from "@/lib/form";
import { errorText, useTranslations } from "@/lib/i18n";
import { can, useMe } from "@/lib/session";
import { radius, space, useTheme } from "@/lib/theme";

/**
 * A question of the bank (A-250): its subject and topic, the question, two to
 * six answers and which of them is right. Opened on a question it changes it,
 * or deletes it after a question; a question a test uses cannot be deleted.
 */
export function QuestionSheet({
  open,
  onClose,
  question,
}: {
  open: boolean;
  onClose: () => void;
  question: Question | null;
}) {
  const t = useTranslations();
  const tq = useTranslations("tests.questionForm");
  const me = useMe();
  const { colors } = useTheme();
  const bank = useQuestionBankOptions();
  const save = useQuestionStep();
  const remove = useQuestionStep();
  const [subject, setSubject] = useState(question?.subject ?? "");
  const [topic, setTopic] = useState(question?.topic ?? "");
  const [text, setText] = useState(question?.text ?? "");
  const [options, setOptions] = useState<string[]>(question?.options ?? ["", ""]);
  const [correct, setCorrect] = useState(question?.correctIndex ?? 0);
  const [missing, setMissing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setSubject(question?.subject ?? "");
      setTopic(question?.topic ?? "");
      setText(question?.text ?? "");
      setOptions(question?.options ?? ["", ""]);
      setCorrect(question?.correctIndex ?? 0);
      setMissing(false);
      setDeleting(false);
      save.reset();
      remove.reset();
    }
  }
  const mayChange = question ? can(me, "tests.update") : can(me, "tests.create");
  const mayDelete = question !== null && can(me, "tests.delete");
  const fieldError = fieldErrorOf(t, save.error);
  const required = (empty: boolean) => (missing && empty ? t("validation.required") : null);
  const optionsProblem =
    fieldError("options") ??
    fieldError("correctIndex") ??
    (missing && options.some((one) => !one.trim()) ? t("validation.required") : null);
  const shownByField =
    hasFieldErrors(save.error) &&
    ["subject", "topic", "text", "options", "correctIndex"].some((key) => fieldError(key) !== null);

  const submit = () => {
    if (!subject.trim() || !topic.trim() || !text.trim() || options.some((one) => !one.trim())) {
      setMissing(true);
      return;
    }
    save.mutate(
      {
        id: question?.id ?? null,
        input: {
          subject: subject.trim(),
          topic: topic.trim(),
          text: text.trim(),
          options: options.map((one) => one.trim()),
          correctIndex: correct,
        },
      },
      { onSuccess: onClose },
    );
  };

  return (
    <>
      <Sheet
        open={open && !deleting}
        onClose={onClose}
        title={question ? tq("edit") : tq("add")}
        testID="question-form"
        footer={
          <View style={styles.footer}>
            {mayChange ? (
              <Button
                label={t("common.save")}
                loading={save.isPending}
                onPress={submit}
                testID="question-save"
              />
            ) : null}
            {mayDelete ? (
              <Button
                variant="ghost"
                label={t("common.delete")}
                onPress={() => {
                  remove.reset();
                  setDeleting(true);
                }}
                testID="question-delete"
              />
            ) : null}
          </View>
        }
      >
        <View style={styles.form}>
          <View style={styles.tight}>
            <Field
              label={tq("subject")}
              value={subject}
              onChangeText={setSubject}
              maxLength={80}
              editable={mayChange}
              error={fieldError("subject") ?? required(!subject.trim())}
              testID="question-subject"
            />
            {mayChange && (bank.data?.subjects ?? []).length > 0 ? (
              <View style={styles.chips}>
                {(bank.data?.subjects ?? []).map((one) => (
                  <Chip
                    key={one}
                    label={one}
                    on={subject.trim() === one}
                    onPress={() => setSubject(one)}
                    testID={`question-subject-${one}`}
                  />
                ))}
              </View>
            ) : null}
          </View>
          <Field
            label={tq("topic")}
            value={topic}
            onChangeText={setTopic}
            maxLength={120}
            editable={mayChange}
            error={fieldError("topic") ?? required(!topic.trim())}
            testID="question-topic"
          />
          <Field
            label={tq("text")}
            value={text}
            onChangeText={setText}
            maxLength={2000}
            multiline
            editable={mayChange}
            error={fieldError("text") ?? required(!text.trim())}
            testID="question-text"
          />
          <View style={styles.tight}>
            <Text variant="smallStrong">{tq("options")}</Text>
            <Text variant="small" tone="mutedForeground">
              {tq("optionsHint")}
            </Text>
            {options.map((value, index) => (
              <View key={index} style={styles.option} testID={`question-option-row-${index}`}>
                <Pressable
                  onPress={() => setCorrect(index)}
                  disabled={!mayChange}
                  accessibilityRole="radio"
                  accessibilityLabel={`${tq("correct")}: ${tq("optionN", { n: index + 1 })}`}
                  accessibilityState={{ selected: correct === index, disabled: !mayChange }}
                  hitSlop={8}
                  style={[
                    styles.radio,
                    { borderColor: correct === index ? colors.primary : colors.input },
                  ]}
                  testID={`question-correct-${index}`}
                >
                  {correct === index ? (
                    <View style={[styles.dot, { backgroundColor: colors.primary }]} />
                  ) : null}
                </Pressable>
                <View style={styles.fill}>
                  <Field
                    label={tq("optionN", { n: index + 1 })}
                    value={value}
                    onChangeText={(next) =>
                      setOptions((now) => now.map((one, i) => (i === index ? next : one)))
                    }
                    maxLength={300}
                    editable={mayChange}
                    testID={`question-option-${index}`}
                  />
                </View>
                {mayChange ? (
                  <Pressable
                    onPress={() => {
                      setOptions((now) => now.filter((_, i) => i !== index));
                      // The right answer keeps its mark when an answer above it goes.
                      setCorrect((now) => (now === index ? 0 : now > index ? now - 1 : now));
                    }}
                    disabled={options.length <= MIN_OPTIONS}
                    accessibilityRole="button"
                    accessibilityLabel={tq("removeOption")}
                    accessibilityState={{ disabled: options.length <= MIN_OPTIONS }}
                    hitSlop={8}
                    style={[styles.bin, options.length <= MIN_OPTIONS ? styles.faded : null]}
                    testID={`question-option-remove-${index}`}
                  >
                    <Trash2 size={18} color={colors.mutedForeground} />
                  </Pressable>
                ) : null}
              </View>
            ))}
            {optionsProblem ? (
              <Text variant="small" tone="destructive" testID="question-options-problem">
                {optionsProblem}
              </Text>
            ) : null}
            {mayChange ? (
              <Button
                variant="outline"
                compact
                icon={<Plus size={16} color={colors.foreground} />}
                label={tq("addOption")}
                disabled={options.length >= MAX_OPTIONS}
                onPress={() => setOptions((now) => [...now, ""])}
                style={styles.start}
                testID="question-option-add"
              />
            ) : null}
          </View>
          {save.error && !shownByField ? (
            <Notice tone="destructive" testID="question-problem">
              {errorText(t, save.error)}
            </Notice>
          ) : null}
        </View>
      </Sheet>
      <Confirm
        open={open && deleting}
        onClose={() => setDeleting(false)}
        title={tq("deleteTitle")}
        text={tq("deleteText")}
        label={t("common.delete")}
        destructive
        loading={remove.isPending}
        problem={remove.error ? errorText(t, remove.error) : null}
        onConfirm={() => {
          if (!question) return;
          remove.mutate(
            { id: question.id, input: null },
            {
              onSuccess: () => {
                setDeleting(false);
                onClose();
              },
            },
          );
        }}
        testID="question-delete-confirm"
      />
    </>
  );
}

const styles = StyleSheet.create({
  form: { gap: space[4] },
  tight: { gap: space[2] },
  footer: { gap: space[2] },
  fill: { flex: 1 },
  start: { alignSelf: "flex-start" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  option: { flexDirection: "row", alignItems: "flex-end", gap: space[2] },
  radio: {
    width: 24,
    height: 24,
    borderRadius: radius.full,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  dot: { width: 12, height: 12, borderRadius: radius.full },
  bin: { width: 32, height: 32, alignItems: "center", justifyContent: "center", marginBottom: 8 },
  faded: { opacity: 0.4 },
});
