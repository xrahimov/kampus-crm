import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { useStudentOptions } from "@/api/office-students";
import {
  GROUP_STATUS_FILTERS,
  PAYMENT_STATUS_FILTERS,
  type StudentFilters,
} from "@/api/staff-students";
import { Button } from "@/components/button";
import { Check } from "@/components/check";
import { Select } from "@/components/select";
import { Sheet } from "@/components/sheet";
import { useTranslations } from "@/lib/i18n";
import { space } from "@/lib/theme";

/** The filters a site address carries ("/students?paymentStatus=DEBTOR"), as the app's own. */
export function filtersFromParams(
  params: Record<string, string | string[] | undefined>,
): StudentFilters {
  const one = (key: string) => {
    const value = params[key];
    return typeof value === "string" && value ? value : undefined;
  };
  const filters: StudentFilters = {};
  const payment = one("paymentStatus");
  if ((PAYMENT_STATUS_FILTERS as readonly string[]).includes(payment ?? "")) {
    filters.paymentStatus = payment as StudentFilters["paymentStatus"];
  }
  const group = one("groupStatus");
  if ((GROUP_STATUS_FILTERS as readonly string[]).includes(group ?? "")) {
    filters.groupStatus = group as StudentFilters["groupStatus"];
  }
  if (one("archived") === "true") filters.archived = true;
  for (const key of ["courseId", "schoolId", "groupId", "teacherId"] as const) {
    const value = one(key);
    if (value) filters[key] = value;
  }
  return filters;
}

/**
 * The site's filters over the students list (A-231), in one sheet: payment
 * status, status in the group, course, group, teacher, school (A-265, where
 * the centre has schools), and the archive.
 * Nothing changes in the list until **Show** is pressed.
 */
export function StudentFilterSheet({
  open,
  onClose,
  value,
  onChange,
}: {
  open: boolean;
  onClose: () => void;
  value: StudentFilters;
  onChange: (filters: StudentFilters) => void;
}) {
  const t = useTranslations();
  const tf = useTranslations("students.filters");
  const tm = useTranslations("mobile.office");
  const options = useStudentOptions(open);
  const [draft, setDraft] = useState(value);
  // Each opening starts from what the list shows now.
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setDraft(value);
  }
  const set = (change: Partial<StudentFilters>) => setDraft((old) => ({ ...old, ...change }));
  const groups = (options.data?.groups ?? []).filter(
    (g) => !draft.courseId || g.courseId === draft.courseId,
  );
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={tm("filters")}
      testID="student-filters"
      footer={
        <View style={styles.footer}>
          <Button
            variant="outline"
            label={tm("clearFilters")}
            onPress={() => {
              onChange({});
              onClose();
            }}
            style={styles.fill}
            testID="filters-clear"
          />
          <Button
            label={tm("showResults")}
            onPress={() => {
              onChange(draft);
              onClose();
            }}
            style={styles.fill}
            testID="filters-apply"
          />
        </View>
      }
    >
      <View style={styles.form}>
        <Select
          label={tf("paymentStatus")}
          value={draft.paymentStatus ?? null}
          onChange={(v) => set({ paymentStatus: v ?? undefined })}
          clearLabel={tf("all")}
          options={PAYMENT_STATUS_FILTERS.map((key) => ({
            value: key,
            label: t(`students.paymentStatusFilters.${key}`),
          }))}
          testID="filter-payment"
        />
        <Select
          label={tf("groupStatus")}
          value={draft.groupStatus ?? null}
          onChange={(v) => set({ groupStatus: v ?? undefined })}
          clearLabel={tf("all")}
          options={GROUP_STATUS_FILTERS.map((key) => ({
            value: key,
            label: t(`students.groupStatusFilters.${key}`),
          }))}
          testID="filter-group-status"
        />
        <Select
          label={tf("course")}
          value={draft.courseId ?? null}
          onChange={(v) => set({ courseId: v ?? undefined, groupId: undefined })}
          clearLabel={tf("all")}
          options={(options.data?.courses ?? []).map((c) => ({ value: c.id, label: c.name }))}
          testID="filter-course"
        />
        <Select
          label={tf("group")}
          value={draft.groupId ?? null}
          onChange={(v) => set({ groupId: v ?? undefined })}
          clearLabel={tf("all")}
          options={groups.map((g) => ({
            value: g.id,
            label: g.name,
            note: [g.teacherName, g.time].filter(Boolean).join(", ") || undefined,
          }))}
          testID="filter-group"
        />
        <Select
          label={tf("teacher")}
          value={draft.teacherId ?? null}
          onChange={(v) => set({ teacherId: v ?? undefined })}
          clearLabel={tf("all")}
          options={(options.data?.teachers ?? []).map((p) => ({ value: p.id, label: p.fullName }))}
          testID="filter-teacher"
        />
        {(options.data?.schools ?? []).length > 0 ? (
          <Select
            label={tf("school")}
            value={draft.schoolId ?? null}
            onChange={(v) => set({ schoolId: v ?? undefined })}
            clearLabel={tf("all")}
            options={(options.data?.schools ?? []).map((x) => ({ value: x.id, label: x.name }))}
            testID="filter-school"
          />
        ) : null}
        <Check
          label={tm("archivedOnly")}
          value={draft.archived === true}
          onChange={(on) => set({ archived: on ? true : undefined })}
          testID="filter-archived"
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  form: { gap: space[4] },
  footer: { flexDirection: "row", gap: space[3] },
});
