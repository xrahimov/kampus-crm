import { Phone } from "lucide-react-native";
import { useState } from "react";
import { Linking, StyleSheet, View } from "react-native";

import { Button } from "@/components/button";
import { DateField } from "@/components/date-field";
import { Field } from "@/components/field";
import { Select } from "@/components/select";
import { Sheet } from "@/components/sheet";
import { Notice } from "@/components/surface";
import { errorText, useTranslations } from "@/lib/i18n";
import { fieldErrorOf, hasFieldErrors } from "@/lib/form";
import { space, useTheme } from "@/lib/theme";

export const CHANNELS = ["CALL", "TELEGRAM", "SMS", "VISIT", "NOTE"] as const;
export type Channel = (typeof CHANNELS)[number];

export interface ContactDraft {
  channel: Channel;
  outcome: string | null;
  note: string | null;
  nextContactAt: string | null;
  status: string | null;
}

/** Opens the phone's dialler with the number. */
export function dial(phone: string): void {
  void Linking.openURL(`tel:${phone.replace(/[^+0-9]/g, "")}`);
}

/**
 * "Log a contact" (A-232): how the person was reached, how it ended and a
 * note. Leads also plan the next contact and may change the lead's status;
 * absences only record. The numbers on top dial with one press, so a call and
 * its outcome are one visit to this sheet.
 *
 * `words` is the part of the messages the labels come from ("leads.contact",
 * "absences.dialog"), `outcomes` and `statuses` the choices with their words.
 */
export function ContactSheet({
  open,
  onClose,
  title,
  phones = [],
  words,
  channelLabel,
  outcomes,
  next,
  statuses,
  saving,
  error,
  onSave,
  testID = "contact",
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  phones?: Array<{ phone: string; label?: string }>;
  words: { channel: string; outcome: string; none: string; note: string };
  channelLabel: (channel: Channel) => string;
  outcomes: Array<{ value: string; label: string }>;
  /** The next contact's day, for leads. */
  next?: { label: string; hint: string };
  statuses?: { label: string; options: Array<{ value: string; label: string }> };
  saving: boolean;
  error: unknown;
  onSave: (draft: ContactDraft) => void;
  testID?: string;
}) {
  const t = useTranslations();
  const { colors } = useTheme();
  const [channel, setChannel] = useState<Channel>("CALL");
  const [outcome, setOutcome] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [nextContactAt, setNextContactAt] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setChannel("CALL");
      setOutcome(null);
      setNote("");
      setNextContactAt(null);
      setStatus(null);
    }
  }
  const fieldError = fieldErrorOf(t, error);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={title}
      testID={testID}
      footer={
        <Button
          label={t("common.save")}
          loading={saving}
          onPress={() =>
            onSave({ channel, outcome, note: note.trim() || null, nextContactAt, status })
          }
          testID={`${testID}-save`}
        />
      }
    >
      <View style={styles.form}>
        {phones.length > 0 ? (
          <View style={styles.phones}>
            {phones.map((p, index) => (
              <Button
                key={`${p.phone}:${index}`}
                variant="outline"
                compact
                icon={<Phone size={16} color={colors.foreground} />}
                label={p.label ? `${p.phone} (${p.label})` : p.phone}
                onPress={() => dial(p.phone)}
                testID={`${testID}-dial-${index}`}
              />
            ))}
          </View>
        ) : null}
        <Select
          label={words.channel}
          value={channel}
          onChange={(value) => setChannel(value ?? "CALL")}
          options={CHANNELS.map((c) => ({ value: c, label: channelLabel(c) }))}
          error={fieldError("channel")}
          testID={`${testID}-channel`}
        />
        <Select
          label={words.outcome}
          value={outcome}
          onChange={setOutcome}
          placeholder={words.none}
          clearLabel={words.none}
          options={outcomes}
          error={fieldError("outcome")}
          testID={`${testID}-outcome`}
        />
        <Field
          label={words.note}
          value={note}
          onChangeText={setNote}
          maxLength={1000}
          multiline
          error={fieldError("note")}
          testID={`${testID}-note`}
        />
        {next ? (
          <DateField
            label={next.label}
            hint={next.hint}
            value={nextContactAt}
            onChange={setNextContactAt}
            error={fieldError("nextContactAt")}
            testID={`${testID}-next`}
          />
        ) : null}
        {statuses ? (
          <Select
            label={statuses.label}
            value={status}
            onChange={setStatus}
            placeholder={words.none}
            clearLabel={words.none}
            options={statuses.options}
            error={fieldError("status")}
            testID={`${testID}-status`}
          />
        ) : null}
        {error && !hasFieldErrors(error) ? (
          <Notice tone="destructive" testID={`${testID}-problem`}>
            {errorText(t, error)}
          </Notice>
        ) : null}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  form: { gap: space[4] },
  phones: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
});
