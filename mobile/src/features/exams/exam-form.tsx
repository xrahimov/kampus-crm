import { ChevronDown, ChevronRight } from "lucide-react-native";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import {
  useExamOptions,
  useSaveExam,
  type Exam,
  type ExamOptions,
  type ExamType,
} from "@/api/office-exams";
import { Button } from "@/components/button";
import { Check } from "@/components/check";
import { Chip } from "@/components/chip";
import { DateField } from "@/components/date-field";
import { Field } from "@/components/field";
import { Select } from "@/components/select";
import { Sheet } from "@/components/sheet";
import { Loading, Notice, Segmented } from "@/components/surface";
import { Text } from "@/components/text";
import { TimeField } from "@/components/time-field";
import { typedMoney } from "@/features/office/payment-sheet";
import { centreToday } from "@/lib/days";
import { fieldErrorOf, hasFieldErrors } from "@/lib/form";
import { errorText, useTranslations } from "@/lib/i18n";
import { useMe } from "@/lib/session";
import { radius, space, useTheme } from "@/lib/theme";

interface FormState {
  type: ExamType;
  name: string;
  groupId: string | null;
  isRetake: boolean;
  groupIds: string[];
  price: string;
  capacity: string;
  date: string | null;
  startTime: string | null;
  endTime: string | null;
  examinerId: string | null;
  roomId: string | null;
  gradingSystemId: string | null;
  passScore: string;
  maxScore: string;
}

/** How the groups a mock exam may take are narrowed down before they are ticked. */
interface Narrow {
  courseId: string | null;
  allBranches: boolean;
  branchIds: string[];
  minMonths: string;
}

const NO_NARROW: Narrow = { courseId: null, allBranches: true, branchIds: [], minMonths: "" };

function emptyForm(type: ExamType, groupId: string | null): FormState {
  return {
    type,
    name: "",
    groupId,
    isRetake: false,
    groupIds: [],
    price: "",
    capacity: "",
    date: centreToday(),
    startTime: "09:00",
    endTime: "10:00",
    examinerId: null,
    roomId: null,
    gradingSystemId: null,
    passScore: "",
    maxScore: "",
  };
}

function formOf(exam: Exam): FormState {
  return {
    type: exam.type,
    name: exam.name,
    groupId: exam.groupId,
    isRetake: exam.isRetake,
    groupIds: exam.groups.map((g) => g.id),
    price: exam.price ? String(exam.price) : "",
    capacity: exam.capacity === null ? "" : String(exam.capacity),
    date: exam.date,
    startTime: exam.startTime,
    endTime: exam.endTime,
    examinerId: exam.examinerId,
    roomId: exam.roomId,
    gradingSystemId: exam.gradingSystemId,
    passScore: String(exam.passScore),
    maxScore: String(exam.maxScore),
  };
}

/** A score as typed ("7.5" or "7,5"), or null when it is not a number from 0 to 9999. */
export function typedScore(text: string): number | null {
  const bare = text.trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(bare)) return null;
  const value = Number(bare);
  return value <= 9999 ? value : null;
}

/** Whole months between the day a group started and today. */
export function monthsStudied(startDate: string, today: string): number {
  const [sy = 0, sm = 0, sd = 0] = startDate.slice(0, 10).split("-").map(Number);
  const [ty = 0, tm = 0, td = 0] = today.split("-").map(Number);
  return Math.max(0, (ty - sy) * 12 + tm - sm - (td < sd ? 1 : 0));
}

/**
 * A new exam or a change to one (A-235), as the site's exam form: a group's
 * own exam (its group, a retake or not) or a mock exam (a price, the groups it
 * is for, how many may register), then the day and time, an examiner and a
 * room if wanted, the grading system and the pass and maximum scores. On a
 * group's page the group is given and the kind is fixed.
 */
export function ExamFormSheet({
  open,
  onClose,
  exam,
  fixedGroupId,
  defaultType = "GROUP",
}: {
  open: boolean;
  onClose: () => void;
  exam?: Exam;
  fixedGroupId?: string;
  defaultType?: ExamType;
}) {
  const t = useTranslations();
  const tf = useTranslations("exams.form");
  const me = useMe();
  const { colors } = useTheme();
  const save = useSaveExam(exam?.id ?? null);
  const options = useExamOptions(open);
  const first = () =>
    exam ? formOf(exam) : emptyForm(fixedGroupId ? "GROUP" : defaultType, fixedGroupId ?? null);
  const [form, setForm] = useState<FormState>(first);
  const [narrow, setNarrow] = useState<Narrow>(NO_NARROW);
  const [more, setMore] = useState(!!(exam?.examinerId || exam?.roomId));
  const [missing, setMissing] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setForm(first());
      setNarrow(NO_NARROW);
      setMore(!!(exam?.examinerId || exam?.roomId));
      setMissing(false);
      save.reset();
    }
  }
  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));
  const fieldError = fieldErrorOf(t, save.error);
  const required = (empty: boolean) => (missing && empty ? t("validation.required") : null);

  const data: ExamOptions = options.data ?? {
    groups: [],
    courses: [],
    rooms: [],
    gradingSystems: [],
    examiners: [],
  };
  const openGroups = data.groups.filter((g) => g.status !== "ARCHIVED");
  const mock = form.type === "MOCK";
  // Rooms follow the branch of the chosen group (or of the first group of a mock exam).
  const branchId = data.groups.find(
    (g) => g.id === (mock ? form.groupIds[0] : form.groupId),
  )?.branchId;
  const rooms = branchId ? data.rooms.filter((r) => r.branchId === branchId) : data.rooms;

  const today = centreToday();
  const minMonths = Number(narrow.minMonths) || 0;
  const narrowed = openGroups.filter(
    (g) =>
      (narrow.courseId === null || g.courseId === narrow.courseId) &&
      (narrow.allBranches || narrow.branchIds.includes(g.branchId)) &&
      monthsStudied(g.startDate, today) >= minMonths,
  );
  const shown = data.groups.filter((g) => narrowed.includes(g) || form.groupIds.includes(g.id));

  const pass = typedScore(form.passScore);
  const max = typedScore(form.maxScore);
  const capacity = form.capacity.trim() === "" ? null : Number(form.capacity);
  const capacityWrong =
    capacity !== null && (!/^\d+$/.test(form.capacity.trim()) || capacity < 1 || capacity > 10_000);
  const timesWrong = !!form.startTime && !!form.endTime && form.endTime <= form.startTime;
  const passAboveMax = pass !== null && max !== null && pass > max;

  const submit = () => {
    if (
      !form.name.trim() ||
      !form.date ||
      !form.startTime ||
      !form.endTime ||
      timesWrong ||
      pass === null ||
      max === null ||
      passAboveMax ||
      (mock ? form.groupIds.length === 0 || capacityWrong : !form.groupId)
    ) {
      setMissing(true);
      return;
    }
    save.mutate(
      {
        type: form.type,
        name: form.name.trim(),
        groupId: mock ? null : form.groupId,
        isRetake: mock ? false : form.isRetake,
        groupIds: mock ? form.groupIds : [],
        price: mock && form.price.trim() ? typedMoney(form.price) : 0,
        capacity: mock ? capacity : null,
        date: form.date,
        startTime: form.startTime,
        endTime: form.endTime,
        examinerId: form.examinerId,
        roomId: form.roomId,
        gradingSystemId: form.gradingSystemId,
        passScore: pass,
        maxScore: max,
      },
      { onSuccess: onClose },
    );
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={exam ? t("exams.edit") : t("exams.add")}
      testID="exam-form"
      footer={
        <Button
          label={t("common.save")}
          loading={save.isPending}
          disabled={!options.data}
          onPress={submit}
          testID="exam-save"
        />
      }
    >
      {options.isLoading ? (
        <Loading />
      ) : !options.data ? (
        <Notice tone="destructive" testID="exam-options-problem">
          {errorText(t, options.error)}
        </Notice>
      ) : (
        <View style={styles.form}>
          {save.error && !hasFieldErrors(save.error) ? (
            <Notice tone="destructive" testID="exam-problem">
              {errorText(t, save.error)}
            </Notice>
          ) : null}
          {!fixedGroupId && !exam ? (
            <Segmented
              options={[
                { value: "GROUP" as const, label: t("exams.types.GROUP") },
                { value: "MOCK" as const, label: t("exams.types.MOCK") },
              ]}
              value={form.type}
              onChange={(type) => set({ type })}
              testID="exam-type"
            />
          ) : null}
          <Field
            label={tf("name")}
            value={form.name}
            onChangeText={(name) => set({ name })}
            maxLength={120}
            error={fieldError("name") ?? required(!form.name.trim())}
            testID="exam-name"
          />

          {mock ? (
            <>
              <Field
                label={tf("price")}
                value={form.price}
                onChangeText={(price) => set({ price })}
                keyboardType="number-pad"
                hint={tf("priceHint")}
                error={fieldError("price")}
                testID="exam-price"
              />
              <View style={[styles.box, { borderColor: colors.border }]}>
                <Text variant="smallStrong">{tf("pick")}</Text>
                <Select
                  label={tf("course")}
                  value={narrow.courseId}
                  onChange={(courseId) => setNarrow((n) => ({ ...n, courseId }))}
                  clearLabel={tf("anyCourse")}
                  placeholder={tf("anyCourse")}
                  options={data.courses.map((c) => ({ value: c.id, label: c.name }))}
                  testID="exam-pick-course"
                />
                <Field
                  label={tf("minMonths")}
                  value={narrow.minMonths}
                  onChangeText={(minMonths) => setNarrow((n) => ({ ...n, minMonths }))}
                  keyboardType="number-pad"
                  maxLength={3}
                  testID="exam-pick-months"
                />
                {me.branches.length > 1 ? (
                  <>
                    <Check
                      label={tf("allBranches")}
                      value={narrow.allBranches}
                      onChange={(allBranches) => setNarrow((n) => ({ ...n, allBranches }))}
                      testID="exam-pick-all-branches"
                    />
                    {narrow.allBranches ? null : (
                      <View style={styles.chips}>
                        {me.branches.map((b) => {
                          const on = narrow.branchIds.includes(b.id);
                          return (
                            <Chip
                              key={b.id}
                              label={b.name}
                              on={on}
                              onPress={() =>
                                setNarrow((n) => ({
                                  ...n,
                                  branchIds: on
                                    ? n.branchIds.filter((x) => x !== b.id)
                                    : [...n.branchIds, b.id],
                                }))
                              }
                              testID={`exam-pick-branch-${b.id}`}
                            />
                          );
                        })}
                      </View>
                    )}
                  </>
                ) : null}
                <Button
                  compact
                  variant="outline"
                  label={tf("pickAll")}
                  onPress={() =>
                    set({
                      groupIds: Array.from(
                        new Set([...form.groupIds, ...narrowed.map((g) => g.id)]),
                      ),
                    })
                  }
                  style={styles.start}
                  testID="exam-pick-all"
                />
              </View>
              <View style={styles.block}>
                <Text variant="smallStrong" testID="exam-picked">
                  {tf("selected")}: {tf("selectedCount", { count: form.groupIds.length })}
                </Text>
                {shown.length === 0 ? (
                  <Text tone="mutedForeground" testID="exam-no-groups">
                    {tf("noGroups")}
                  </Text>
                ) : (
                  <View testID="exam-groups">
                    {shown.map((g) => {
                      const on = form.groupIds.includes(g.id);
                      return (
                        <Check
                          key={g.id}
                          label={g.name}
                          hint={g.courseName}
                          value={on}
                          onChange={() =>
                            set({
                              groupIds: on
                                ? form.groupIds.filter((x) => x !== g.id)
                                : [...form.groupIds, g.id],
                            })
                          }
                          testID={`exam-group-${g.id}`}
                        />
                      );
                    })}
                  </View>
                )}
                {(fieldError("groupIds") ??
                (missing && form.groupIds.length === 0 ? t("validation.groupsMin") : null)) ? (
                  <Text variant="small" tone="destructive" testID="exam-groups-error">
                    {fieldError("groupIds") ?? t("validation.groupsMin")}
                  </Text>
                ) : null}
              </View>
              <Field
                label={tf("capacity")}
                value={form.capacity}
                onChangeText={(text) => set({ capacity: text })}
                keyboardType="number-pad"
                maxLength={5}
                error={
                  fieldError("capacity") ?? (missing && capacityWrong ? t("validation.min") : null)
                }
                testID="exam-capacity"
              />
            </>
          ) : (
            <>
              {fixedGroupId ? null : (
                <Select
                  label={tf("group")}
                  value={form.groupId}
                  onChange={(groupId) => set({ groupId })}
                  options={openGroups.map((g) => ({
                    value: g.id,
                    label: g.name,
                    note: g.courseName,
                  }))}
                  error={fieldError("groupId") ?? required(!form.groupId)}
                  testID="exam-group"
                />
              )}
              <Check
                label={tf("retake")}
                value={form.isRetake}
                onChange={(isRetake) => set({ isRetake })}
                testID="exam-retake"
              />
            </>
          )}

          <DateField
            label={tf("date")}
            value={form.date}
            onChange={(date) => set({ date })}
            error={fieldError("date") ?? required(!form.date)}
            testID="exam-date"
          />
          <View style={styles.pair}>
            <View style={styles.fill}>
              <TimeField
                label={tf("startTime")}
                value={form.startTime}
                onChange={(startTime) => set({ startTime })}
                error={fieldError("startTime") ?? required(!form.startTime)}
                testID="exam-start"
              />
            </View>
            <View style={styles.fill}>
              <TimeField
                label={tf("endTime")}
                value={form.endTime}
                onChange={(endTime) => set({ endTime })}
                error={
                  fieldError("endTime") ??
                  required(!form.endTime) ??
                  (missing && timesWrong ? t("validation.workHours") : null)
                }
                testID="exam-end"
              />
            </View>
          </View>

          <Pressable
            accessibilityRole="button"
            accessibilityState={{ expanded: more }}
            onPress={() => setMore((was) => !was)}
            style={styles.more}
            testID="exam-more"
          >
            {more ? (
              <ChevronDown size={18} color={colors.foreground} />
            ) : (
              <ChevronRight size={18} color={colors.foreground} />
            )}
            <Text variant="bodyStrong">{tf("more")}</Text>
          </Pressable>
          {more ? (
            <>
              <Select
                label={tf("examiner")}
                value={form.examinerId}
                onChange={(examinerId) => set({ examinerId })}
                clearLabel={tf("none")}
                placeholder={tf("none")}
                options={data.examiners.map((e) => ({ value: e.id, label: e.fullName }))}
                error={fieldError("examinerId")}
                testID="exam-examiner"
              />
              <Select
                label={tf("room")}
                value={form.roomId}
                onChange={(roomId) => set({ roomId })}
                clearLabel={tf("none")}
                placeholder={tf("none")}
                options={rooms.map((r) => ({ value: r.id, label: r.name }))}
                error={fieldError("roomId")}
                testID="exam-room"
              />
            </>
          ) : null}

          <Select
            label={tf("gradingSystem")}
            value={form.gradingSystemId}
            onChange={(gradingSystemId) => set({ gradingSystemId })}
            clearLabel={tf("custom")}
            placeholder={tf("custom")}
            options={data.gradingSystems.map((g) => ({ value: g.id, label: g.name }))}
            testID="exam-grading"
          />
          <View style={styles.pair}>
            <View style={styles.fill}>
              <Field
                label={tf("passScore")}
                value={form.passScore}
                onChangeText={(passScore) => set({ passScore })}
                keyboardType="decimal-pad"
                maxLength={7}
                error={
                  fieldError("passScore") ??
                  (missing && pass === null
                    ? t("validation.required")
                    : missing && passAboveMax
                      ? t("validation.passScore")
                      : null)
                }
                testID="exam-pass"
              />
            </View>
            <View style={styles.fill}>
              <Field
                label={tf("maxScore")}
                value={form.maxScore}
                onChangeText={(maxScore) => set({ maxScore })}
                keyboardType="decimal-pad"
                maxLength={7}
                error={
                  fieldError("maxScore") ??
                  (missing && max === null ? t("validation.required") : null)
                }
                testID="exam-max"
              />
            </View>
          </View>
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  form: { gap: space[4] },
  fill: { flex: 1 },
  pair: { flexDirection: "row", gap: space[3], alignItems: "flex-start" },
  block: { gap: space[2] },
  box: { gap: space[3], borderWidth: 1, borderRadius: radius.md, padding: space[3] },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  start: { alignSelf: "flex-start" },
  more: { flexDirection: "row", alignItems: "center", gap: space[2], minHeight: 44 },
});
