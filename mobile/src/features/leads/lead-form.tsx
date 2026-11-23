import { Plus, X } from "lucide-react-native";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import {
  LEAD_DAYS,
  LEAD_STATUSES,
  LEAD_TEMPERATURES,
  useLeadOptions,
  useSaveLead,
  type Lead,
  type LeadDays,
  type LeadStatus,
  type LeadTemperature,
} from "@/api/leads";
import { Button } from "@/components/button";
import { DateField } from "@/components/date-field";
import { Field } from "@/components/field";
import { Select } from "@/components/select";
import { Sheet } from "@/components/sheet";
import { Notice } from "@/components/surface";
import { fieldErrorOf, hasFieldErrors, phoneOrNull } from "@/lib/form";
import { errorText, useTranslations } from "@/lib/i18n";
import { useMe } from "@/lib/session";
import { space, useTheme } from "@/lib/theme";

const MAX_PHONES = 5;

/**
 * "Add lead" and "Edit lead" (A-232): the site's form. A new lead goes into
 * the column it was added from; the person who adds it owns it unless another
 * owner is picked. Who invited the lead is kept as it is and set on the site.
 */
export function LeadFormSheet({
  open,
  onClose,
  lead,
  boardId,
  columnId,
}: {
  open: boolean;
  onClose: () => void;
  /** The lead to change; without it a new one is added. */
  lead?: Lead | null;
  /** The board a new lead goes to, and the column it starts in. */
  boardId: string | null;
  columnId: string | null;
}) {
  const t = useTranslations();
  const tl = useTranslations("leads");
  const tf = useTranslations("leads.form");
  const me = useMe();
  const { colors } = useTheme();
  const options = useLeadOptions(open);
  const save = useSaveLead(lead?.id ?? null);
  const [column, setColumn] = useState<string | null>(columnId);
  const [fullName, setFullName] = useState("");
  const [phones, setPhones] = useState<string[]>(["+998"]);
  const [sourceId, setSourceId] = useState<string | null>(null);
  const [teacherId, setTeacherId] = useState<string | null>(null);
  const [ownerId, setOwnerId] = useState<string | null>(null);
  const [nextContactAt, setNextContactAt] = useState<string | null>(null);
  const [days, setDays] = useState<LeadDays | null>(null);
  const [lessonTime, setLessonTime] = useState<string | null>(null);
  const [status, setStatus] = useState<LeadStatus>("NEW");
  const [temperature, setTemperature] = useState<LeadTemperature | null>(null);
  const [birthDate, setBirthDate] = useState<string | null>(null);
  const [age, setAge] = useState("");
  const [comment, setComment] = useState("");
  const [missing, setMissing] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setColumn(lead?.columnId ?? columnId);
      setFullName(lead?.fullName ?? "");
      setPhones(lead && lead.phones.length > 0 ? lead.phones : ["+998"]);
      setSourceId(lead?.sourceId ?? null);
      setTeacherId(lead?.teacherId ?? null);
      setOwnerId(lead ? lead.ownerId : me.user.id);
      setNextContactAt(lead?.nextContactAt?.slice(0, 10) ?? null);
      setDays(lead?.days ?? null);
      setLessonTime(lead?.lessonTime ?? null);
      setStatus(lead?.status ?? "NEW");
      setTemperature(lead?.temperature ?? null);
      setBirthDate(lead?.birthDate?.slice(0, 10) ?? null);
      setAge(lead?.age ? String(lead.age) : "");
      setComment(lead?.comment ?? "");
      setMissing(false);
      save.reset();
    }
  }
  const board = options.data?.boards.find((b) => b.id === (lead?.boardId ?? boardId));
  const owners = options.data?.owners ?? [];
  const fieldError = fieldErrorOf(t, save.error);

  const submit = () => {
    if (!column || !fullName.trim()) {
      setMissing(true);
      return;
    }
    setMissing(false);
    save.mutate(
      {
        columnId: column,
        fullName: fullName.trim(),
        phones: phones.map(phoneOrNull).filter((p): p is string => p !== null),
        birthDate,
        age: age ? Number(age) : null,
        sourceId,
        teacherId,
        ownerId,
        nextContactAt,
        days,
        lessonTime,
        status,
        temperature,
        comment: comment.trim() || null,
      },
      { onSuccess: onClose },
    );
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={lead ? tl("edit") : tl("add")}
      testID="lead-form"
      footer={
        <Button
          label={t("common.save")}
          loading={save.isPending}
          onPress={submit}
          testID="lead-save"
        />
      }
    >
      <View style={styles.form}>
        <Field
          label={tf("fullName")}
          value={fullName}
          onChangeText={setFullName}
          maxLength={120}
          error={
            fieldError("fullName") ??
            (missing && !fullName.trim() ? t("validation.required") : null)
          }
          testID="lead-name"
        />
        {phones.map((phone, index) => (
          <View key={index} style={styles.phone}>
            <View style={styles.fill}>
              <Field
                label={phones.length > 1 ? tf("phoneN", { n: index + 1 }) : tf("phone")}
                value={phone}
                onChangeText={(text) =>
                  setPhones((list) => list.map((p, i) => (i === index ? text : p)))
                }
                keyboardType="phone-pad"
                maxLength={17}
                error={fieldError(`phones.${index}`) ?? (index === 0 ? fieldError("phones") : null)}
                testID={`lead-phone-${index}`}
              />
            </View>
            {phones.length > 1 ? (
              <Pressable
                onPress={() => setPhones((list) => list.filter((_, i) => i !== index))}
                accessibilityRole="button"
                accessibilityLabel={tf("removePhone")}
                hitSlop={8}
                style={styles.remove}
                testID={`lead-phone-remove-${index}`}
              >
                <X size={18} color={colors.mutedForeground} />
              </Pressable>
            ) : null}
          </View>
        ))}
        {phones.length < MAX_PHONES ? (
          <Button
            variant="ghost"
            compact
            icon={<Plus size={16} color={colors.primary} />}
            label={tf("addPhone")}
            onPress={() => setPhones((list) => [...list, "+998"])}
            style={styles.start}
            testID="lead-phone-add"
          />
        ) : null}
        <Select
          label={tf("column")}
          value={column}
          onChange={setColumn}
          options={(board?.columns ?? []).map((c) => ({ value: c.id, label: c.name }))}
          error={fieldError("columnId") ?? (missing && !column ? t("validation.required") : null)}
          testID="lead-column"
        />
        <Select
          label={tf("status")}
          value={status}
          onChange={(value) => setStatus(value ?? "NEW")}
          options={LEAD_STATUSES.map((s) => ({ value: s, label: tl(`statuses.${s}`) }))}
          testID="lead-status"
        />
        <Select
          label={tf("temperature")}
          value={temperature}
          onChange={setTemperature}
          clearLabel={tl("contact.none")}
          placeholder={tl("contact.none")}
          options={LEAD_TEMPERATURES.map((s) => ({ value: s, label: tl(`temperatures.${s}`) }))}
          testID="lead-temperature"
        />
        <Select
          label={tf("owner")}
          value={ownerId}
          onChange={setOwnerId}
          clearLabel={tf("noOwner")}
          placeholder={tf("noOwner")}
          options={owners.map((o) => ({ value: o.id, label: o.fullName }))}
          error={fieldError("ownerId")}
          testID="lead-owner"
        />
        <DateField
          label={tf("nextContact")}
          value={nextContactAt}
          onChange={setNextContactAt}
          error={fieldError("nextContactAt")}
          testID="lead-next"
        />
        <Select
          label={tf("source")}
          value={sourceId}
          onChange={setSourceId}
          clearLabel={tl("contact.none")}
          placeholder={tl("contact.none")}
          options={(options.data?.sources ?? []).map((s) => ({ value: s.id, label: s.name }))}
          testID="lead-source"
        />
        <Select
          label={tf("teacher")}
          value={teacherId}
          onChange={setTeacherId}
          clearLabel={tl("contact.none")}
          placeholder={tl("contact.none")}
          options={(options.data?.teachers ?? []).map((s) => ({ value: s.id, label: s.fullName }))}
          testID="lead-teacher"
        />
        <Select
          label={tf("days")}
          value={days}
          onChange={setDays}
          clearLabel={tl("contact.none")}
          placeholder={tl("contact.none")}
          options={LEAD_DAYS.map((d) => ({ value: d, label: tl(`days.${d}`) }))}
          testID="lead-days"
        />
        <Select
          label={tf("lessonTime")}
          value={lessonTime}
          onChange={setLessonTime}
          clearLabel={tl("contact.none")}
          placeholder={tl("contact.none")}
          options={(options.data?.lessonTimes ?? []).map((time) => ({ value: time, label: time }))}
          testID="lead-time"
        />
        <View style={styles.pair}>
          <View style={styles.fill}>
            <DateField
              label={tf("birthDate")}
              value={birthDate}
              onChange={setBirthDate}
              error={fieldError("birthDate")}
              testID="lead-birth"
            />
          </View>
          <View style={styles.age}>
            <Field
              label={tf("age")}
              value={age}
              onChangeText={(text) => setAge(text.replace(/\D/g, "").slice(0, 3))}
              keyboardType="number-pad"
              error={fieldError("age")}
              testID="lead-age"
            />
          </View>
        </View>
        <Field
          label={tf("comment")}
          value={comment}
          onChangeText={setComment}
          maxLength={2000}
          multiline
          error={fieldError("comment")}
          testID="lead-comment"
        />
        {options.error ? <Notice tone="destructive">{errorText(t, options.error)}</Notice> : null}
        {save.error && !hasFieldErrors(save.error) ? (
          <Notice tone="destructive" testID="lead-problem">
            {errorText(t, save.error)}
          </Notice>
        ) : null}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  form: { gap: space[4] },
  fill: { flex: 1 },
  phone: { flexDirection: "row", alignItems: "flex-start", gap: space[2] },
  remove: { marginTop: 34 },
  start: { alignSelf: "flex-start" },
  pair: { flexDirection: "row", gap: space[3] },
  age: { width: 96 },
});
