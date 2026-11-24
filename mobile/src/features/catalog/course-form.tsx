import { Check as Tick } from "lucide-react-native";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import {
  DEFAULT_GRADE_WEIGHTS,
  GRADE_PARTS,
  useGradingSystems,
  useSaveCourse,
  useSaveSyllabus,
  useSyllabus,
  type Course,
  type GradePart,
} from "@/api/office-catalog";
import { Button } from "@/components/button";
import { Field } from "@/components/field";
import { Select } from "@/components/select";
import { Sheet } from "@/components/sheet";
import { Loading, Notice } from "@/components/surface";
import { Text } from "@/components/text";
import { typedMoney } from "@/features/office/payment-sheet";
import { fieldErrorOf, hasFieldErrors } from "@/lib/form";
import { errorText, useTranslations } from "@/lib/i18n";
import { useMe } from "@/lib/session";
import { space, useTheme } from "@/lib/theme";

/** The colours a course may take in the app; the site's picker takes any. */
export const COURSE_COLORS = [
  "#0F766E",
  "#0E7490",
  "#1D4ED8",
  "#6D28D9",
  "#BE185D",
  "#B91C1C",
  "#C2410C",
  "#A16207",
  "#15803D",
  "#475569",
] as const;

interface FormState {
  branchId: string | null;
  name: string;
  description: string;
  price: string;
  durationMonths: string;
  gradingSystemId: string | null;
  color: string;
  weights: Record<GradePart, string>;
}

const asText = (weights: Record<GradePart, number>): Record<GradePart, string> => ({
  lessons: String(weights.lessons),
  homework: String(weights.homework),
  exercises: String(weights.exercises),
  tests: String(weights.tests),
  exams: String(weights.exams),
});

function emptyForm(branchId: string | null): FormState {
  return {
    branchId,
    name: "",
    description: "",
    price: "",
    durationMonths: "1",
    gradingSystemId: null,
    color: COURSE_COLORS[0],
    weights: asText(DEFAULT_GRADE_WEIGHTS),
  };
}

function formOf(course: Course): FormState {
  return {
    branchId: course.branchId,
    name: course.name,
    description: course.description ?? "",
    price: String(course.price),
    durationMonths: String(course.durationMonths),
    gradingSystemId: course.gradingSystemId,
    color: course.color ?? COURSE_COLORS[0],
    weights: asText(course.gradeWeights ?? DEFAULT_GRADE_WEIGHTS),
  };
}

/** A whole number typed into a field, or null. */
const whole = (text: string): number | null => (/^\d+$/.test(text.trim()) ? Number(text) : null);

/**
 * A new course or a change to one (A-234), as on the site's Settings →
 * Courses: its branch (only when new), name, notes, monthly price, length,
 * grading system, colour, and how much each part counts in the final grade.
 */
export function CourseFormSheet({
  open,
  onClose,
  course,
}: {
  open: boolean;
  onClose: () => void;
  course?: Course;
}) {
  const t = useTranslations();
  const tc = useTranslations("settings.courses");
  const me = useMe();
  const { colors } = useTheme();
  const save = useSaveCourse(course?.id ?? null);
  const grading = useGradingSystems(open);
  const defaultBranch = me.activeBranch?.id ?? me.branches[0]?.id ?? null;
  const [form, setForm] = useState<FormState>(() =>
    course ? formOf(course) : emptyForm(defaultBranch),
  );
  const [missing, setMissing] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setForm(course ? formOf(course) : emptyForm(defaultBranch));
      setMissing(false);
      save.reset();
    }
  }
  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));
  const fieldError = fieldErrorOf(t, save.error);
  const required = (empty: boolean) => (missing && empty ? t("validation.required") : null);
  const months = whole(form.durationMonths);
  const monthsWrong = months === null || months < 1 || months > 60;
  const weights = GRADE_PARTS.map((part) => whole(form.weights[part]));
  const sum = weights.reduce<number>((total, w) => total + (w ?? 0), 0);
  const weightsWrong = weights.some((w) => w === null || w > 100) || sum !== 100;
  // A colour set on the site that is not one of the app's stays a choice.
  const palette: string[] = COURSE_COLORS.some((c) => c.toLowerCase() === form.color.toLowerCase())
    ? [...COURSE_COLORS]
    : [form.color, ...COURSE_COLORS];

  const submit = () => {
    if (!form.branchId || !form.name.trim() || !form.price.trim() || monthsWrong || weightsWrong) {
      setMissing(true);
      return;
    }
    save.mutate(
      {
        branchId: form.branchId,
        name: form.name.trim(),
        description: form.description.trim(),
        price: typedMoney(form.price),
        durationMonths: months,
        gradingSystemId: form.gradingSystemId,
        color: form.color,
        gradeWeights: {
          lessons: weights[0] ?? 0,
          homework: weights[1] ?? 0,
          exercises: weights[2] ?? 0,
          tests: weights[3] ?? 0,
          exams: weights[4] ?? 0,
        },
      },
      { onSuccess: onClose },
    );
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={course ? tc("edit") : tc("add")}
      testID="course-form"
      footer={
        <Button
          label={t("common.save")}
          loading={save.isPending}
          onPress={submit}
          testID="course-save"
        />
      }
    >
      <View style={styles.form}>
        {save.error && !hasFieldErrors(save.error) ? (
          <Notice tone="destructive" testID="course-problem">
            {errorText(t, save.error)}
          </Notice>
        ) : null}
        {!course && me.branches.length > 1 ? (
          <Select
            label={t("branch.select")}
            value={form.branchId}
            onChange={(branchId) => set({ branchId })}
            options={me.branches.map((b) => ({ value: b.id, label: b.name }))}
            error={fieldError("branchId") ?? required(!form.branchId)}
            testID="course-branch"
          />
        ) : null}
        <Field
          label={tc("name")}
          value={form.name}
          onChangeText={(name) => set({ name })}
          maxLength={120}
          error={fieldError("name") ?? required(!form.name.trim())}
          testID="course-name"
        />
        <Field
          label={tc("description")}
          value={form.description}
          onChangeText={(description) => set({ description })}
          multiline
          error={fieldError("description")}
          testID="course-notes"
        />
        <View style={styles.pair}>
          <View style={styles.fill}>
            <Field
              label={tc("price")}
              value={form.price}
              onChangeText={(price) => set({ price })}
              keyboardType="number-pad"
              error={fieldError("price") ?? required(!form.price.trim())}
              testID="course-price"
            />
          </View>
          <View style={styles.fill}>
            <Field
              label={tc("durationMonths")}
              value={form.durationMonths}
              onChangeText={(durationMonths) => set({ durationMonths })}
              keyboardType="number-pad"
              maxLength={2}
              error={
                fieldError("durationMonths") ??
                (missing && monthsWrong
                  ? t(months !== null && months > 60 ? "validation.max" : "validation.min")
                  : null)
              }
              testID="course-months"
            />
          </View>
        </View>
        <Select
          label={tc("gradingSystem")}
          value={form.gradingSystemId}
          onChange={(gradingSystemId) => set({ gradingSystemId })}
          clearLabel={tc("noGradingSystem")}
          placeholder={tc("noGradingSystem")}
          options={(grading.data?.items ?? []).map((g) => ({ value: g.id, label: g.name }))}
          testID="course-grading"
        />
        <View style={styles.block}>
          <Text variant="smallStrong">{tc("color")}</Text>
          <View style={styles.colors}>
            {palette.map((color, index) => {
              const on = color.toLowerCase() === form.color.toLowerCase();
              return (
                <Pressable
                  key={color}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={t("mobile.catalog.colorChoice", { number: index + 1 })}
                  onPress={() => set({ color })}
                  style={[
                    styles.color,
                    { backgroundColor: color, borderColor: on ? colors.foreground : color },
                  ]}
                  testID={`course-color-${color.slice(1).toLowerCase()}`}
                >
                  {on ? <Tick size={18} color="#FFFFFF" /> : null}
                </Pressable>
              );
            })}
          </View>
        </View>
        <View style={styles.block} testID="course-weights">
          <Text variant="smallStrong">{tc("weights.title")}</Text>
          <Text variant="small" tone="mutedForeground">
            {tc("weights.hint")}
          </Text>
          <View style={styles.weights}>
            {GRADE_PARTS.map((part) => (
              <View key={part} style={styles.weight}>
                <Field
                  label={tc(`weights.${part}`)}
                  value={form.weights[part]}
                  onChangeText={(text) => set({ weights: { ...form.weights, [part]: text } })}
                  keyboardType="number-pad"
                  maxLength={3}
                  testID={`course-weight-${part}`}
                />
              </View>
            ))}
          </View>
          <Text
            variant="small"
            style={{ color: sum === 100 ? colors.mutedForeground : colors.destructive }}
            testID="course-weights-sum"
          >
            {tc("weights.sum", { sum })}
          </Text>
          {fieldError("gradeWeights") ? (
            <Text variant="small" style={{ color: colors.destructive }}>
              {fieldError("gradeWeights")}
            </Text>
          ) : null}
        </View>
      </View>
    </Sheet>
  );
}

/**
 * A course's syllabus (A-137): one topic a line, in teaching order, as the
 * site's dialog has it. Saving replaces the whole list.
 */
export function SyllabusSheet({ course, onClose }: { course: Course | null; onClose: () => void }) {
  const t = useTranslations();
  const tc = useTranslations("settings.courses");
  // The sheet keeps the course it was opened for while it slides away.
  const [shown, setShown] = useState(course);
  if (course && course !== shown) setShown(course);
  const query = useSyllabus(course?.id ?? null);
  const save = useSaveSyllabus(shown?.id ?? "");
  // What was typed, for the course it was typed for; until then the server's list.
  const [typed, setTyped] = useState<{ courseId: string; text: string } | null>(null);
  const [wasOpen, setWasOpen] = useState(course !== null);
  if ((course !== null) !== wasOpen) {
    setWasOpen(course !== null);
    if (course !== null) {
      setTyped(null);
      save.reset();
    }
  }
  const loaded = query.data ? query.data.map((topic) => topic.title).join("\n") : null;
  const text = typed && typed.courseId === course?.id ? typed.text : (loaded ?? "");
  const lines = text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  return (
    <Sheet
      open={course !== null}
      onClose={onClose}
      title={tc("syllabusTitle", { name: shown?.name ?? "" })}
      testID="syllabus"
      footer={
        <Button
          label={t("common.save")}
          loading={save.isPending}
          disabled={loaded === null}
          onPress={() =>
            save.mutate(
              lines.map((line) => line.slice(0, 200)),
              { onSuccess: onClose },
            )
          }
          testID="syllabus-save"
        />
      }
    >
      <View style={styles.form}>
        {save.error ? (
          <Notice tone="destructive" testID="syllabus-problem">
            {errorText(t, save.error)}
          </Notice>
        ) : null}
        <Text variant="small" tone="mutedForeground">
          {tc("syllabusHint")}
        </Text>
        {query.isLoading ? (
          <Loading />
        ) : loaded === null ? (
          <Notice tone="destructive">{errorText(t, query.error)}</Notice>
        ) : (
          <>
            <Field
              label={tc("syllabusTopics")}
              value={text}
              onChangeText={(next) => course && setTyped({ courseId: course.id, text: next })}
              multiline
              numberOfLines={10}
              style={styles.topics}
              testID="syllabus-topics"
            />
            <Text variant="small" tone="mutedForeground" testID="syllabus-count">
              {tc("syllabusCount", { count: lines.length })}
            </Text>
          </>
        )}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  form: { gap: space[4] },
  block: { gap: space[2] },
  pair: { flexDirection: "row", gap: space[3], alignItems: "flex-start" },
  fill: { flex: 1 },
  colors: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  color: {
    width: 40,
    height: 40,
    borderRadius: 20,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  weights: {
    flexDirection: "row",
    flexWrap: "wrap",
    marginHorizontal: -space[1],
    rowGap: space[2],
  },
  weight: { width: "33.33%", paddingHorizontal: space[1] },
  topics: { minHeight: 200, textAlignVertical: "top" },
});
