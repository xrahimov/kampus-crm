import { useRouter } from "expo-router";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { useCreateStudent, useStudentOptions, useUpdateStudent } from "@/api/office-students";
import type { StudentDetail } from "@/api/types";
import { Button } from "@/components/button";
import { Check } from "@/components/check";
import { DateField } from "@/components/date-field";
import { Field } from "@/components/field";
import { Select } from "@/components/select";
import { Sheet } from "@/components/sheet";
import { Notice, Segmented } from "@/components/surface";
import { Text } from "@/components/text";
import { PhotoField } from "@/features/files/photo-field";
import {
  StudentPickField,
  TimeZoneField,
  type PickedStudent,
} from "@/features/office/student-form-parts";
import { ApiError } from "@/lib/api";
import { centreToday } from "@/lib/days";
import { phoneOrNull } from "@/lib/form";
import { errorText, useTranslations } from "@/lib/i18n";
import { useMe } from "@/lib/session";
import { space } from "@/lib/theme";

/** How a student joins the group chosen on the form, the site's three. */
const JOIN_STATUSES = ["NEW", "TRIAL", "ACTIVE"] as const;

/**
 * "Add student" (A-231), the whole of the site's form since A-265: the photo
 * (A-255), the name, the phone, the day of birth, the password of the
 * student's own sign-in, where they came from and who brought them, the time
 * zone of a student abroad, the group to join (as what, at which price,
 * charged from when), a parent's phone and the school. The new student's page
 * opens when it is saved.
 *
 * With `student` it is "Edit student": the photo, the name, the phone, the day
 * of birth, boy or girl, the note, the time zone and the school of someone who
 * is already there, as on the site. Groups and parents have their own places
 * on the student's page.
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
  const options = useStudentOptions(open);
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
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [password, setPassword] = useState("");
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [schoolId, setSchoolId] = useState<string | null>(null);
  const [referredBy, setReferredBy] = useState<PickedStudent | null>(null);
  const [timeZone, setTimeZone] = useState<string | null>(null);
  const [joinAs, setJoinAs] = useState<(typeof JOIN_STATUSES)[number]>("ACTIVE");
  const [ownPrice, setOwnPrice] = useState(false);
  const [price, setPrice] = useState("");
  const [billingFrom, setBillingFrom] = useState<string | null>(null);
  // A photo on its way holds Save: the form would otherwise be saved without it.
  const [sendingPhoto, setSendingPhoto] = useState(false);
  const [missing, setMissing] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setBranchId(ownBranch);
      setFullName(student?.fullName ?? "");
      setPhone(student?.phone ?? "+998");
      setBirthDate(student?.birthDate?.slice(0, 10) ?? null);
      setGender(student?.gender ?? "MALE");
      setPassword("");
      setSourceId(null);
      setSchoolId(student?.schoolId ?? null);
      setReferredBy(null);
      setTimeZone(student?.timeZone ?? null);
      setJoinAs("ACTIVE");
      setOwnPrice(false);
      setPrice("");
      setBillingFrom(null);
      setGroupId(null);
      setJoinedAt(centreToday());
      setParentName("");
      setParentPhone("+998");
      setNote(student?.note ?? "");
      setPhotoUrl(student?.photoUrl ?? null);
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
          gender,
          photoUrl,
          note: note.trim() || null,
          schoolId,
          timeZone,
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
        photoUrl,
        note: note.trim() || null,
        password: password || null,
        sourceId,
        schoolId,
        referredById: referredBy?.id ?? null,
        timeZone,
        membership:
          groupId && joinedAt
            ? {
                groupId,
                joinedAt,
                status: joinAs,
                customPrice: ownPrice && price ? Number(price) : null,
                billingFrom,
              }
            : null,
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
          disabled={sendingPhoto}
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
        <PhotoField
          value={photoUrl}
          name={fullName}
          onChange={setPhotoUrl}
          onBusy={setSendingPhoto}
          testID="student-photo"
        />
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
        {student ? null : (
          <>
            <Field
              label={tf("password")}
              value={password}
              onChangeText={setPassword}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="new-password"
              maxLength={128}
              hint={tf("passwordHint")}
              error={fieldError("password")}
              testID="student-password"
            />
            {(options.data?.sources ?? []).length > 0 ? (
              <Select
                label={tf("source")}
                value={sourceId}
                onChange={setSourceId}
                clearLabel={t("leads.contact.none")}
                placeholder={tf("sourcePlaceholder")}
                options={(options.data?.sources ?? []).map((x) => ({ value: x.id, label: x.name }))}
                error={fieldError("sourceId")}
                testID="student-source"
              />
            ) : null}
            <StudentPickField
              label={tf("referredBy")}
              value={referredBy}
              onChange={setReferredBy}
              active={open}
              error={fieldError("referredById")}
              testID="student-referred"
            />
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
            {groupId ? (
              <>
                <Select
                  label={tf("status")}
                  value={joinAs}
                  onChange={(v) => setJoinAs(v ?? "ACTIVE")}
                  options={JOIN_STATUSES.map((key) => ({
                    value: key,
                    label: t(`groups.memberStatuses.${key}`),
                  }))}
                  error={fieldError("membership.status")}
                  testID="student-join-as"
                />
                <DateField
                  label={tf("billingFrom")}
                  value={billingFrom}
                  onChange={setBillingFrom}
                  hint={t("groups.members.billingFromHint")}
                  error={fieldError("membership.billingFrom")}
                  testID="student-billing"
                />
                <Check
                  label={t("groups.members.customPriceToggle")}
                  value={ownPrice}
                  onChange={setOwnPrice}
                  testID="student-own-price"
                />
                {ownPrice ? (
                  <Field
                    label={t("groups.members.customPrice")}
                    value={price}
                    onChangeText={(text) => setPrice(text.replace(/\D/g, "").slice(0, 13))}
                    keyboardType="number-pad"
                    error={fieldError("membership.customPrice")}
                    testID="student-price"
                  />
                ) : null}
              </>
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
        <TimeZoneField
          label={tf("timeZone")}
          hint={tf("timeZoneHint")}
          value={timeZone}
          onChange={setTimeZone}
          error={fieldError("timeZone")}
          testID="student-zone"
        />
        {(options.data?.schools ?? []).length > 0 ? (
          <Select
            label={tf("school")}
            value={schoolId}
            onChange={setSchoolId}
            clearLabel={t("leads.contact.none")}
            placeholder={tf("schoolPlaceholder")}
            options={(options.data?.schools ?? []).map((x) => ({ value: x.id, label: x.name }))}
            error={fieldError("schoolId")}
            testID="student-school"
          />
        ) : null}
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
