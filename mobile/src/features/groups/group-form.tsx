import { Plus, X } from "lucide-react-native";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import {
  BILLING_MODES,
  GROUP_STATUSES,
  GROUP_TEACHER_ROLES,
  patternDays,
  SHARE_TYPES,
  useGroupOptions,
  useSaveGroup,
  useSaveSchedule,
  WEEKDAY_PATTERNS,
  WEEKDAYS,
  type Clash,
  type GroupInput,
  type SlotInput,
  type TeacherInput,
} from "@/api/office-groups";
import type {
  BillingMode,
  Group,
  GroupStatus,
  GroupTeacherRole,
  ShareType,
  WeekdayPattern,
} from "@/api/types";
import { Button } from "@/components/button";
import { Check } from "@/components/check";
import { Chip } from "@/components/chip";
import { DateField } from "@/components/date-field";
import { Field } from "@/components/field";
import { Select } from "@/components/select";
import { Sheet } from "@/components/sheet";
import { Notice } from "@/components/surface";
import { Text } from "@/components/text";
import { TimeField } from "@/components/time-field";
import { ApiError } from "@/lib/api";
import { centreToday, weekdayAsDate } from "@/lib/days";
import { fieldErrorOf, hasFieldErrors } from "@/lib/form";
import { errorText, useDate, useTranslations } from "@/lib/i18n";
import { useMe } from "@/lib/session";
import { space, useTheme } from "@/lib/theme";

const MAX_TEACHERS = 3;

interface DayRow {
  weekday: number;
  startTime: string | null;
  endTime: string | null;
  roomId: string | null;
}

interface TeacherRow {
  userId: string | null;
  role: GroupTeacherRole;
  shareType: ShareType;
  shareValue: string;
}

interface FormState {
  branchId: string | null;
  name: string;
  courseId: string | null;
  gradingSystemId: string | null;
  billingMode: BillingMode;
  weekdayPattern: WeekdayPattern;
  customDays: number[];
  perDay: boolean;
  startTime: string | null;
  endTime: string | null;
  roomId: string | null;
  days: DayRow[];
  teachers: TeacherRow[];
  startDate: string | null;
  endDate: string | null;
  status: GroupStatus;
  scheduleFrom: string | null;
  notifySchedule: boolean;
}

function emptyForm(branchId: string | null): FormState {
  return {
    branchId,
    name: "",
    courseId: null,
    gradingSystemId: null,
    billingMode: "MONTHLY",
    weekdayPattern: "EVEN",
    customDays: [],
    perDay: false,
    startTime: "09:00",
    endTime: "10:30",
    roomId: null,
    days: WEEKDAYS.map((weekday) => ({
      weekday,
      startTime: "09:00",
      endTime: "10:30",
      roomId: null,
    })),
    teachers: [],
    startDate: centreToday(),
    endDate: null,
    status: "ACTIVE",
    scheduleFrom: centreToday(),
    notifySchedule: true,
  };
}

function formOf(group: Group): FormState {
  const first = group.slots[0];
  const uniform = group.slots.every(
    (s) =>
      s.startTime === first?.startTime &&
      s.endTime === first?.endTime &&
      s.roomId === first?.roomId,
  );
  return {
    branchId: group.branchId,
    name: group.name,
    courseId: group.courseId,
    gradingSystemId: group.gradingSystemId,
    billingMode: group.billingMode,
    weekdayPattern: group.weekdayPattern,
    customDays: group.slots.map((s) => s.weekday),
    perDay: !uniform,
    startTime: first?.startTime ?? "09:00",
    endTime: first?.endTime ?? "10:30",
    roomId: first?.roomId ?? null,
    days: WEEKDAYS.map((weekday) => {
      const slot = group.slots.find((s) => s.weekday === weekday);
      return {
        weekday,
        startTime: slot?.startTime ?? first?.startTime ?? "09:00",
        endTime: slot?.endTime ?? first?.endTime ?? "10:30",
        roomId: slot?.roomId ?? null,
      };
    }),
    teachers: group.teachers.map((x) => ({
      userId: x.userId,
      role: x.role,
      shareType: x.shareType,
      shareValue: String(x.shareValue),
    })),
    startDate: group.startDate.slice(0, 10),
    endDate: group.endDate.slice(0, 10),
    status: group.status,
    scheduleFrom: centreToday(),
    notifySchedule: true,
  };
}

/** The slots the form describes: one per lesson day; null while a time is not typed out. */
function slotsOf(form: FormState): SlotInput[] | null {
  const slots: SlotInput[] = [];
  for (const weekday of patternDays(form.weekdayPattern, form.customDays)) {
    const row = form.perDay ? form.days.find((d) => d.weekday === weekday) : undefined;
    const startTime = row ? row.startTime : form.startTime;
    const endTime = row ? row.endTime : form.endTime;
    if (!startTime || !endTime) return null;
    slots.push({ weekday, startTime, endTime, roomId: row ? row.roomId : form.roomId });
  }
  return slots;
}

const timesOf = (slots: Array<{ weekday: number; startTime: string; endTime: string }>) =>
  slots.map((s) => `${s.weekday}:${s.startTime}-${s.endTime}`).join("|");

/**
 * "New group", "Edit group" and "Change lesson times" (A-233): the site's
 * form with its rules. One time for every lesson day or a time per day; a
 * running group whose times change asks from which day and whether the
 * students hear of it (A-193); a room or teacher that is already busy is
 * named, and the form can be saved anyway (A-116).
 */
export function GroupFormSheet({
  open,
  onClose,
  group,
  mode = "full",
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  /** The group to change; without it a new one is added. */
  group?: Group | null;
  /** "schedule" shows only the days, times and rooms of an existing group. */
  mode?: "full" | "schedule";
  onSaved?: (group: Group) => void;
}) {
  const t = useTranslations();
  const tg = useTranslations("groups.form");
  const date = useDate();
  const me = useMe();
  const { colors } = useTheme();
  const options = useGroupOptions(open);
  const saveGroup = useSaveGroup(group?.id ?? null);
  const saveSchedule = useSaveSchedule(group?.id ?? "");
  const scheduleOnly = mode === "schedule" && !!group;
  const save = scheduleOnly ? saveSchedule : saveGroup;
  const defaultBranch = me.activeBranch?.id ?? me.branches[0]?.id ?? null;
  const [form, setForm] = useState<FormState>(() =>
    group ? formOf(group) : emptyForm(defaultBranch),
  );
  const [missing, setMissing] = useState(false);
  /* The clash warning belongs to one exact form state: any change hides it again. */
  const [clashState, setClashState] = useState<{ sig: string; clashes: Clash[] } | null>(null);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setForm(group ? formOf(group) : emptyForm(defaultBranch));
      setMissing(false);
      setClashState(null);
      saveGroup.reset();
      saveSchedule.reset();
    }
  }
  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));
  const setDay = (weekday: number, patch: Partial<DayRow>) =>
    setForm((f) => ({
      ...f,
      days: f.days.map((d) => (d.weekday === weekday ? { ...d, ...patch } : d)),
    }));
  const setTeacher = (index: number, patch: Partial<TeacherRow>) =>
    setForm((f) => ({
      ...f,
      teachers: f.teachers.map((row, i) => (i === index ? { ...row, ...patch } : row)),
    }));

  const sig = JSON.stringify(form);
  const clashes = clashState && clashState.sig === sig ? clashState.clashes : null;
  const activeDays = patternDays(form.weekdayPattern, form.customDays);
  const slots = slotsOf(form);
  const timesChanged = !!group && slots !== null && timesOf(slots) !== timesOf(group.slots);
  const running = !!group && group.startDate.slice(0, 10) < centreToday();
  const branchCourses = (options.data?.courses ?? []).filter((c) => c.branchId === form.branchId);
  const branchRooms = (options.data?.rooms ?? []).filter((r) => r.branchId === form.branchId);
  const branchTeachers = (options.data?.teachers ?? []).filter(
    (x) => form.branchId !== null && x.branchIds.includes(form.branchId),
  );
  const weekday = (day: number, style: "short" | "long" = "long") =>
    date(weekdayAsDate(day), { weekday: style });
  const fieldError = fieldErrorOf(t, save.error);
  const required = (empty: boolean) => (missing && empty ? t("validation.required") : null);
  const order = (start: string | null, end: string | null) =>
    missing && start && end && end <= start ? t("validation.workHours") : null;

  const roomSelect = (
    value: string | null,
    onChange: (roomId: string | null) => void,
    testID: string,
    compact = false,
  ) => (
    <Select
      label={tg("room")}
      value={value}
      onChange={onChange}
      clearLabel={tg("noRoom")}
      placeholder={tg("noRoom")}
      options={branchRooms.map((r) => ({ value: r.id, label: r.name }))}
      compact={compact}
      testID={testID}
    />
  );

  const submit = () => {
    const teachers: TeacherInput[] = [];
    for (const row of form.teachers) {
      if (!row.userId) {
        setMissing(true);
        return;
      }
      teachers.push({
        userId: row.userId,
        role: row.role,
        shareType: row.shareType,
        shareValue: Number(row.shareValue.replace(",", ".")) || 0,
      });
    }
    const timesInOrder = (slots ?? []).every((s) => s.endTime > s.startTime);
    if (
      !slots ||
      slots.length === 0 ||
      !timesInOrder ||
      (!scheduleOnly && (!form.name.trim() || !form.courseId || !form.startDate || !form.branchId))
    ) {
      setMissing(true);
      return;
    }
    setMissing(false);
    // "Save anyway" resends the very form the warning was shown for.
    const change = {
      ignoreClashes: clashes !== null,
      ...(timesChanged
        ? {
            ...(running ? { scheduleFrom: form.scheduleFrom ?? centreToday() } : {}),
            notifySchedule: form.notifySchedule,
          }
        : {}),
    };
    const done = {
      onSuccess: (saved: Group) => {
        setClashState(null);
        onClose();
        onSaved?.(saved);
      },
      onError: (error: unknown) => {
        if (
          error instanceof ApiError &&
          error.code === "CONFLICT" &&
          Array.isArray(error.meta?.clashes)
        ) {
          setClashState({ sig, clashes: error.meta.clashes as Clash[] });
        }
      },
    };
    if (scheduleOnly) {
      saveSchedule.mutate({ weekdayPattern: form.weekdayPattern, slots, ...change }, done);
      return;
    }
    const input: GroupInput = {
      branchId: form.branchId ?? undefined,
      name: form.name.trim(),
      courseId: form.courseId ?? "",
      gradingSystemId: form.gradingSystemId,
      billingMode: form.billingMode,
      weekdayPattern: form.weekdayPattern,
      slots,
      teachers,
      startDate: form.startDate ?? "",
      endDate: form.endDate,
      status: form.status,
      ...change,
    };
    saveGroup.mutate(input, done);
  };

  const clashLine = (c: Clash) => {
    const values = {
      day: weekday(c.weekday, "short"),
      start: c.startTime,
      end: c.endTime,
      group: c.groupName,
      room: c.roomName ?? "",
      teacher: c.teacherName ?? "",
    };
    return c.kind === "ROOM" ? tg("clashes.room", values) : tg("clashes.teacher", values);
  };
  const clashShown = clashes !== null;
  const otherProblem =
    save.error && !clashShown && !hasFieldErrors(save.error) ? errorText(t, save.error) : null;

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={scheduleOnly ? tg("scheduleTitle") : group ? tg("edit") : tg("add")}
      testID="group-form"
      footer={
        <Button
          label={clashShown ? tg("clashes.saveAnyway") : t("common.save")}
          loading={save.isPending}
          onPress={submit}
          testID="group-save"
        />
      }
    >
      <View style={styles.form}>
        {clashes ? (
          <Notice tone="destructive" testID="group-clashes">
            {[tg("clashes.title"), ...clashes.map(clashLine), tg("clashes.hint")].join("\n")}
          </Notice>
        ) : null}
        {!scheduleOnly ? (
          <>
            {!group && me.branches.length > 1 ? (
              <Select
                label={t("branch.select")}
                value={form.branchId}
                onChange={(branchId) =>
                  set({ branchId, courseId: null, roomId: null, teachers: [] })
                }
                options={me.branches.map((b) => ({ value: b.id, label: b.name }))}
                error={required(!form.branchId)}
                testID="group-branch"
              />
            ) : null}
            <Field
              label={tg("name")}
              value={form.name}
              onChangeText={(name) => set({ name })}
              maxLength={120}
              error={fieldError("name") ?? required(!form.name.trim())}
              testID="group-name"
            />
            <Select
              label={tg("course")}
              value={form.courseId}
              onChange={(courseId) => set({ courseId })}
              placeholder={tg("pickCourse")}
              options={branchCourses.map((c) => ({ value: c.id, label: c.name }))}
              error={fieldError("courseId") ?? required(!form.courseId)}
              testID="group-course"
            />
            <Select
              label={tg("gradingOverride")}
              value={form.gradingSystemId}
              onChange={(gradingSystemId) => set({ gradingSystemId })}
              clearLabel={tg("useCourseGrading")}
              placeholder={tg("useCourseGrading")}
              options={(options.data?.gradingSystems ?? []).map((g) => ({
                value: g.id,
                label: g.name,
              }))}
              testID="group-grading"
            />
            <View style={styles.tight}>
              <Select
                label={tg("billing")}
                value={form.billingMode}
                onChange={(billingMode) => set({ billingMode: billingMode ?? "MONTHLY" })}
                options={BILLING_MODES.map((m) => ({
                  value: m,
                  label: tg(m === "MONTHLY" ? "billingMonthly" : "billingPackages"),
                }))}
                testID="group-billing"
              />
              <Text variant="small" tone="mutedForeground">
                {tg("billingHint")}
              </Text>
            </View>
          </>
        ) : null}

        <Select
          label={tg("weekdays")}
          value={form.weekdayPattern}
          onChange={(weekdayPattern) => set({ weekdayPattern: weekdayPattern ?? "EVEN" })}
          options={WEEKDAY_PATTERNS.map((p) => ({ value: p, label: t(`groups.patterns.${p}`) }))}
          error={fieldError("slots")}
          testID="group-pattern"
        />
        {form.weekdayPattern === "CUSTOM" ? (
          <View style={styles.tight}>
            <Text variant="smallStrong">{tg("customDays")}</Text>
            <View style={styles.chips}>
              {WEEKDAYS.map((day) => (
                <Chip
                  key={day}
                  label={weekday(day, "short")}
                  on={form.customDays.includes(day)}
                  onPress={() =>
                    set({
                      customDays: form.customDays.includes(day)
                        ? form.customDays.filter((d) => d !== day)
                        : [...form.customDays, day],
                    })
                  }
                  testID={`group-day-${day}`}
                />
              ))}
            </View>
            {missing && activeDays.length === 0 ? (
              <Text variant="small" tone="destructive">
                {t("validation.slotsMin")}
              </Text>
            ) : null}
          </View>
        ) : null}
        <Check
          label={tg("perDay")}
          hint={tg("perDayHint")}
          value={form.perDay}
          onChange={(perDay) => {
            // Each day starts from the common time, so switching on changes nothing by itself.
            if (perDay) {
              set({
                perDay,
                days: form.days.map((d) => ({
                  ...d,
                  startTime: form.startTime,
                  endTime: form.endTime,
                  roomId: form.roomId,
                })),
              });
              return;
            }
            const firstDay = form.days.find((d) => d.weekday === activeDays[0]);
            set({
              perDay,
              startTime: firstDay?.startTime ?? form.startTime,
              endTime: firstDay?.endTime ?? form.endTime,
              roomId: firstDay?.roomId ?? form.roomId,
            });
          }}
          testID="group-per-day"
        />
        {!form.perDay ? (
          <>
            <View style={styles.pair}>
              <View style={styles.fill}>
                <TimeField
                  label={tg("startTime")}
                  value={form.startTime}
                  onChange={(startTime) => set({ startTime })}
                  error={fieldError("slots.0.startTime") ?? required(!form.startTime)}
                  testID="group-start"
                />
              </View>
              <View style={styles.fill}>
                <TimeField
                  label={tg("endTime")}
                  value={form.endTime}
                  onChange={(endTime) => set({ endTime })}
                  error={
                    fieldError("slots.0.endTime") ??
                    required(!form.endTime) ??
                    order(form.startTime, form.endTime)
                  }
                  testID="group-end"
                />
              </View>
            </View>
            {roomSelect(form.roomId, (roomId) => set({ roomId }), "group-room")}
          </>
        ) : (
          activeDays.map((day) => {
            const row = form.days.find((d) => d.weekday === day);
            if (!row) return null;
            return (
              <View
                key={day}
                style={[styles.day, { borderColor: colors.border }]}
                testID={`group-day-row-${day}`}
              >
                <Text variant="bodyStrong">{weekday(day)}</Text>
                <View style={styles.pair}>
                  <View style={styles.fill}>
                    <TimeField
                      label={tg("startTime")}
                      value={row.startTime}
                      onChange={(startTime) => setDay(day, { startTime })}
                      error={required(!row.startTime)}
                      testID={`group-start-${day}`}
                    />
                  </View>
                  <View style={styles.fill}>
                    <TimeField
                      label={tg("endTime")}
                      value={row.endTime}
                      onChange={(endTime) => setDay(day, { endTime })}
                      error={required(!row.endTime) ?? order(row.startTime, row.endTime)}
                      testID={`group-end-${day}`}
                    />
                  </View>
                </View>
                {roomSelect(row.roomId, (roomId) => setDay(day, { roomId }), `group-room-${day}`)}
              </View>
            );
          })
        )}
        {timesChanged ? (
          <View style={styles.tight} testID="group-times-changed">
            {running ? (
              <DateField
                label={tg("scheduleFrom")}
                value={form.scheduleFrom}
                onChange={(scheduleFrom) => set({ scheduleFrom })}
                hint={tg("scheduleFromHint")}
                error={fieldError("scheduleFrom")}
                testID="group-schedule-from"
              />
            ) : null}
            <Check
              label={tg("notifySchedule")}
              value={form.notifySchedule}
              onChange={(notifySchedule) => set({ notifySchedule })}
              testID="group-notify"
            />
          </View>
        ) : null}

        {!scheduleOnly ? (
          <>
            <View style={styles.tight}>
              <Text variant="bodyStrong">{tg("teachers")}</Text>
              {form.teachers.map((row, index) => (
                <View
                  key={index}
                  style={[styles.day, { borderColor: colors.border }]}
                  testID={`group-teacher-row-${index}`}
                >
                  <View style={styles.teacherHead}>
                    <View style={styles.fill}>
                      <Select
                        label={tg("teacher")}
                        value={row.userId}
                        onChange={(userId) => setTeacher(index, { userId })}
                        placeholder={tg("teacher")}
                        options={branchTeachers
                          .filter(
                            (x) =>
                              x.id === row.userId || !form.teachers.some((o) => o.userId === x.id),
                          )
                          .map((x) => ({ value: x.id, label: x.fullName }))}
                        error={fieldError(`teachers.${index}.userId`) ?? required(!row.userId)}
                        testID={`group-teacher-${index}`}
                      />
                    </View>
                    <Pressable
                      onPress={() => set({ teachers: form.teachers.filter((_, i) => i !== index) })}
                      accessibilityRole="button"
                      accessibilityLabel={t("common.remove")}
                      hitSlop={8}
                      style={styles.remove}
                      testID={`group-teacher-remove-${index}`}
                    >
                      <X size={18} color={colors.mutedForeground} />
                    </Pressable>
                  </View>
                  <Select
                    label={tg("teacherRole")}
                    value={row.role}
                    onChange={(role) => setTeacher(index, { role: role ?? "MAIN" })}
                    options={GROUP_TEACHER_ROLES.map((r) => ({
                      value: r,
                      label: t(`groups.teacherRoles.${r}`),
                    }))}
                    testID={`group-teacher-role-${index}`}
                  />
                  <View style={styles.pair}>
                    <View style={styles.fill}>
                      <Select
                        label={tg("shareType")}
                        value={row.shareType}
                        onChange={(shareType) =>
                          setTeacher(index, { shareType: shareType ?? "PERCENT" })
                        }
                        options={SHARE_TYPES.map((s) => ({
                          value: s,
                          label: t(`groups.shareTypes.${s}`),
                        }))}
                        testID={`group-share-type-${index}`}
                      />
                    </View>
                    <View style={styles.fill}>
                      <Field
                        label={tg("shareValue")}
                        value={row.shareValue}
                        onChangeText={(text) =>
                          setTeacher(index, { shareValue: text.replace(/[^\d.,]/g, "") })
                        }
                        keyboardType="decimal-pad"
                        maxLength={14}
                        error={fieldError(`teachers.${index}.shareValue`)}
                        testID={`group-share-${index}`}
                      />
                    </View>
                  </View>
                </View>
              ))}
              {fieldError("teachers") ? (
                <Text variant="small" tone="destructive">
                  {fieldError("teachers")}
                </Text>
              ) : null}
              {form.teachers.length < MAX_TEACHERS ? (
                <Button
                  variant="ghost"
                  compact
                  icon={<Plus size={16} color={colors.primary} />}
                  label={tg("addTeacher")}
                  onPress={() =>
                    set({
                      teachers: [
                        ...form.teachers,
                        {
                          userId: null,
                          role: form.teachers.length === 0 ? "MAIN" : "ASSISTANT",
                          shareType: "PERCENT",
                          shareValue: "0",
                        },
                      ],
                    })
                  }
                  style={styles.start}
                  testID="group-teacher-add"
                />
              ) : null}
            </View>
            <View style={styles.pair}>
              <View style={styles.fill}>
                <DateField
                  label={tg("startDate")}
                  value={form.startDate}
                  onChange={(startDate) => set({ startDate })}
                  error={fieldError("startDate") ?? required(!form.startDate)}
                  testID="group-start-date"
                />
              </View>
              <View style={styles.fill}>
                <DateField
                  label={tg("endDate")}
                  value={form.endDate}
                  onChange={(endDate) => set({ endDate })}
                  error={fieldError("endDate")}
                  testID="group-end-date"
                />
              </View>
            </View>
            <Text variant="small" tone="mutedForeground">
              {tg("endDateHint")}
            </Text>
            {group ? (
              <Select
                label={t("common.status")}
                value={form.status}
                onChange={(status) => set({ status: status ?? "ACTIVE" })}
                options={GROUP_STATUSES.map((s) => ({
                  value: s,
                  label: t(`groups.statuses.${s}`),
                }))}
                testID="group-status"
              />
            ) : null}
          </>
        ) : null}
        {options.error ? <Notice tone="destructive">{errorText(t, options.error)}</Notice> : null}
        {otherProblem ? (
          <Notice tone="destructive" testID="group-problem">
            {otherProblem}
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
  pair: { flexDirection: "row", gap: space[3], alignItems: "flex-start" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  day: { gap: space[3], borderWidth: 1, borderRadius: 12, padding: space[3] },
  teacherHead: { flexDirection: "row", alignItems: "flex-start", gap: space[2] },
  remove: { marginTop: 34 },
  start: { alignSelf: "flex-start" },
});
