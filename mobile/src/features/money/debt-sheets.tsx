import { Phone } from "lucide-react-native";
import { useState } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";

import {
  DEBT_CHANNELS,
  DEBT_STAFF_OUTCOMES,
  useDebtContacts,
  useLogDebtContact,
  type DebtCase,
  type DebtChannel,
  type DebtStaffOutcome,
} from "@/api/office-money";
import { Button } from "@/components/button";
import { DateField } from "@/components/date-field";
import { Field } from "@/components/field";
import { Select } from "@/components/select";
import { Sheet } from "@/components/sheet";
import { Badge, Divider, Loading, Notice } from "@/components/surface";
import { Text } from "@/components/text";
import { typedMoney } from "@/features/office/payment-sheet";
import { dayAsDate } from "@/lib/days";
import { fieldErrorOf, hasFieldErrors } from "@/lib/form";
import { errorText, useDate, useMoney, useTranslations } from "@/lib/i18n";
import { space, useTheme } from "@/lib/theme";

/** Opens the phone's dialler with a number. */
export function dial(phone: string): void {
  void Linking.openURL(`tel:${phone.replace(/[^+0-9]/g, "")}`);
}

/** A phone number that dials when pressed. */
export function PhoneLine({
  phone,
  note,
  testID,
}: {
  phone: string;
  note?: string;
  testID?: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="link"
      onPress={() => dial(phone)}
      hitSlop={6}
      style={styles.phone}
      testID={testID}
    >
      <Phone size={14} color={colors.primary} />
      <Text tone="primary">{phone}</Text>
      {note ? (
        <Text variant="small" tone="mutedForeground">
          {note}
        </Text>
      ) : null}
    </Pressable>
  );
}

/**
 * A contact with a debtor written down (A-236), as the site's dialog: how
 * (call, Telegram, SMS, came in, note), what came of it, and if they promised
 * to pay, by when and how much. The student's and the parent's numbers dial.
 */
export function DebtContactSheet({
  debt,
  channel: firstChannel,
  open,
  onClose,
}: {
  debt: DebtCase;
  /** "Call and log the outcome" starts on Call, "Log a contact" on Note. */
  channel: DebtChannel;
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations();
  const td = useTranslations("debts");
  const save = useLogDebtContact(debt.id);
  const [channel, setChannel] = useState<DebtChannel>(firstChannel);
  const [outcome, setOutcome] = useState<DebtStaffOutcome | null>(null);
  const [promisedAt, setPromisedAt] = useState<string | null>(null);
  const [promisedAmount, setPromisedAmount] = useState("");
  const [note, setNote] = useState("");
  const [missing, setMissing] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setChannel(firstChannel);
      setOutcome(null);
      setPromisedAt(null);
      setPromisedAmount("");
      setNote("");
      setMissing(false);
      save.reset();
    }
  }
  const promised = outcome === "PROMISED";
  const fieldError = fieldErrorOf(t, save.error);

  const submit = () => {
    if (promised && !promisedAt) {
      setMissing(true);
      return;
    }
    save.mutate(
      {
        channel,
        outcome,
        promisedAt: promised ? promisedAt : null,
        promisedAmount: promised && promisedAmount.trim() ? typedMoney(promisedAmount) : null,
        note: note.trim() || null,
      },
      { onSuccess: onClose },
    );
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={td("dialog.title", { name: debt.studentName })}
      testID="debt-contact"
      footer={
        <Button
          label={t("common.save")}
          loading={save.isPending}
          onPress={submit}
          testID="debt-contact-save"
        />
      }
    >
      <View style={styles.form}>
        {save.error && !hasFieldErrors(save.error) ? (
          <Notice tone="destructive" testID="debt-contact-problem">
            {errorText(t, save.error)}
          </Notice>
        ) : null}
        {debt.phone || debt.parentPhone ? (
          <View style={styles.phones} testID="debt-contact-phones">
            {debt.phone ? <PhoneLine phone={debt.phone} testID="debt-contact-phone" /> : null}
            {debt.parentPhone ? (
              <PhoneLine
                phone={debt.parentPhone}
                note={td("dialog.parentPhone")}
                testID="debt-contact-parent"
              />
            ) : null}
          </View>
        ) : null}
        <Select
          label={td("dialog.channel")}
          value={channel}
          onChange={(value) => setChannel(value ?? firstChannel)}
          options={DEBT_CHANNELS.map((c) => ({ value: c, label: td(`channels.${c}`) }))}
          testID="debt-contact-channel"
        />
        <Select
          label={td("dialog.outcome")}
          value={outcome}
          onChange={setOutcome}
          clearLabel={td("dialog.none")}
          placeholder={td("dialog.none")}
          options={DEBT_STAFF_OUTCOMES.map((o) => ({ value: o, label: td(`outcomes.${o}`) }))}
          testID="debt-contact-outcome"
        />
        {promised ? (
          <>
            <DateField
              label={td("dialog.promisedAt")}
              value={promisedAt}
              onChange={setPromisedAt}
              error={
                fieldError("promisedAt") ??
                (missing && !promisedAt ? t("validation.required") : null)
              }
              testID="debt-contact-promised-at"
            />
            <Field
              label={td("dialog.promisedAmount")}
              value={promisedAmount}
              onChangeText={setPromisedAmount}
              keyboardType="number-pad"
              error={fieldError("promisedAmount")}
              testID="debt-contact-promised-amount"
            />
          </>
        ) : null}
        <Field
          label={td("dialog.note")}
          value={note}
          onChangeText={setNote}
          multiline
          maxLength={1000}
          error={fieldError("note")}
          testID="debt-contact-note"
        />
      </View>
    </Sheet>
  );
}

/** What was said to a debtor and what the server did on its own, newest first. */
export function DebtHistorySheet({
  debt,
  onClose,
}: {
  debt: DebtCase | null;
  onClose: () => void;
}) {
  const t = useTranslations();
  const td = useTranslations("debts");
  const date = useDate();
  const money = useMoney();
  const query = useDebtContacts(debt?.id ?? null);
  return (
    <Sheet
      open={debt !== null}
      onClose={onClose}
      title={td("history.title", { name: debt?.studentName ?? "" })}
      testID="debt-history"
    >
      <View style={styles.form}>
        {debt ? (
          <Text tone="mutedForeground" testID="debt-history-sum">
            {[
              money(debt.amount),
              td("days", { count: debt.daysOverdue }),
              debt.brokenPromises > 0 ? td("brokenPromises", { count: debt.brokenPromises }) : null,
            ]
              .filter(Boolean)
              .join(", ")}
          </Text>
        ) : null}
        {query.isLoading ? (
          <Loading />
        ) : !query.data ? (
          <Notice tone="destructive">{errorText(t, query.error)}</Notice>
        ) : query.data.length === 0 ? (
          <Text tone="mutedForeground" testID="debt-history-empty">
            {td("history.empty")}
          </Text>
        ) : (
          <View testID="debt-history-list">
            {query.data.map((line, index) => (
              <View key={line.id}>
                {index > 0 ? <Divider /> : null}
                <View style={styles.line} testID={`debt-contact-${line.id}`}>
                  <View style={styles.lineHead}>
                    <Badge
                      label={td(`channels.${line.channel}`)}
                      tone={line.auto ? "neutral" : "accent"}
                    />
                    {line.outcome ? (
                      <Text
                        variant="bodyStrong"
                        tone={
                          line.outcome === "PROMISE_BROKEN" || line.outcome === "REFUSED"
                            ? "destructive"
                            : "foreground"
                        }
                      >
                        {td(`outcomes.${line.outcome}`)}
                      </Text>
                    ) : null}
                  </View>
                  {line.promisedAt ? (
                    <Text variant="small" tone="mutedForeground">
                      {td("history.promise", {
                        date: date(dayAsDate(line.promisedAt), { dateStyle: "medium" }),
                      })}
                      {line.promisedAmount ? `, ${money(line.promisedAmount)}` : ""}
                    </Text>
                  ) : null}
                  {line.note ? <Text>{line.note}</Text> : null}
                  <Text variant="small" tone="mutedForeground">
                    {[
                      date(new Date(line.createdAt), { dateStyle: "medium", timeStyle: "short" }),
                      line.auto
                        ? td("auto")
                        : line.createdBy
                          ? td("by", { name: line.createdBy })
                          : null,
                    ]
                      .filter(Boolean)
                      .join(", ")}
                  </Text>
                </View>
              </View>
            ))}
          </View>
        )}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  form: { gap: space[4] },
  phones: { gap: space[2] },
  phone: { flexDirection: "row", alignItems: "center", gap: space[2], minHeight: 32 },
  line: { gap: space[1], paddingVertical: space[3] },
  lineHead: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: space[2] },
});
