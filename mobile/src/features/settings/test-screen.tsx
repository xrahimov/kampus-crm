import { useLocalSearchParams, useRouter } from "expo-router";
import { Pencil, Plus } from "lucide-react-native";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import {
  useDeleteTest,
  useOfficeTest,
  useRecordAttempt,
  useTestStatus,
  type OfficeTestDetail,
} from "@/api/office-tests";
import { Button } from "@/components/button";
import { Confirm } from "@/components/confirm";
import { Field } from "@/components/field";
import { Header } from "@/components/header";
import { Select } from "@/components/select";
import { Sheet } from "@/components/sheet";
import { Badge, Card, Divider, Notice, Screen } from "@/components/surface";
import { Text } from "@/components/text";
import { Kpis } from "@/features/reports/parts";
import { PendingScreen } from "@/features/shared/pending-screen";
import { dayAsDate } from "@/lib/days";
import { errorText, useDate, useTranslations } from "@/lib/i18n";
import { useLayout } from "@/lib/layout";
import { can, useMe } from "@/lib/session";
import { radius, space, useTheme } from "@/lib/theme";

import { TestFormSheet } from "./test-form";
import { TEST_STATUS_TONE } from "./tests-settings-screen";

/**
 * One test (A-250): the site's "/settings/tests/<id>". What the test is, its
 * questions with the right answers, everyone's results, and what is done with
 * it: change it, activate, close or reopen it, enter a student's answers, and
 * delete it while nobody has handed it in.
 */
export function TestScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTranslations();
  const query = useOfficeTest(id);
  const header = <Header back title={query.data?.name ?? t("tests.title")} />;
  if (!query.data) return <PendingScreen header={header} query={query} />;
  return (
    <Screen header={header} onRefresh={() => void query.refetch()} refreshing={query.isRefetching}>
      <TestBody test={query.data} />
    </Screen>
  );
}

function TestBody({ test }: { test: OfficeTestDetail }) {
  const t = useTranslations();
  const tt = useTranslations("tests");
  const td = useTranslations("tests.detail");
  const me = useMe();
  const date = useDate();
  const router = useRouter();
  const { wide } = useLayout();
  const { colors } = useTheme();
  const status = useTestStatus(test.id);
  const remove = useDeleteTest();
  const [editing, setEditing] = useState(false);
  const [recording, setRecording] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const mayUpdate = can(me, "tests.update");
  const mayDelete = can(me, "tests.delete");

  const questions = (
    <Card testID="test-questions">
      <Text variant="heading">{td("questions")}</Text>
      {test.questions.length === 0 ? (
        <Text tone="mutedForeground">{td("noQuestions")}</Text>
      ) : (
        test.questions.map((q, index) => (
          <View key={q.questionId} style={styles.tight} testID={`detail-question-${q.questionId}`}>
            {index > 0 ? <Divider /> : null}
            <Text variant="bodyStrong">
              {index + 1}. {q.text}
            </Text>
            <Text variant="small" tone="mutedForeground">
              {q.topic} · {td("pointsShort", { count: q.points })}
            </Text>
            {q.options.map((option, j) => (
              <Text
                key={j}
                variant="small"
                tone={j === q.correctIndex ? "success" : "mutedForeground"}
              >
                {j === q.correctIndex ? "✓ " : "· "}
                {option}
              </Text>
            ))}
          </View>
        ))
      )}
    </Card>
  );

  const attempts = (
    <Card testID="test-attempts">
      <Text variant="heading">{td("attempts")}</Text>
      {test.attempts.length === 0 ? (
        <Text tone="mutedForeground" testID="test-no-attempts">
          {td("noAttempts")}
        </Text>
      ) : (
        test.attempts.map((attempt, index) => (
          <View key={attempt.id}>
            {index > 0 ? <Divider /> : null}
            <View style={styles.attempt} testID={`attempt-${attempt.id}`}>
              <View style={styles.fill}>
                <Pressable
                  onPress={() =>
                    router.push({
                      pathname: "/staff/student/[id]",
                      params: { id: attempt.studentId },
                    })
                  }
                  disabled={!can(me, "students.view")}
                  accessibilityRole="link"
                  testID={`attempt-student-${attempt.id}`}
                >
                  <Text
                    variant="bodyStrong"
                    tone={can(me, "students.view") ? "primary" : undefined}
                    numberOfLines={1}
                  >
                    {attempt.studentName}
                  </Text>
                </Pressable>
                <Text variant="small" tone="mutedForeground">
                  {[
                    attempt.groupName,
                    date(new Date(attempt.submittedAt), { dateStyle: "medium" }),
                    attempt.durationSeconds
                      ? td("minutes", {
                          count: Math.max(1, Math.round(attempt.durationSeconds / 60)),
                        })
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </Text>
              </View>
              <View style={styles.score}>
                <Text variant="figure">{attempt.percent}%</Text>
                <Text variant="small" tone="mutedForeground">
                  {attempt.score}/{attempt.maxScore}
                </Text>
              </View>
              <Badge
                tone={attempt.passed ? "success" : "destructive"}
                label={attempt.passed ? td("passed") : td("failed")}
              />
            </View>
          </View>
        ))
      )}
    </Card>
  );

  return (
    <>
      <Card testID="test-facts">
        <View style={styles.head}>
          <Text variant="heading" style={styles.fill} testID="test-title">
            {test.name}
          </Text>
          <Badge
            tone={TEST_STATUS_TONE[test.status]}
            label={tt(`statuses.${test.status}`)}
            testID="test-status-badge"
          />
        </View>
        <Text variant="small" tone="mutedForeground">
          {[
            test.subject,
            test.timeLimitMinutes ? td("minutes", { count: test.timeLimitMinutes }) : null,
            `${tt("form.passPercent")}: ${test.passPercent}%`,
            test.deadline
              ? `${tt("columns.deadline")}: ${date(dayAsDate(test.deadline), { dateStyle: "medium" })}`
              : null,
          ]
            .filter(Boolean)
            .join(" · ")}
        </Text>
        <Text variant="small" tone="mutedForeground" testID="test-groups-line">
          {tt("form.groups")}:{" "}
          {test.groups.length ? test.groups.map((g) => g.name).join(", ") : tt("noGroups")}
        </Text>
        {status.error ? (
          <Notice tone="destructive" testID="test-status-problem">
            {errorText(t, status.error)}
          </Notice>
        ) : null}
        {mayUpdate || mayDelete ? (
          <View style={styles.actions}>
            {mayUpdate ? (
              <Button
                variant="outline"
                compact
                icon={<Pencil size={16} color={colors.foreground} />}
                label={t("common.edit")}
                onPress={() => setEditing(true)}
                testID="test-edit"
              />
            ) : null}
            {mayUpdate && test.status === "DRAFT" ? (
              <Button
                compact
                label={tt("actions.activate")}
                loading={status.isPending}
                onPress={() => status.mutate("ACTIVE")}
                testID="test-activate"
              />
            ) : null}
            {mayUpdate && test.status === "ACTIVE" ? (
              <>
                <Button
                  compact
                  icon={<Plus size={16} color={colors.primaryForeground} />}
                  label={td("record")}
                  onPress={() => setRecording(true)}
                  testID="test-record"
                />
                <Button
                  variant="outline"
                  compact
                  label={tt("actions.close")}
                  loading={status.isPending}
                  onPress={() => status.mutate("CLOSED")}
                  testID="test-close"
                />
              </>
            ) : null}
            {mayUpdate && test.status === "CLOSED" ? (
              <Button
                variant="outline"
                compact
                label={tt("actions.reopen")}
                loading={status.isPending}
                onPress={() => status.mutate("ACTIVE")}
                testID="test-reopen"
              />
            ) : null}
            {mayDelete ? (
              <Button
                variant="ghost"
                compact
                label={t("common.delete")}
                onPress={() => {
                  remove.reset();
                  setDeleting(true);
                }}
                testID="test-delete"
              />
            ) : null}
          </View>
        ) : null}
      </Card>
      <Kpis
        items={[
          { key: "questions", label: tt("columns.questions"), value: String(test.questionCount) },
          { key: "points", label: tt("columns.points"), value: String(test.totalPoints) },
          { key: "attempts", label: td("attempts"), value: String(test.attemptCount) },
          {
            key: "accuracy",
            label: tt("kpis.accuracy"),
            value: test.accuracy === null ? "—" : `${test.accuracy}%`,
          },
        ]}
      />
      {wide ? (
        <View style={styles.split}>
          <View style={styles.fill}>{questions}</View>
          <View style={styles.fill}>{attempts}</View>
        </View>
      ) : (
        <>
          {attempts}
          {questions}
        </>
      )}
      <TestFormSheet open={editing} onClose={() => setEditing(false)} test={test} />
      <AttemptSheet open={recording} onClose={() => setRecording(false)} test={test} />
      <Confirm
        open={deleting}
        onClose={() => setDeleting(false)}
        title={tt("deleteTitle")}
        text={tt("deleteText", { name: test.name })}
        label={t("common.delete")}
        destructive
        loading={remove.isPending}
        problem={remove.error ? errorText(t, remove.error) : null}
        onConfirm={() =>
          remove.mutate(test.id, {
            onSuccess: () => {
              setDeleting(false);
              router.back();
            },
          })
        }
        testID="test-delete-confirm"
      />
    </>
  );
}

/** "Enter result": the student, the minutes it took, and the answer they chose to each question. */
function AttemptSheet({
  open,
  onClose,
  test,
}: {
  open: boolean;
  onClose: () => void;
  test: OfficeTestDetail;
}) {
  const t = useTranslations();
  const td = useTranslations("tests.detail");
  const { colors } = useTheme();
  const record = useRecordAttempt(test.id);
  const [candidate, setCandidate] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, number>>({});
  const [minutes, setMinutes] = useState("");
  const [missing, setMissing] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setCandidate(null);
      setAnswers({});
      setMinutes("");
      setMissing(false);
      record.reset();
    }
  }
  // A student in two of the test's groups is there once for each.
  const keyOf = (c: { studentId: string; groupId: string }) => `${c.studentId}:${c.groupId}`;
  const submit = () => {
    const picked = test.candidates.find((c) => keyOf(c) === candidate);
    if (!picked) {
      setMissing(true);
      return;
    }
    record.mutate(
      {
        studentId: picked.studentId,
        groupId: picked.groupId,
        answers,
        durationSeconds: minutes ? Number(minutes) * 60 : null,
      },
      { onSuccess: onClose },
    );
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`${td("record")}: ${test.name}`}
      testID="attempt-form"
      footer={
        <Button
          label={t("common.save")}
          loading={record.isPending}
          onPress={submit}
          testID="attempt-save"
        />
      }
    >
      <View style={styles.form}>
        <Select
          label={td("student")}
          value={candidate}
          onChange={setCandidate}
          placeholder={td("pickStudent")}
          options={test.candidates.map((c) => ({
            value: keyOf(c),
            label: c.fullName,
            note: c.groupName,
          }))}
          error={missing && !candidate ? t("validation.required") : null}
          testID="attempt-student"
        />
        {test.candidates.length === 0 ? (
          <Text variant="small" tone="mutedForeground" testID="attempt-no-candidates">
            {td("noCandidates")}
          </Text>
        ) : null}
        <Field
          label={td("durationMinutes")}
          value={minutes}
          onChangeText={(text) => setMinutes(text.replace(/\D/g, "").slice(0, 4))}
          keyboardType="number-pad"
          testID="attempt-minutes"
        />
        {test.questions.map((q, index) => (
          <View
            key={q.questionId}
            style={[styles.question, { borderColor: colors.border }]}
            testID={`attempt-question-${q.questionId}`}
          >
            <Text variant="bodyStrong">
              {index + 1}. {q.text}
            </Text>
            <Text variant="small" tone="mutedForeground">
              {td("pointsShort", { count: q.points })}
            </Text>
            {q.options.map((option, j) => {
              const on = answers[q.questionId] === j;
              return (
                <Pressable
                  key={j}
                  onPress={() => setAnswers((now) => ({ ...now, [q.questionId]: j }))}
                  accessibilityRole="radio"
                  accessibilityLabel={option}
                  accessibilityState={{ selected: on }}
                  style={styles.answer}
                  testID={`attempt-answer-${q.questionId}-${j}`}
                >
                  <View style={[styles.radio, { borderColor: on ? colors.primary : colors.input }]}>
                    {on ? <View style={[styles.dot, { backgroundColor: colors.primary }]} /> : null}
                  </View>
                  <Text style={styles.fill}>{option}</Text>
                </Pressable>
              );
            })}
          </View>
        ))}
        {record.error ? (
          <Notice tone="destructive" testID="attempt-problem">
            {errorText(t, record.error)}
          </Notice>
        ) : null}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  tight: { gap: space[1] },
  form: { gap: space[4] },
  head: { flexDirection: "row", alignItems: "flex-start", gap: space[2] },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space[2], marginTop: space[1] },
  split: { flexDirection: "row", alignItems: "flex-start", gap: space[4] },
  attempt: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingVertical: space[3],
  },
  score: { alignItems: "flex-end" },
  question: {
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: space[3],
    gap: space[2],
  },
  answer: { flexDirection: "row", alignItems: "center", gap: space[3], minHeight: 40 },
  radio: {
    width: 22,
    height: 22,
    borderRadius: radius.full,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  dot: { width: 10, height: 10, borderRadius: radius.full },
});
