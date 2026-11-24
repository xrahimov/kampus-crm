import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import {
  CATEGORY_ENTRY_TYPES,
  STAFF_ENTRY_TYPES,
  useFinanceStudents,
  useSaveEntry,
  type FinanceEntry,
  type FinanceEntryType,
  type FinanceOptions,
  type FinanceStudent,
} from "@/api/office-finance";
import { Button } from "@/components/button";
import { DateField } from "@/components/date-field";
import { Field } from "@/components/field";
import { Select } from "@/components/select";
import { Sheet } from "@/components/sheet";
import { Divider, Notice, Segmented } from "@/components/surface";
import { Text } from "@/components/text";
import { centreToday } from "@/lib/days";
import { fieldErrorOf, hasFieldErrors } from "@/lib/form";
import { errorText, useTranslations } from "@/lib/i18n";
import { useRested } from "@/lib/rested";
import { useMe } from "@/lib/session";
import { radius, space, useTheme } from "@/lib/theme";

/**
 * A sum as it is typed: "1 500 000", "1500000", "1500,5". Null when it is not
 * a sum above zero. The site's field takes parts of a soʻm, so the app does.
 */
export function typedAmount(text: string): number | null {
  const bare = text.replace(/\s/g, "").replace(",", ".");
  if (!/^\d+(\.\d{1,2})?$/.test(bare)) return null;
  const value = Number(bare);
  return value > 0 ? value : null;
}

type Party = "STAFF" | "STUDENT";

/**
 * The site's one dialog for every money row (A-237): an advance, marketing,
 * an expense or an income (paid to or by a staff member or a student), a
 * bonus, a fine, an investment. With `entry` it changes that row.
 */
export function EntrySheet({
  open,
  onClose,
  type,
  categoryId,
  entry,
  options,
}: {
  open: boolean;
  onClose: () => void;
  type: FinanceEntryType;
  /** The category whose page this is; null on a page that has none. */
  categoryId: string | null;
  entry: FinanceEntry | null;
  options: FinanceOptions;
}) {
  const t = useTranslations();
  const tf = useTranslations("finance.form");
  const me = useMe();
  const { colors } = useTheme();
  const save = useSaveEntry(entry?.id ?? null);
  const staffOnly = STAFF_ENTRY_TYPES.includes(type);
  const inCategory = CATEGORY_ENTRY_TYPES.includes(type);
  const firstBranch = me.activeBranch?.id ?? options.branches[0]?.id ?? "";
  const firstMethod = options.paymentMethods[0]?.id ?? null;

  const [branchId, setBranchId] = useState(firstBranch);
  const [methodId, setMethodId] = useState<string | null>(firstMethod);
  const [pickedCategory, setCategory] = useState<string | null>(categoryId);
  const [party, setParty] = useState<Party>("STAFF");
  const [staffId, setStaffId] = useState<string | null>(null);
  const [student, setStudent] = useState<{ id: string; fullName: string } | null>(null);
  const [typed, setTyped] = useState("");
  const [counterparty, setCounterparty] = useState("");
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState<string | null>(centreToday());
  const [comment, setComment] = useState("");
  const [missing, setMissing] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setBranchId(entry?.branchId ?? firstBranch);
      setMethodId(entry ? entry.paymentMethodId : firstMethod);
      setCategory(entry?.categoryId ?? categoryId);
      setParty(entry?.studentId ? "STUDENT" : "STAFF");
      setStaffId(entry?.staffId ?? null);
      setStudent(
        entry?.studentId ? { id: entry.studentId, fullName: entry.studentName ?? "" } : null,
      );
      setTyped("");
      setCounterparty(entry?.counterparty ?? "");
      setAmount(entry ? String(entry.amount) : "");
      setDate(entry?.date ?? centreToday());
      setComment(entry?.comment ?? "");
      setMissing(false);
      save.reset();
    }
  }
  const q = useRested(typed.trim());
  const searching = open && inCategory && party === "STUDENT" && student === null;
  // Only what is in the field is searched for: a rested value from before a pick is not.
  const found = useFinanceStudents(q, searching && q === typed.trim());
  const students = (found.data ?? []).filter((s) => !branchId || s.branchId === branchId);

  // "Not set": an entry may have no payment type, and an expense nobody it was paid to.
  const none = t("debts.dialog.none");
  const sum = typedAmount(amount);
  const fieldError = fieldErrorOf(t, save.error);
  const required = (empty: boolean) => (missing && empty ? t("validation.required") : null);
  const needsStaff = staffOnly && !staffId;
  const needsCategory = inCategory && !pickedCategory;
  const needsName = type === "INVESTMENT" && !counterparty.trim();

  const submit = () => {
    if (sum === null || !date || !branchId || needsStaff || needsCategory || needsName) {
      setMissing(true);
      return;
    }
    const toStaff = staffOnly || (inCategory && party === "STAFF");
    save.mutate(
      {
        type,
        branchId,
        categoryId: inCategory ? pickedCategory : null,
        paymentMethodId: type === "INVESTMENT" ? null : methodId,
        amount: sum,
        date,
        comment: comment.trim() || null,
        staffId: toStaff ? staffId : null,
        studentId: inCategory && party === "STUDENT" ? (student?.id ?? null) : null,
        counterparty: type === "INVESTMENT" ? counterparty.trim() : null,
      },
      { onSuccess: onClose },
    );
  };

  const pick = (s: FinanceStudent) => {
    setStudent({ id: s.id, fullName: s.fullName });
    setTyped("");
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t(entry ? "finance.editTitle" : `finance.titles.${type}`)}
      testID="entry"
      footer={
        <Button
          label={t("common.save")}
          loading={save.isPending}
          onPress={submit}
          testID="entry-save"
        />
      }
    >
      <View style={styles.form}>
        {save.error && !hasFieldErrors(save.error) ? (
          <Notice tone="destructive" testID="entry-problem">
            {errorText(t, save.error)}
          </Notice>
        ) : null}
        {options.branches.length > 1 ? (
          <Select
            label={tf("branch")}
            value={branchId}
            onChange={(value) => {
              setBranchId(value ?? firstBranch);
              // A student belongs to one branch: another branch, another student.
              setStudent(null);
            }}
            options={options.branches.map((b) => ({ value: b.id, label: b.name }))}
            error={fieldError("branchId")}
            testID="entry-branch"
          />
        ) : null}
        {type !== "INVESTMENT" ? (
          <Select
            label={tf("method")}
            value={methodId}
            onChange={setMethodId}
            clearLabel={none}
            placeholder={none}
            options={options.paymentMethods.map((m) => ({ value: m.id, label: m.name }))}
            error={fieldError("paymentMethodId")}
            testID="entry-method"
          />
        ) : null}
        {inCategory && !categoryId ? (
          <Select
            label={tf("category")}
            value={pickedCategory}
            onChange={setCategory}
            options={options.categories
              .filter((c) => c.kind === type)
              .map((c) => ({ value: c.id, label: c.name }))}
            error={fieldError("categoryId") ?? required(needsCategory)}
            testID="entry-category"
          />
        ) : null}
        {inCategory ? (
          <Segmented
            value={party}
            onChange={setParty}
            options={[
              { value: "STAFF", label: tf("staff") },
              { value: "STUDENT", label: tf("student") },
            ]}
            testID="entry-party"
          />
        ) : null}
        {staffOnly || (inCategory && party === "STAFF") ? (
          <Select
            label={tf("staff")}
            value={staffId}
            onChange={setStaffId}
            clearLabel={staffOnly ? undefined : none}
            placeholder={staffOnly ? undefined : none}
            options={options.staff.map((s) => ({ value: s.id, label: s.fullName }))}
            error={fieldError("staffId") ?? required(needsStaff)}
            testID="entry-staff"
          />
        ) : null}
        {inCategory && party === "STUDENT" ? (
          student ? (
            <View
              style={[styles.picked, { borderColor: colors.input, backgroundColor: colors.card }]}
              testID="entry-student"
            >
              <Text style={styles.fill} numberOfLines={1}>
                {student.fullName}
              </Text>
              <Button
                compact
                variant="ghost"
                label={t("common.remove")}
                onPress={() => setStudent(null)}
                testID="entry-student-remove"
              />
            </View>
          ) : (
            <View style={styles.search}>
              <Field
                label={tf("student")}
                value={typed}
                onChangeText={setTyped}
                placeholder={tf("studentSearch")}
                autoCorrect={false}
                error={fieldError("studentId")}
                testID="entry-student-search"
              />
              {typed.trim().length >= 2 && found.data ? (
                students.length === 0 ? (
                  <Text variant="small" tone="mutedForeground" testID="entry-student-none">
                    {t("common.nothingFound")}
                  </Text>
                ) : (
                  <View
                    style={[styles.results, { borderColor: colors.border }]}
                    testID="entry-students"
                  >
                    {students.map((s, index) => (
                      <View key={s.id}>
                        {index > 0 ? <Divider /> : null}
                        <Pressable
                          accessibilityRole="button"
                          onPress={() => pick(s)}
                          style={styles.result}
                          testID={`entry-student-${s.id}`}
                        >
                          <Text style={styles.fill} numberOfLines={1}>
                            {s.fullName}
                          </Text>
                          {s.phone ? (
                            <Text variant="small" tone="mutedForeground">
                              {s.phone}
                            </Text>
                          ) : null}
                        </Pressable>
                      </View>
                    ))}
                  </View>
                )
              ) : null}
            </View>
          )
        ) : null}
        {type === "INVESTMENT" ? (
          <Field
            label={tf("counterparty")}
            value={counterparty}
            onChangeText={setCounterparty}
            maxLength={120}
            error={fieldError("counterparty") ?? required(needsName)}
            testID="entry-counterparty"
          />
        ) : null}
        <Field
          label={tf("amount")}
          value={amount}
          onChangeText={setAmount}
          keyboardType="decimal-pad"
          error={
            fieldError("amount") ??
            (missing && sum === null
              ? t(amount.trim() ? "validation.min" : "validation.required")
              : null)
          }
          testID="entry-amount"
        />
        <DateField
          label={tf("date")}
          value={date}
          onChange={setDate}
          error={fieldError("date") ?? required(!date)}
          testID="entry-date"
        />
        <Field
          label={tf("comment")}
          value={comment}
          onChangeText={setComment}
          multiline
          maxLength={500}
          error={fieldError("comment")}
          testID="entry-comment"
        />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  form: { gap: space[4] },
  search: { gap: space[2] },
  picked: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    paddingLeft: space[3],
    borderWidth: 1,
    borderRadius: radius.md,
  },
  results: { borderWidth: 1, borderRadius: radius.md },
  result: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingHorizontal: space[3],
  },
});
