import { useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import { UserPlus } from "lucide-react-native";
import { useState, type ReactNode } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import {
  examKeys,
  useDeleteExam,
  useExamCandidates,
  useExamSheet,
  useExamStatus,
  useRegisterForExam,
  useSaveMarks,
  useUnregisterFromExam,
  type Exam,
  type ExamSheet,
  type SheetRow,
} from "@/api/office-exams";
import { Button } from "@/components/button";
import { Check } from "@/components/check";
import { Confirm } from "@/components/confirm";
import { Field } from "@/components/field";
import { Header } from "@/components/header";
import { Fact } from "@/components/rows";
import { Badge, Card, Divider, EmptyState, Notice, Screen } from "@/components/surface";
import { Text } from "@/components/text";
import { PendingScreen } from "@/features/shared/pending-screen";
import { errorText, useMoney, useTranslations } from "@/lib/i18n";
import { useLayout } from "@/lib/layout";
import { useRested } from "@/lib/rested";
import { can, useMe } from "@/lib/session";
import { space, useTheme } from "@/lib/theme";

import { ExamFormSheet, typedScore } from "./exam-form";
import { useExamWhen } from "./exams-screen";

/** What is typed for one student before it is saved. */
interface Draft {
  score: string;
  isPresent: boolean;
  comment: string;
}

const draftOf = (row: SheetRow): Draft => ({
  score: row.score === null ? "" : String(row.score),
  isPresent: row.isPresent,
  comment: row.comment ?? "",
});

/**
 * One exam (A-235): the site's exam page. What it is and when, Edit, Finish or
 * Reopen, Delete while nobody is graded, and the grading sheet: for each
 * student whether they came, the score and a comment, saved together. For a
 * mock exam also who is registered: a search adds a student, a row takes one
 * off. Whoever may only look sees the scores.
 */
export function ExamScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const t = useTranslations();
  const tr = useTranslations("exams.results");
  const me = useMe();
  const router = useRouter();
  const client = useQueryClient();
  const query = useExamSheet(id);
  const save = useSaveMarks(id);
  const status = useExamStatus();
  const remove = useDeleteExam();
  const unregister = useUnregisterFromExam(id);
  const [edits, setEdits] = useState<Record<string, Draft>>({});
  const [checked, setChecked] = useState(false);
  const [saved, setSaved] = useState(false);
  const [editing, setEditing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [leaving, setLeaving] = useState<SheetRow | null>(null);

  const header = <Header back title={query.data?.exam.name ?? t("exams.title")} />;
  if (!query.data) return <PendingScreen header={header} query={query} />;
  const { exam, rows } = query.data;
  const mayChange = can(me, "exams.update");
  const mayDelete = can(me, "exams.delete") && exam.gradedCount === 0;
  const dirty = rows.some((row) => row.studentId in edits);
  const draft = (row: SheetRow) => edits[row.studentId] ?? draftOf(row);
  const edit = (row: SheetRow, patch: Partial<Draft>) => {
    setEdits((all) => ({ ...all, [row.studentId]: { ...draft(row), ...patch } }));
    setSaved(false);
    save.reset();
  };
  /** What is wrong with a typed score, if anything. */
  const scoreProblem = (row: SheetRow): string | null => {
    const typed = draft(row).score.trim();
    if (typed === "") return null;
    const score = typedScore(typed);
    if (score === null) return t("validation.min");
    return score > exam.maxScore ? t("validation.scoreMax") : null;
  };
  const setRows = (next: SheetRow[]) =>
    client.setQueryData<ExamSheet>(examKeys.sheet(id), (was) =>
      was ? { ...was, rows: next } : was,
    );

  const submit = () => {
    if (rows.some((row) => scoreProblem(row) !== null)) {
      setChecked(true);
      return;
    }
    save.mutate(
      rows.map((row) => {
        const d = draft(row);
        return {
          studentId: row.studentId,
          score: d.score.trim() === "" ? null : typedScore(d.score),
          isPresent: d.isPresent,
          comment: d.comment.trim() || null,
        };
      }),
      {
        onSuccess: (next) => {
          setRows(next);
          setEdits({});
          setChecked(false);
          setSaved(true);
        },
      },
    );
  };

  return (
    <Screen
      header={header}
      onRefresh={() => void query.refetch()}
      refreshing={query.isRefetching}
      contentStyle={styles.column}
      footer={
        mayChange && rows.length > 0 ? (
          <Button
            label={tr("save")}
            disabled={!dirty}
            loading={save.isPending}
            onPress={submit}
            testID="exam-save-results"
          />
        ) : undefined
      }
    >
      <ExamFacts
        exam={exam}
        registered={rows.length}
        actions={
          mayChange || mayDelete ? (
            <View style={styles.actions}>
              {mayChange ? (
                <>
                  <Button
                    compact
                    variant="outline"
                    label={t("common.edit")}
                    onPress={() => setEditing(true)}
                    testID="exam-edit"
                  />
                  <Button
                    compact
                    variant="outline"
                    label={
                      exam.status === "NOT_STARTED"
                        ? t("exams.actions.finish")
                        : t("exams.actions.reopen")
                    }
                    loading={status.isPending}
                    onPress={() => status.mutate({ id, finished: exam.status === "NOT_STARTED" })}
                    testID={exam.status === "NOT_STARTED" ? "exam-finish" : "exam-reopen"}
                  />
                </>
              ) : null}
              {mayDelete ? (
                <Button
                  compact
                  variant="ghost"
                  label={t("common.delete")}
                  onPress={() => {
                    remove.reset();
                    setDeleting(true);
                  }}
                  testID="exam-delete"
                />
              ) : null}
            </View>
          ) : null
        }
      />
      {status.error ? (
        <Notice tone="destructive" testID="exam-status-problem">
          {errorText(t, status.error)}
        </Notice>
      ) : null}

      {exam.type === "MOCK" && mayChange ? (
        <RegisterCard exam={exam} registered={rows.length} onRegistered={setRows} />
      ) : null}

      {save.error ? (
        <Notice tone="destructive" testID="exam-results-problem">
          {errorText(t, save.error)}
        </Notice>
      ) : null}
      {saved ? (
        <Notice tone="success" testID="exam-results-saved">
          {tr("saved")}
        </Notice>
      ) : null}

      {rows.length === 0 ? (
        <EmptyState title={tr("empty")} />
      ) : (
        <Card testID="exam-sheet">
          {rows.map((row, index) => (
            <View key={row.studentId}>
              {index > 0 ? <Divider /> : null}
              <SheetLine
                row={row}
                number={index + 1}
                exam={exam}
                draft={draft(row)}
                edited={row.studentId in edits}
                mayChange={mayChange}
                problem={checked ? scoreProblem(row) : null}
                onEdit={(patch) => edit(row, patch)}
                onLeave={
                  exam.type === "MOCK" && mayChange
                    ? () => {
                        unregister.reset();
                        setLeaving(row);
                      }
                    : undefined
                }
              />
            </View>
          ))}
        </Card>
      )}

      <ExamFormSheet open={editing} onClose={() => setEditing(false)} exam={exam} />
      <Confirm
        open={deleting}
        onClose={() => setDeleting(false)}
        title={t("exams.deleteTitle")}
        text={t("exams.deleteText", { name: exam.name })}
        label={t("common.delete")}
        loading={remove.isPending}
        problem={remove.error ? errorText(t, remove.error) : null}
        onConfirm={() =>
          remove.mutate(id, {
            onSuccess: () => {
              setDeleting(false);
              router.back();
            },
          })
        }
        testID="exam-delete-confirm"
      />
      <Confirm
        open={leaving !== null}
        onClose={() => setLeaving(null)}
        title={tr("remove")}
        text={leaving?.fullName}
        label={tr("remove")}
        loading={unregister.isPending}
        problem={unregister.error ? errorText(t, unregister.error) : null}
        onConfirm={() => {
          if (!leaving) return;
          const gone = leaving.studentId;
          unregister.mutate(gone, {
            onSuccess: () => {
              setRows(rows.filter((row) => row.studentId !== gone));
              setEdits(({ [gone]: _gone, ...rest }) => rest);
              setLeaving(null);
            },
          });
        }}
        testID="exam-unregister"
      />
    </Screen>
  );
}

function ExamFacts({
  exam,
  registered,
  actions,
}: {
  exam: Exam;
  registered: number;
  actions: ReactNode;
}) {
  const t = useTranslations();
  const tc = useTranslations("exams.columns");
  const tr = useTranslations("exams.results");
  const money = useMoney();
  const when = useExamWhen();
  const mock = exam.type === "MOCK";
  return (
    <Card testID="exam-facts">
      <View style={styles.badges}>
        <Badge label={t(`exams.types.${exam.type}`)} tone="accent" />
        <Badge
          tone={exam.status === "FINISHED" ? "success" : "neutral"}
          label={t(`exams.statuses.${exam.status}`)}
          testID="exam-status"
        />
        {exam.isRetake ? <Badge label={tc("retake")} /> : null}
      </View>
      <Text variant="small" tone="mutedForeground">
        {exam.branchName}
      </Text>
      <View style={styles.facts}>
        <Fact label={tc("date")} value={when(exam)} />
        <Fact
          label={mock ? tc("groups") : tc("group")}
          value={(mock ? exam.groups.map((g) => g.name).join(", ") : exam.groupName) || "—"}
        />
        <Fact label={tc("examiner")} value={exam.examinerName ?? "—"} />
        <Fact label={tc("room")} value={exam.roomName ?? "—"} />
        <Fact
          label={t("exams.form.gradingSystem")}
          value={exam.gradingSystemName ?? t("exams.form.custom")}
        />
        <Fact label={tc("passScore")} value={`${exam.passScore} / ${exam.maxScore}`} />
        {mock ? (
          <>
            <Fact label={tc("price")} value={money(exam.price)} />
            <Fact
              label={tc("capacity")}
              value={
                exam.capacity === null
                  ? "—"
                  : tr("registrations", { count: registered, capacity: exam.capacity })
              }
              testID="exam-capacity-fact"
            />
          </>
        ) : null}
      </View>
      {actions}
    </Card>
  );
}

/** A mock exam's registration: a search by name or phone, and a press registers. */
function RegisterCard({
  exam,
  registered,
  onRegistered,
}: {
  exam: Exam;
  registered: number;
  onRegistered: (rows: SheetRow[]) => void;
}) {
  const t = useTranslations();
  const tr = useTranslations("exams.results");
  const { colors } = useTheme();
  const [typed, setTyped] = useState("");
  const rested = useRested(typed.trim());
  const full = exam.capacity !== null && registered >= exam.capacity;
  // Only what is in the field now is searched for: a cleared field shows no list.
  const q = full || rested !== typed.trim() ? "" : rested;
  const candidates = useExamCandidates(exam.id, q);
  const register = useRegisterForExam(exam.id);
  return (
    <Card testID="exam-register">
      <View style={styles.title}>
        <UserPlus size={18} color={colors.foreground} />
        <Text variant="heading">{tr("register")}</Text>
      </View>
      {full ? (
        <Text tone="mutedForeground" testID="exam-full">
          {tr("full")}
        </Text>
      ) : (
        <Field
          label={tr("search")}
          value={typed}
          onChangeText={(text) => {
            setTyped(text);
            register.reset();
          }}
          autoCorrect={false}
          testID="exam-register-search"
        />
      )}
      {register.error ? (
        <Notice tone="destructive" testID="exam-register-problem">
          {errorText(t, register.error)}
        </Notice>
      ) : null}
      {q.length >= 2 && candidates.data ? (
        candidates.data.length === 0 ? (
          <Text tone="mutedForeground" testID="exam-no-candidates">
            {tr("noCandidates")}
          </Text>
        ) : (
          <View testID="exam-candidates">
            {candidates.data.map((person, index) => (
              <View key={person.id}>
                {index > 0 ? <Divider /> : null}
                <Pressable
                  accessibilityRole="button"
                  disabled={register.isPending}
                  onPress={() =>
                    register.mutate(person.id, {
                      onSuccess: (rows) => {
                        onRegistered(rows);
                        setTyped("");
                      },
                    })
                  }
                  style={({ pressed }) => [
                    styles.candidate,
                    pressed ? { backgroundColor: colors.muted } : null,
                  ]}
                  testID={`exam-candidate-${person.id}`}
                >
                  <View style={styles.fill}>
                    <Text variant="bodyStrong" numberOfLines={1}>
                      {person.fullName}
                    </Text>
                    <Text variant="small" tone="mutedForeground" numberOfLines={1}>
                      {[person.groupName, person.phone].filter(Boolean).join(", ")}
                    </Text>
                  </View>
                </Pressable>
              </View>
            ))}
          </View>
        )
      ) : null}
    </Card>
  );
}

function SheetLine({
  row,
  number,
  exam,
  draft,
  edited,
  mayChange,
  problem,
  onEdit,
  onLeave,
}: {
  row: SheetRow;
  number: number;
  exam: Exam;
  draft: Draft;
  edited: boolean;
  mayChange: boolean;
  problem: string | null;
  onEdit: (patch: Partial<Draft>) => void;
  onLeave?: () => void;
}) {
  const tr = useTranslations("exams.results");
  const { wide } = useLayout();
  const typed = draft.score.trim() === "" ? null : typedScore(draft.score);
  const passed = typed === null ? null : typed >= exam.passScore;
  return (
    <View style={styles.line} testID={`exam-row-${row.studentId}`}>
      <View style={styles.who}>
        <Text tone="mutedForeground" style={styles.number}>
          {number}
        </Text>
        <View style={styles.fill}>
          <Text variant="bodyStrong" numberOfLines={1}>
            {row.fullName}
          </Text>
          <Text variant="small" tone="mutedForeground" numberOfLines={1}>
            {[row.groupName, row.phone, edited ? null : row.level].filter(Boolean).join(", ")}
          </Text>
        </View>
        {!mayChange && row.score !== null ? (
          <Text variant="figure">
            {row.score}/{exam.maxScore}
          </Text>
        ) : null}
        {!draft.isPresent ? (
          <Badge tone="warning" label={tr("absent")} />
        ) : passed === null ? (
          <Badge label={tr("notGraded")} />
        ) : (
          <Badge
            tone={passed ? "success" : "destructive"}
            label={passed ? tr("passed") : tr("failed")}
            testID={`exam-result-${row.studentId}`}
          />
        )}
      </View>
      {mayChange ? (
        <>
          <Check
            label={tr("present")}
            value={draft.isPresent}
            onChange={(isPresent) => onEdit({ isPresent })}
            testID={`exam-present-${row.studentId}`}
          />
          <View style={wide ? styles.pair : styles.stack}>
            <View style={wide ? styles.score : undefined}>
              <Field
                label={tr("score")}
                accessibilityLabel={tr("scoreFor", { name: row.fullName })}
                value={draft.score}
                onChangeText={(score) => onEdit({ score })}
                keyboardType="decimal-pad"
                maxLength={7}
                editable={draft.isPresent}
                error={problem}
                testID={`exam-score-${row.studentId}`}
              />
            </View>
            <View style={wide ? styles.fill : undefined}>
              <Field
                label={tr("comment")}
                value={draft.comment}
                onChangeText={(comment) => onEdit({ comment })}
                maxLength={500}
                testID={`exam-comment-${row.studentId}`}
              />
            </View>
          </View>
          {onLeave ? (
            <Button
              compact
              variant="ghost"
              label={tr("remove")}
              onPress={onLeave}
              style={styles.start}
              testID={`exam-leave-${row.studentId}`}
            />
          ) : null}
        </>
      ) : row.comment ? (
        <Text variant="small" tone="mutedForeground">
          {row.comment}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  column: { gap: space[4], maxWidth: 820 },
  badges: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  facts: { gap: space[2] },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  title: { flexDirection: "row", alignItems: "center", gap: space[2] },
  candidate: {
    flexDirection: "row",
    alignItems: "center",
    minHeight: 48,
    paddingVertical: space[2],
  },
  line: { gap: space[3], paddingVertical: space[3] },
  who: { flexDirection: "row", alignItems: "center", gap: space[3] },
  number: { width: 22 },
  pair: { flexDirection: "row", gap: space[3], alignItems: "flex-start" },
  stack: { gap: space[3] },
  score: { width: 140 },
  start: { alignSelf: "flex-start" },
});
