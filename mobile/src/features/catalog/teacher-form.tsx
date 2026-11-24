import { useState } from "react";
import { StyleSheet, View } from "react-native";

import {
  GENDERS,
  SALARY_AMOUNT_FIELD,
  SALARY_METHODS,
  useSaveTeacher,
  useSignOutEverywhere,
  type Gender,
  type SalaryMethod,
  type Staff,
  type TeacherInput,
  type TeacherKind,
} from "@/api/office-catalog";
import { Button } from "@/components/button";
import { Check } from "@/components/check";
import { Chip } from "@/components/chip";
import { DateField } from "@/components/date-field";
import { Field } from "@/components/field";
import { Select } from "@/components/select";
import { Sheet } from "@/components/sheet";
import { Notice, Segmented } from "@/components/surface";
import { Text } from "@/components/text";
import { centreToday } from "@/lib/days";
import { fieldErrorOf, hasFieldErrors, phoneOrNull } from "@/lib/form";
import { errorText, useTranslations } from "@/lib/i18n";
import { useMe } from "@/lib/session";
import { space, useTheme } from "@/lib/theme";

interface FormState {
  fullName: string;
  phone: string;
  gender: Gender;
  birthDate: string | null;
  hireDate: string | null;
  branchIds: string[];
  salaryMethod: SalaryMethod;
  amount: string;
  signInCode: "OFF" | "TELEGRAM";
}

function emptyForm(branchId: string | null): FormState {
  return {
    fullName: "",
    phone: "+998",
    gender: "MALE",
    birthDate: null,
    hireDate: centreToday(),
    branchIds: branchId ? [branchId] : [],
    salaryMethod: "PERCENT",
    amount: "",
    signInCode: "OFF",
  };
}

function formOf(person: Staff): FormState {
  const salaryMethod = person.salaryMethod ?? "PERCENT";
  const amount = person[SALARY_AMOUNT_FIELD[salaryMethod]];
  return {
    fullName: person.fullName,
    phone: person.phone,
    gender: person.gender,
    birthDate: person.birthDate,
    hireDate: person.hireDate,
    branchIds: person.branches.map((b) => b.id),
    salaryMethod,
    amount: amount === null ? "" : String(amount),
    signInCode: person.signInCode,
  };
}

/** "3 000 000" or "40,5" as a number; null when the field is empty or is not one. */
function typedAmount(text: string): number | null {
  const bare = text.replace(/\s/g, "").replace(",", ".");
  if (bare === "" || !/^\d+(\.\d+)?$/.test(bare)) return null;
  return Number(bare);
}

/**
 * A new teacher or a change to one (A-234): the site's form without its photo
 * and its password. A new person's first sign-in is with a code from Telegram
 * and they choose their own password; nobody types one for them here.
 */
export function TeacherFormSheet({
  open,
  onClose,
  kind,
  person,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  /** Which list a new person joins: their role follows from it. */
  kind: TeacherKind;
  person?: Staff;
  onSaved?: (saved: Staff) => void;
}) {
  const t = useTranslations();
  const tf = useTranslations("staff.form");
  const me = useMe();
  const { colors } = useTheme();
  const save = useSaveTeacher(kind, person?.id ?? null);
  const signOut = useSignOutEverywhere(person?.id ?? "");
  const defaultBranch = me.activeBranch?.id ?? me.branches[0]?.id ?? null;
  const [form, setForm] = useState<FormState>(() =>
    person ? formOf(person) : emptyForm(defaultBranch),
  );
  const [missing, setMissing] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setForm(person ? formOf(person) : emptyForm(defaultBranch));
      setMissing(false);
      save.reset();
      signOut.reset();
    }
  }
  const set = (patch: Partial<FormState>) => setForm((f) => ({ ...f, ...patch }));
  const fieldError = fieldErrorOf(t, save.error);
  const required = (empty: boolean) => (missing && empty ? t("validation.required") : null);
  const amountField = SALARY_AMOUNT_FIELD[form.salaryMethod];
  const amount = typedAmount(form.amount);
  const amountWrong = form.amount.trim() !== "" && amount === null;
  /* The branches the person signed in may choose from, and any the teacher already has. */
  const branches = [
    ...me.branches,
    ...(person?.branches ?? []).filter((b) => !me.branches.some((mine) => mine.id === b.id)),
  ];

  const submit = () => {
    const phone = phoneOrNull(form.phone);
    if (!form.fullName.trim() || !phone || form.branchIds.length === 0 || amountWrong) {
      setMissing(true);
      return;
    }
    const input: TeacherInput = {
      fullName: form.fullName.trim(),
      phone,
      gender: form.gender,
      birthDate: form.birthDate,
      hireDate: form.hireDate,
      branchIds: form.branchIds,
      salaryMethod: form.salaryMethod,
      // The sums of the other ways of paying stay as they were, as on the site.
      fixedSalary: person?.fixedSalary ?? null,
      percentShare: person?.percentShare ?? null,
      perLessonFee: person?.perLessonFee ?? null,
      perStudentFee: person?.perStudentFee ?? null,
      [amountField]: amount,
    };
    // The code switch only exists for someone the bot can reach.
    if (person?.telegramLinked) input.signInCode = form.signInCode;
    save.mutate(input, {
      onSuccess: (saved) => {
        onClose();
        onSaved?.(saved);
      },
    });
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={person ? tf("editTeacher") : tf("addTeacher")}
      testID="teacher-form"
      footer={
        <Button
          label={t("common.save")}
          loading={save.isPending}
          onPress={submit}
          testID="teacher-save"
        />
      }
    >
      <View style={styles.form}>
        {save.error && !hasFieldErrors(save.error) ? (
          <Notice tone="destructive" testID="teacher-problem">
            {errorText(t, save.error)}
          </Notice>
        ) : null}
        <Field
          label={tf("fullName")}
          value={form.fullName}
          onChangeText={(fullName) => set({ fullName })}
          maxLength={120}
          autoCorrect={false}
          error={fieldError("fullName") ?? required(!form.fullName.trim())}
          testID="teacher-name"
        />
        <Field
          label={tf("phone")}
          value={form.phone}
          onChangeText={(phone) => set({ phone })}
          keyboardType="phone-pad"
          error={fieldError("phone") ?? required(!phoneOrNull(form.phone))}
          testID="teacher-phone"
        />
        <View style={styles.pair}>
          <View style={styles.fill}>
            <DateField
              label={tf("birthDate")}
              value={form.birthDate}
              onChange={(birthDate) => set({ birthDate })}
              error={fieldError("birthDate")}
              testID="teacher-birth"
            />
          </View>
          <View style={styles.fill}>
            <DateField
              label={tf("hireDate")}
              value={form.hireDate}
              onChange={(hireDate) => set({ hireDate })}
              error={fieldError("hireDate")}
              testID="teacher-hired"
            />
          </View>
        </View>
        {branches.length > 1 ? (
          <View style={styles.block}>
            <Text variant="smallStrong">{tf("branches")}</Text>
            <View style={styles.chips}>
              {branches.map((branch) => {
                const on = form.branchIds.includes(branch.id);
                return (
                  <Chip
                    key={branch.id}
                    label={branch.name}
                    on={on}
                    onPress={() =>
                      set({
                        branchIds: on
                          ? form.branchIds.filter((id) => id !== branch.id)
                          : [...form.branchIds, branch.id],
                      })
                    }
                    testID={`teacher-branch-${branch.id}`}
                  />
                );
              })}
            </View>
            {(fieldError("branchIds") ?? (missing && form.branchIds.length === 0)) ? (
              <Text variant="small" style={{ color: colors.destructive }}>
                {fieldError("branchIds") ?? t("validation.branchesMin")}
              </Text>
            ) : null}
          </View>
        ) : null}
        <Select
          label={tf("salaryMethod")}
          value={form.salaryMethod}
          onChange={(picked) => {
            const salaryMethod = picked ?? "PERCENT";
            const kept = person?.[SALARY_AMOUNT_FIELD[salaryMethod]] ?? null;
            set({ salaryMethod, amount: kept === null ? "" : String(kept) });
          }}
          options={SALARY_METHODS.map((m) => ({ value: m, label: tf(`methods.${m}`) }))}
          testID="teacher-salary"
        />
        <Field
          label={tf(`amounts.${form.salaryMethod}`)}
          value={form.amount}
          onChangeText={(text) => set({ amount: text })}
          keyboardType="decimal-pad"
          error={fieldError(amountField) ?? (missing && amountWrong ? t("validation.min") : null)}
          testID="teacher-amount"
        />
        <View style={styles.block}>
          <Text variant="smallStrong">{tf("gender")}</Text>
          <Segmented
            value={form.gender}
            onChange={(gender) => set({ gender })}
            options={GENDERS.map((g) => ({ value: g, label: tf(`genders.${g}`) }))}
            testID="teacher-gender"
          />
        </View>
        {person ? (
          <View style={[styles.safety, { borderColor: colors.border }]} testID="teacher-safety">
            <Text variant="bodyStrong">{tf("safety")}</Text>
            <Check
              label={tf("signInCode")}
              hint={tf("signInCodeHint")}
              value={form.signInCode === "TELEGRAM"}
              onChange={(on) => set({ signInCode: on ? "TELEGRAM" : "OFF" })}
              disabled={!person.telegramLinked}
              testID="teacher-sign-in-code"
            />
            {signOut.error ? (
              <Notice tone="destructive">{errorText(t, signOut.error)}</Notice>
            ) : null}
            {signOut.isSuccess ? (
              <Text variant="small" tone="mutedForeground" testID="teacher-signed-out">
                {tf("signedOutAll")}
              </Text>
            ) : (
              <Button
                variant="outline"
                compact
                label={tf("signOutAll")}
                loading={signOut.isPending}
                onPress={() => signOut.mutate()}
                style={styles.start}
                testID="teacher-sign-out-all"
              />
            )}
          </View>
        ) : (
          <Text variant="small" tone="mutedForeground" testID="teacher-first-sign-in">
            {t("mobile.catalog.firstSignIn")}
          </Text>
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
  chips: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  safety: { gap: space[3], borderTopWidth: StyleSheet.hairlineWidth, paddingTop: space[4] },
  start: { alignSelf: "flex-start" },
});
