import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { useCreateStudent, useStudentOptions, useUpdateStudent } from "@/api/office-students";
import type { StudentDetail } from "@/api/types";
import { Button } from "@/components/button";
import { DateField } from "@/components/date-field";
import { Field } from "@/components/field";
import { Select } from "@/components/select";
import { Sheet } from "@/components/sheet";
import { Notice, Segmented } from "@/components/surface";
import { Text } from "@/components/text";
import { ApiError } from "@/lib/api";
import { centreToday } from "@/lib/days";
import { errorText, useTranslations } from "@/lib/i18n";
import { useMe } from "@/lib/session";
import { space } from "@/lib/theme";

/** A phone number as the server wants it, or null when the field is empty. */
function phoneOrNull(text: string): string | null {
  const bare = text.replace(/[\s()-]/g, "");
  return bare === "" || bare === "+998" ? null : bare;
}

/**
 * "Add student" (A-231), the site's form with the parts a phone is used for:
 * the name, the phone, the day of birth, the group to join and a parent's
 * phone. The rest of the profile (school, source, the app password) is set on
 * the site for now. The new student's page opens when it is saved.
 *
 * With `student` it is "Edit student": the name, the phone, the day of birth
 * and the note of someone who is already there. Groups and parents have their
 * own places on the student's page.
 */
export function StudentFormSheet({
  open,
  onClose,
  student,
}: {
  open: boolean;
  onClose: () => void;
  student?: StudentDetail;
}) {
  const t = useTranslations();
  const tf = useTranslations("students.form");
  const me = useMe();
  const router = useRouter();
  const options = useStudentOptions(open && !student);
  const add = useCreateStudent();
  const change = useUpdateStudent(student?.id ?? "");
  const create = student ? change : add;
  const ownBranch = me.activeBranch?.id ?? me.branches[0]?.id ?? null;
  const [branchId, setBranchId] = useState<string | null>(ownBranch);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("+998");
  const [birthDate, setBirthDate] = useState<string | null>(null);
  const [gender, setGender] = useState<"MALE" | "FEMALE">("MALE");
  const [groupId, setGroupId] = useState<string | null>(null);
  const [joinedAt, setJoinedAt] = useState<string | null>(centreToday());
  const [parentName, setParentName] = useState("");
  const [parentPhone, setParentPhone] = useState("+998");
  const [note, setNote] = useState("");
  const [missing, setMissing] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setBranchId(ownBranch);
      setFullName(student?.fullName ?? "");
      setPhone(student?.phone ?? "+998");
      setBirthDate(student?.birthDate?.slice(0, 10) ?? null);
      setGender("MALE");
      setGroupId(null);
      setJoinedAt(centreToday());
      setParentName("");
      setParentPhone("+998");
      setNote(student?.note ?? "");
      setMissing(false);
      add.reset();
      change.reset();
    }
  }
  const groups = (options.data?.groups ?? []).filter(
    (g) => g.status !== "ARCHIVED" && (!branchId || g.branchId === branchId),
  );
  const parent = phoneOrNull(parentPhone);
  const fields = create.error instanceof ApiError ? create.error.fields : undefined;
  const fieldError = (key: string) => {
    const first = fields?.[key]?.[0];
    return first && t.has(first) ? t(first) : null;
  };

  const save = () => {
    const incomplete =
      !branchId ||
      !fullName.trim() ||
      (groupId !== null && !joinedAt) ||
      (parent !== null && !parentName.trim());
    if (incomplete) {
      setMissing(true);
      return;
    }
    setMissing(false);
    if (student) {
      change.mutate(
        {
          fullName: fullName.trim(),
          phone: phoneOrNull(phone),
          birthDate,
          note: note.trim() || null,
        },
        { onSuccess: onClose },
      );
      return;
    }
    add.mutate(
      {
        branchId,
        fullName: fullName.trim(),
        phone: phoneOrNull(phone),
        birthDate,
        gender,
        note: note.trim() || null,
        membership: groupId && joinedAt ? { groupId, joinedAt, status: "ACTIVE" } : null,
        parent: parent ? { fullName: parentName.trim(), phone: parent } : null,
      },
      {
        onSuccess: (made) => {
          onClose();
          router.push({ pathname: "/staff/student/[id]", params: { id: made.id } });
        },
      },
    );
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={student ? t("students.edit") : t("students.add")}
      testID="student-form"
      footer={
        <Button
          label={t("common.save")}
          loading={create.isPending}
          onPress={save}
          testID="student-save"
        />
      }
    >
      <View style={styles.form}>
        {!student && me.branches.length > 1 ? (
          <Select
            label={tf("branch")}
            value={branchId}
            onChange={(v) => {
              setBranchId(v);
              setGroupId(null);
            }}
            options={me.branches.map((b) => ({ value: b.id, label: b.name }))}
            error={fieldError("branchId")}
            testID="student-branch"
          />
        ) : null}
        <Field
          label={tf("fullName")}
          value={fullName}
          onChangeText={setFullName}
          maxLength={120}
          autoCapitalize="words"
          error={
            fieldError("fullName") ??
            (missing && !fullName.trim() ? t("validation.required") : null)
          }
          testID="student-name"
        />
        <Field
          label={tf("phone")}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          maxLength={17}
          error={fieldError("phone")}
          testID="student-phone"
        />
        <DateField
          label={tf("birthDate")}
          value={birthDate}
          onChange={setBirthDate}
          error={fieldError("birthDate")}
          testID="student-birth"
        />
        {student ? null : (
          <>
            <View style={styles.block}>
              <Text variant="smallStrong">{tf("gender")}</Text>
              <Segmented
                value={gender}
                onChange={setGender}
                options={[
                  { value: "MALE", label: t("students.genders.MALE") },
                  { value: "FEMALE", label: t("students.genders.FEMALE") },
                ]}
                testID="student-gender"
              />
            </View>
            <Text variant="heading">{tf("groupSection")}</Text>
            <Select
              label={tf("group")}
              value={groupId}
              onChange={setGroupId}
              clearLabel={tf("groupPlaceholder")}
              options={groups.map((g) => ({
                value: g.id,
                label: g.name,
                note: [g.teacherName, g.time].filter(Boolean).join(", ") || undefined,
              }))}
              error={fieldError("membership.groupId") ?? fieldError("membership")}
              testID="student-group"
            />
            {groupId ? (
              <DateField
                label={tf("joinedAt")}
                value={joinedAt}
                onChange={setJoinedAt}
                error={
                  fieldError("membership.joinedAt") ??
                  (missing && !joinedAt ? t("validation.date") : null)
                }
                testID="student-joined"
              />
            ) : null}
            <Text variant="heading">{tf("parentSection")}</Text>
            <Field
              label={tf("parentPhone")}
              value={parentPhone}
              onChangeText={setParentPhone}
              keyboardType="phone-pad"
              maxLength={17}
              error={fieldError("parent.phone")}
              testID="student-parent-phone"
            />
            {parent ? (
              <Field
                label={tf("parentName")}
                value={parentName}
                onChangeText={setParentName}
                maxLength={120}
                autoCapitalize="words"
                error={
                  fieldError("parent.fullName") ??
                  (missing && !parentName.trim() ? t("validation.required") : null)
                }
                testID="student-parent-name"
              />
            ) : null}
          </>
        )}
        <Field
          label={tf("note")}
          value={note}
          onChangeText={setNote}
          maxLength={500}
          multiline
          testID="student-note"
        />
        {create.error && !fields ? (
          <Notice tone="destructive" testID="student-problem">
            {errorText(t, create.error)}
          </Notice>
        ) : null}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  form: { gap: space[4] },
  block: { gap: space[2] },
});
