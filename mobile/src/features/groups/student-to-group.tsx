import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { useAddToGroup } from "@/api/office-groups";
import { useStudentOptions } from "@/api/office-students";
import { Button } from "@/components/button";
import { Check } from "@/components/check";
import { DateField } from "@/components/date-field";
import { Field } from "@/components/field";
import { Select } from "@/components/select";
import { Sheet } from "@/components/sheet";
import { centreToday } from "@/lib/days";
import { fieldErrorOf, isTaken } from "@/lib/form";
import { useTranslations } from "@/lib/i18n";
import { space } from "@/lib/theme";

import { Problem } from "./group-office";

/**
 * "Add to a group" on a student's page (A-233): which group, from which day,
 * charged from when and at what price. The same call as "Add student" on a
 * group; it is how a restored student gets back into a group.
 */
export function StudentToGroupSheet({
  open,
  onClose,
  student,
}: {
  open: boolean;
  onClose: () => void;
  student: { id: string; fullName: string; groups: Array<{ groupId: string; status: string }> };
}) {
  const t = useTranslations();
  const tm = useTranslations("groups.members");
  const add = useAddToGroup();
  const options = useStudentOptions(open);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [joinedAt, setJoinedAt] = useState<string | null>(centreToday());
  const [billingFrom, setBillingFrom] = useState<string | null>(null);
  const [custom, setCustom] = useState(false);
  const [price, setPrice] = useState("");
  const [note, setNote] = useState("");
  const [missing, setMissing] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setGroupId(null);
      setJoinedAt(centreToday());
      setBillingFrom(null);
      setCustom(false);
      setPrice("");
      setNote("");
      setMissing(false);
      add.reset();
    }
  }
  // Not a group the student is in now, and not one that is over.
  const current = new Set(
    student.groups
      .filter((g) => g.status !== "ARCHIVED" && g.status !== "GRADUATED")
      .map((g) => g.groupId),
  );
  const groups = (options.data?.groups ?? []).filter(
    (g) => g.status !== "ARCHIVED" && !current.has(g.id),
  );
  const fieldError = fieldErrorOf(t, add.error);
  const submit = () => {
    if (!groupId || !joinedAt) {
      setMissing(true);
      return;
    }
    add.mutate(
      {
        groupId,
        input: {
          studentId: student.id,
          joinedAt,
          billingFrom,
          customPrice: custom && price ? Number(price) : null,
          note: note.trim() || null,
          status: "ACTIVE",
        },
      },
      { onSuccess: onClose },
    );
  };
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={`${t("mobile.office.toGroup")}: ${student.fullName}`}
      testID="to-group"
      footer={
        <Button
          label={t("common.save")}
          loading={add.isPending}
          onPress={submit}
          testID="to-group-save"
        />
      }
    >
      <View style={styles.form}>
        <Select
          label={t("groups.columns.name")}
          value={groupId}
          onChange={setGroupId}
          placeholder={t("students.form.groupPlaceholder")}
          options={groups.map((g) => ({
            value: g.id,
            label: g.name,
            note: [g.teacherName, g.time].filter(Boolean).join(", ") || undefined,
          }))}
          error={
            (isTaken(add.error, "studentId") ? tm("alreadyIn") : null) ??
            fieldError("studentId") ??
            (missing && !groupId ? t("validation.required") : null)
          }
          testID="to-group-group"
        />
        <DateField
          label={tm("joinDate")}
          value={joinedAt}
          onChange={setJoinedAt}
          error={fieldError("joinedAt") ?? (missing && !joinedAt ? t("validation.required") : null)}
          testID="to-group-joined"
        />
        <DateField
          label={tm("billingFrom")}
          value={billingFrom}
          onChange={setBillingFrom}
          hint={tm("billingFromHint")}
          error={fieldError("billingFrom")}
          testID="to-group-billing"
        />
        <Check
          label={tm("customPriceToggle")}
          value={custom}
          onChange={setCustom}
          testID="to-group-custom"
        />
        {custom ? (
          <Field
            label={tm("customPrice")}
            value={price}
            onChangeText={(text) => setPrice(text.replace(/\D/g, "").slice(0, 13))}
            keyboardType="number-pad"
            error={fieldError("customPrice")}
            testID="to-group-price"
          />
        ) : null}
        <Field
          label={tm("note")}
          value={note}
          onChangeText={setNote}
          maxLength={500}
          multiline
          testID="to-group-note"
        />
        <Problem error={options.error ?? add.error} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({ form: { gap: space[4] } });
