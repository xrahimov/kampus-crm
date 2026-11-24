import { useMemo, useState } from "react";
import { StyleSheet, View } from "react-native";

import {
  TEST_STATUSES,
  useSaveTest,
  useTestOptions,
  type OfficeTest,
  type OfficeTestDetail,
} from "@/api/office-tests";
import type { TestStatus } from "@/api/types";
import { Button } from "@/components/button";
import { Check } from "@/components/check";
import { Chip } from "@/components/chip";
import { DateField } from "@/components/date-field";
import { Field } from "@/components/field";
import { Select } from "@/components/select";
import { Sheet } from "@/components/sheet";
import { Loading, Notice } from "@/components/surface";
import { Text } from "@/components/text";
import { fieldErrorOf, hasFieldErrors } from "@/lib/form";
import { errorText, useTranslations } from "@/lib/i18n";
import { space } from "@/lib/theme";

/** How many questions that are not picked show at once; the search finds the rest. */
const SHOWN = 40;

const digits = (text: string, most: number) => text.replace(/\D/g, "").slice(0, most);

/**
 * "Create test" and "Edit test" (A-250): the site's test form. Name, subject,
 * status, time limit, pass mark and last day, the groups the test is given
 * to, and the questions picked from the bank with their points. A test is
 * changed from its own page, which has its questions; once results are in,
 * the questions are locked.
 */
export function TestFormSheet({
  open,
  onClose,
  test,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  test: OfficeTestDetail | null;
  onSaved?: (saved: OfficeTest) => void;
}) {
  const t = useTranslations();
  const tt = useTranslations("tests");
  const tf = useTranslations("tests.form");
  const options = useTestOptions(open);
  const save = useSaveTest();
  const [name, setName] = useState("");
  const [subject, setSubject] = useState("");
  const [status, setStatus] = useState<TestStatus>("DRAFT");
  const [minutes, setMinutes] = useState("");
  const [pass, setPass] = useState("60");
  const [deadline, setDeadline] = useState<string | null>(null);
  const [groupIds, setGroupIds] = useState<string[]>([]);
  const [picked, setPicked] = useState<Array<{ questionId: string; points: string }>>([]);
  const [search, setSearch] = useState("");
  const [missing, setMissing] = useState(false);
  const [wasOpen, setWasOpen] = useState(false);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setName(test?.name ?? "");
      setSubject(test?.subject ?? "");
      setStatus(test?.status ?? "DRAFT");
      setMinutes(test?.timeLimitMinutes ? String(test.timeLimitMinutes) : "");
      setPass(String(test?.passPercent ?? 60));
      setDeadline(test?.deadline ?? null);
      setGroupIds(test?.groups.map((group) => group.id) ?? []);
      setPicked(
        test?.questions.map((q) => ({ questionId: q.questionId, points: String(q.points) })) ?? [],
      );
      setSearch("");
      setMissing(false);
      save.reset();
    }
  }
  const locked = (test?.attemptCount ?? 0) > 0;
  const fieldError = fieldErrorOf(t, save.error);
  const required = (empty: boolean) => (missing && empty ? t("validation.required") : null);
  const isPicked = (id: string) => picked.some((one) => one.questionId === id);
  // A refusal a field shows under itself is not said twice; any other is said above the button.
  const shownByField =
    hasFieldErrors(save.error) &&
    [
      "name",
      "subject",
      "timeLimitMinutes",
      "passPercent",
      "deadline",
      "groupIds",
      "questions",
    ].some((key) => fieldError(key) !== null);

  // The picked questions always show; of the others, the subject's, narrowed by the search.
  const bank = useMemo(() => {
    const all = options.data?.questions ?? [];
    const words = search.trim().toLowerCase();
    const chosen = new Set(picked.map((one) => one.questionId));
    const mine = all.filter((item) => chosen.has(item.id));
    const others = all.filter(
      (item) =>
        !chosen.has(item.id) &&
        (!subject.trim() || item.subject === subject.trim()) &&
        (!words ||
          item.text.toLowerCase().includes(words) ||
          item.topic.toLowerCase().includes(words)),
    );
    return { rows: [...mine, ...others.slice(0, SHOWN)], more: Math.max(0, others.length - SHOWN) };
  }, [options.data, picked, subject, search]);

  const submit = () => {
    if (!name.trim() || !subject.trim() || pass === "") {
      setMissing(true);
      return;
    }
    save.mutate(
      {
        id: test?.id ?? null,
        input: {
          name: name.trim(),
          subject: subject.trim(),
          timeLimitMinutes: minutes ? Number(minutes) : null,
          passPercent: Number(pass),
          deadline,
          status,
          groupIds,
          questions: picked.map((one) => ({
            questionId: one.questionId,
            points: Number(one.points) || 1,
          })),
        },
      },
      {
        onSuccess: (saved) => {
          onClose();
          onSaved?.(saved);
        },
      },
    );
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={test ? tt("edit") : tt("add")}
      testID="test-form"
      footer={
        <Button
          label={t("common.save")}
          loading={save.isPending}
          onPress={submit}
          testID="test-save"
        />
      }
    >
      <View style={styles.form}>
        <Field
          label={tf("name")}
          value={name}
          onChangeText={setName}
          maxLength={120}
          error={fieldError("name") ?? required(!name.trim())}
          testID="test-name"
        />
        <View style={styles.tight}>
          <Field
            label={tf("subject")}
            value={subject}
            onChangeText={setSubject}
            maxLength={80}
            error={fieldError("subject") ?? required(!subject.trim())}
            testID="test-subject"
          />
          {/* The subjects already in use, a tap away (the site's suggestions). */}
          {(options.data?.subjects ?? []).length > 0 ? (
            <View style={styles.chips}>
              {(options.data?.subjects ?? []).map((one) => (
                <Chip
                  key={one}
                  label={one}
                  on={subject.trim() === one}
                  onPress={() => setSubject(one)}
                  testID={`test-subject-${one}`}
                />
              ))}
            </View>
          ) : null}
        </View>
        <Select
          label={tf("status")}
          value={status}
          onChange={(next) => setStatus(next ?? "DRAFT")}
          options={TEST_STATUSES.map((value) => ({ value, label: tt(`statuses.${value}`) }))}
          testID="test-status"
        />
        <Field
          label={tf("timeLimit")}
          value={minutes}
          onChangeText={(text) => setMinutes(digits(text, 3))}
          keyboardType="number-pad"
          error={fieldError("timeLimitMinutes")}
          testID="test-minutes"
        />
        <Field
          label={tf("passPercent")}
          value={pass}
          onChangeText={(text) => setPass(digits(text, 3))}
          keyboardType="number-pad"
          error={fieldError("passPercent") ?? required(pass === "")}
          testID="test-pass"
        />
        <DateField
          label={tf("deadline")}
          value={deadline}
          onChange={setDeadline}
          error={fieldError("deadline")}
          testID="test-deadline"
        />

        <View style={styles.tight}>
          <Text variant="smallStrong">{tf("groups")}</Text>
          {options.isLoading ? (
            <Loading />
          ) : (options.data?.groups ?? []).length === 0 ? (
            <Text variant="small" tone="mutedForeground">
              {tf("noGroups")}
            </Text>
          ) : (
            <View style={styles.chips} testID="test-groups">
              {(options.data?.groups ?? []).map((group) => (
                <Chip
                  key={group.id}
                  label={group.name}
                  on={groupIds.includes(group.id)}
                  onPress={() =>
                    setGroupIds((now) =>
                      now.includes(group.id)
                        ? now.filter((id) => id !== group.id)
                        : [...now, group.id],
                    )
                  }
                  testID={`test-group-${group.id}`}
                />
              ))}
            </View>
          )}
          {fieldError("groupIds") ? (
            <Text variant="small" tone="destructive">
              {fieldError("groupIds")}
            </Text>
          ) : null}
        </View>

        <View style={styles.tight}>
          <Text variant="smallStrong" testID="test-picked-count">
            {tf("questions")} ({picked.length})
          </Text>
          {locked ? (
            <Text variant="small" tone="mutedForeground" testID="test-locked">
              {tf("lockedQuestions")}
            </Text>
          ) : (
            <Field
              label={tf("searchQuestions")}
              value={search}
              onChangeText={setSearch}
              autoCorrect={false}
              autoCapitalize="none"
              testID="test-question-search"
            />
          )}
          {options.error ? (
            <Notice tone="warning" testID="test-options-problem">
              {errorText(t, options.error)}
            </Notice>
          ) : null}
          {bank.rows.length === 0 && !options.isLoading ? (
            <Text variant="small" tone="mutedForeground" testID="test-no-questions">
              {tf("noQuestions")}
            </Text>
          ) : null}
          {bank.rows.map((item) => {
            const mine = picked.find((one) => one.questionId === item.id);
            return (
              <View key={item.id} style={styles.question} testID={`test-question-${item.id}`}>
                <View style={styles.fill}>
                  <Check
                    label={item.text}
                    hint={item.topic}
                    value={isPicked(item.id)}
                    disabled={locked}
                    onChange={(on) =>
                      setPicked((now) =>
                        on
                          ? [...now, { questionId: item.id, points: "1" }]
                          : now.filter((one) => one.questionId !== item.id),
                      )
                    }
                    testID={`test-pick-${item.id}`}
                  />
                </View>
                {mine ? (
                  <View style={styles.points}>
                    <Field
                      label={tf("points")}
                      value={mine.points}
                      editable={!locked}
                      onChangeText={(text) =>
                        setPicked((now) =>
                          now.map((one) =>
                            one.questionId === item.id ? { ...one, points: digits(text, 3) } : one,
                          ),
                        )
                      }
                      keyboardType="number-pad"
                      testID={`test-points-${item.id}`}
                    />
                  </View>
                ) : null}
              </View>
            );
          })}
          {bank.more > 0 ? (
            <Text variant="small" tone="mutedForeground" testID="test-more-questions">
              {t("mobile.tests.moreQuestions", { count: bank.more })}
            </Text>
          ) : null}
          {fieldError("questions") ? (
            <Text variant="small" tone="destructive" testID="test-questions-problem">
              {fieldError("questions")}
            </Text>
          ) : null}
        </View>
        {save.error && !shownByField ? (
          <Notice tone="destructive" testID="test-problem">
            {errorText(t, save.error)}
          </Notice>
        ) : null}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  form: { gap: space[4] },
  tight: { gap: space[2] },
  fill: { flex: 1 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  question: { flexDirection: "row", alignItems: "flex-start", gap: space[2] },
  points: { width: 76 },
});
