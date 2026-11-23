import { useState } from "react";
import { StyleSheet, View } from "react-native";

import {
  LEAD_DAYS,
  useLeadOptions,
  useSaveWaitlistEntry,
  type Lead,
  type LeadDays,
  type WaitlistEntry,
} from "@/api/leads";
import { Button } from "@/components/button";
import { Field } from "@/components/field";
import { Select } from "@/components/select";
import { Sheet } from "@/components/sheet";
import { Notice } from "@/components/surface";
import { Text } from "@/components/text";
import { fieldErrorOf, hasFieldErrors, phoneOrNull } from "@/lib/form";
import { errorText, useTranslations } from "@/lib/i18n";
import { useMe } from "@/lib/session";
import { space } from "@/lib/theme";

/**
 * "Add to waiting list" (A-232): who waits for which course of which branch,
 * and the days and time they would like. From a lead's card the name, the
 * phone and the branch come from the lead. With `entry` it changes an entry.
 */
export function WaitlistFormSheet({
  open,
  onClose,
  entry,
  lead,
}: {
  open: boolean;
  onClose: () => void;
  entry?: WaitlistEntry | null;
  lead?: Lead | null;
}) {
  const t = useTranslations();
  const tw = useTranslations("leads.waitlist");
  const tl = useTranslations("leads");
  const me = useMe();
  const options = useLeadOptions(open);
  const save = useSaveWaitlistEntry(entry?.id ?? null);
  const ownBranch = me.activeBranch?.id ?? me.branches[0]?.id ?? null;
  const [branchId, setBranchId] = useState<string | null>(ownBranch);
  const [courseId, setCourseId] = useState<string | null>(null);
  const [fullName, setFullName] = useState("");
  const [phone, setPhone] = useState("+998");
  const [days, setDays] = useState<LeadDays | null>(null);
  const [lessonTime, setLessonTime] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [missing, setMissing] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setBranchId(entry?.branchId ?? lead?.branchId ?? ownBranch);
      setCourseId(entry?.courseId ?? null);
      setFullName(entry?.fullName ?? lead?.fullName ?? "");
      setPhone(entry?.phone ?? lead?.phones[0] ?? "+998");
      setDays(entry?.days ?? lead?.days ?? null);
      setLessonTime(entry?.lessonTime ?? lead?.lessonTime ?? null);
      setNote(entry?.note ?? "");
      setMissing(false);
      save.reset();
    }
  }
  const courses = (options.data?.courses ?? []).filter((c) => c.branchId === branchId);
  const number = phoneOrNull(phone);
  const fieldError = fieldErrorOf(t, save.error);
  // The branch of an entry, or of a lead's entry, is not a choice.
  const branchFixed = Boolean(entry ?? lead);

  const submit = () => {
    if (!branchId || !courseId || !fullName.trim() || !number) {
      setMissing(true);
      return;
    }
    setMissing(false);
    save.mutate(
      {
        branchId,
        courseId,
        leadId: lead?.id ?? null,
        fullName: fullName.trim(),
        phone: number,
        days,
        lessonTime,
        note: note.trim() || null,
      },
      { onSuccess: onClose },
    );
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={entry ? tw("edit") : tw("add")}
      testID="waitlist-form"
      footer={
        <Button
          label={t("common.save")}
          loading={save.isPending}
          onPress={submit}
          testID="waitlist-save"
        />
      }
    >
      <View style={styles.form}>
        <Text tone="mutedForeground">{tw("hint")}</Text>
        {!branchFixed && me.branches.length > 1 ? (
          <Select
            label={tw("fields.branch")}
            value={branchId}
            onChange={(value) => {
              setBranchId(value);
              setCourseId(null);
            }}
            options={me.branches.map((b) => ({ value: b.id, label: b.name }))}
            error={missing && !branchId ? t("validation.required") : null}
            testID="waitlist-branch"
          />
        ) : null}
        <Select
          label={tw("fields.course")}
          value={courseId}
          onChange={setCourseId}
          placeholder={tw("fields.coursePlaceholder")}
          options={courses.map((c) => ({ value: c.id, label: c.name }))}
          error={fieldError("courseId") ?? (missing && !courseId ? t("validation.required") : null)}
          testID="waitlist-course"
        />
        <Field
          label={tw("fields.name")}
          value={fullName}
          onChangeText={setFullName}
          maxLength={120}
          error={
            fieldError("fullName") ??
            (missing && !fullName.trim() ? t("validation.required") : null)
          }
          testID="waitlist-name"
        />
        <Field
          label={tw("fields.phone")}
          value={phone}
          onChangeText={setPhone}
          keyboardType="phone-pad"
          maxLength={17}
          error={fieldError("phone") ?? (missing && !number ? t("validation.required") : null)}
          testID="waitlist-phone"
        />
        <Select
          label={tw("fields.days")}
          value={days}
          onChange={setDays}
          clearLabel={tw("fields.anyDays")}
          placeholder={tw("fields.anyDays")}
          options={LEAD_DAYS.map((d) => ({ value: d, label: tl(`days.${d}`) }))}
          testID="waitlist-days"
        />
        <Select
          label={tw("fields.time")}
          value={lessonTime}
          onChange={setLessonTime}
          clearLabel={tl("contact.none")}
          placeholder={tl("contact.none")}
          options={(options.data?.lessonTimes ?? []).map((time) => ({ value: time, label: time }))}
          testID="waitlist-time"
        />
        <Field
          label={tw("fields.note")}
          value={note}
          onChangeText={setNote}
          maxLength={500}
          multiline
          error={fieldError("note")}
          testID="waitlist-note"
        />
        {save.error && !hasFieldErrors(save.error) ? (
          <Notice tone="destructive" testID="waitlist-problem">
            {errorText(t, save.error)}
          </Notice>
        ) : null}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  form: { gap: space[4] },
});
