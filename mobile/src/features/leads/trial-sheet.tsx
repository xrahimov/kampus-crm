import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { useBookTrial, useLeadOptions, type Lead } from "@/api/leads";
import { Button } from "@/components/button";
import { DateField } from "@/components/date-field";
import { Field } from "@/components/field";
import { Select } from "@/components/select";
import { Sheet } from "@/components/sheet";
import { Notice } from "@/components/surface";
import { Text } from "@/components/text";
import { centreToday } from "@/lib/days";
import { fieldErrorOf, hasFieldErrors } from "@/lib/form";
import { errorText, useTranslations } from "@/lib/i18n";
import { space } from "@/lib/theme";

/**
 * "Book a trial" (A-232): a group of the lead's branch, the day and a note
 * for the teacher. The visitor then stands on the teacher's Today roster.
 */
export function TrialSheet({
  open,
  onClose,
  lead,
}: {
  open: boolean;
  onClose: () => void;
  lead: Lead;
}) {
  const t = useTranslations();
  const tt = useTranslations("leads.trial");
  const options = useLeadOptions(open);
  const book = useBookTrial(lead.id);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [day, setDay] = useState<string | null>(centreToday());
  const [note, setNote] = useState("");
  const [missing, setMissing] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setGroupId(null);
      setDay(centreToday());
      setNote("");
      setMissing(false);
      book.reset();
    }
  }
  const groups = (options.data?.groups ?? []).filter((g) => g.branchId === lead.branchId);
  const fieldError = fieldErrorOf(t, book.error);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={tt("title", { name: lead.fullName })}
      testID="trial-sheet"
      footer={
        <Button
          label={tt("book")}
          loading={book.isPending}
          onPress={() => {
            if (!groupId || !day) {
              setMissing(true);
              return;
            }
            setMissing(false);
            book.mutate({ groupId, date: day, note: note.trim() || null }, { onSuccess: onClose });
          }}
          testID="trial-save"
        />
      }
    >
      <View style={styles.form}>
        <Text tone="mutedForeground">{tt("hint")}</Text>
        <Select
          label={tt("group")}
          value={groupId}
          onChange={setGroupId}
          placeholder={tt("groupPlaceholder")}
          options={groups.map((g) => ({ value: g.id, label: g.name }))}
          error={fieldError("groupId") ?? (missing && !groupId ? t("validation.required") : null)}
          testID="trial-group"
        />
        <DateField
          label={tt("date")}
          value={day}
          onChange={setDay}
          error={fieldError("date") ?? (missing && !day ? t("validation.date") : null)}
          testID="trial-day"
        />
        <Field
          label={tt("note")}
          value={note}
          onChangeText={setNote}
          maxLength={500}
          multiline
          error={fieldError("note")}
          testID="trial-note"
        />
        {book.error && !hasFieldErrors(book.error) ? (
          <Notice tone="destructive" testID="trial-problem">
            {errorText(t, book.error)}
          </Notice>
        ) : null}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  form: { gap: space[4] },
});
