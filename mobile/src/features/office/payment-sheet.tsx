import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { usePaymentInfo, usePaymentOptions, useTakePayment } from "@/api/office-students";
import type { StudentRow } from "@/api/types";
import { Button } from "@/components/button";
import { DateField } from "@/components/date-field";
import { Field } from "@/components/field";
import { Select } from "@/components/select";
import { Sheet } from "@/components/sheet";
import { Notice } from "@/components/surface";
import { Text } from "@/components/text";
import { ApiError } from "@/lib/api";
import { centreToday, dayAsDate } from "@/lib/days";
import { errorText, useDate, useMoney, useTranslations } from "@/lib/i18n";
import { space, useTheme } from "@/lib/theme";

/** The digits of a typed sum: "1 200 000" is 1200000. */
export function typedMoney(text: string): number {
  return Number(text.replace(/\D/g, "")) || 0;
}

/**
 * The site's Payment dialog (A-231): into which group, how much, how it was
 * paid, for which month and on which day. The group's balance and price are
 * shown, and **Fill in** writes the sum the server suggests (the debt, or a
 * month's price). The server checks everything again.
 */
export function PaymentSheet({
  open,
  onClose,
  student,
}: {
  open: boolean;
  onClose: () => void;
  student: Pick<StudentRow, "id" | "fullName" | "groups">;
}) {
  const t = useTranslations();
  const tp = useTranslations("payments");
  const money = useMoney();
  const date = useDate();
  const { colors } = useTheme();
  // A payment goes into a group the student is in now.
  const memberships = student.groups.filter(
    (g) => g.status !== "ARCHIVED" && g.status !== "GRADUATED",
  );
  const [membershipId, setMembershipId] = useState<string | null>(null);
  const [methodId, setMethodId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [month, setMonth] = useState<string | null>(null);
  const [paidAt, setPaidAt] = useState<string | null>(centreToday());
  const [comment, setComment] = useState("");
  const [missing, setMissing] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  const take = useTakePayment();
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setMembershipId(memberships[0]?.membershipId ?? null);
      setMethodId(null);
      setAmount("");
      setMonth(null);
      setPaidAt(centreToday());
      setComment("");
      setMissing(false);
      take.reset();
    }
  }
  const options = usePaymentOptions(open);
  const info = usePaymentInfo(open ? membershipId : null);
  // The chosen month, or the suggested one until another is picked.
  const effectiveMonth = month ?? info.data?.suggestedMonth ?? null;
  const months = info.data?.months ?? (effectiveMonth ? [effectiveMonth] : []);
  const monthLabel = (m: string) => date(dayAsDate(m), { month: "short", year: "numeric" });
  const sum = typedMoney(amount);
  const fields = take.error instanceof ApiError ? take.error.fields : undefined;
  const fieldError = (key: string) => {
    const first = fields?.[key]?.[0];
    return first && t.has(first) ? t(first) : null;
  };

  const save = () => {
    if (!membershipId || !methodId || sum <= 0 || !effectiveMonth || !paidAt) {
      setMissing(true);
      return;
    }
    setMissing(false);
    take.mutate(
      {
        membershipId,
        paymentMethodId: methodId,
        amount: sum,
        effectiveMonth,
        paidAt,
        comment: comment.trim() || null,
      },
      { onSuccess: onClose },
    );
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={tp("dialogTitle", { name: student.fullName })}
      testID="payment-sheet"
      footer={
        memberships.length > 0 ? (
          <Button
            variant="saffron"
            label={tp("pay")}
            loading={take.isPending}
            onPress={save}
            testID="payment-save"
          />
        ) : undefined
      }
    >
      {memberships.length === 0 ? (
        <Text tone="mutedForeground" testID="payment-no-groups">
          {tp("noMemberships")}
        </Text>
      ) : (
        <View style={styles.form}>
          {memberships.length > 1 ? (
            <Select
              label={tp("group")}
              value={membershipId}
              onChange={(v) => {
                setMembershipId(v);
                setMonth(null);
              }}
              options={memberships.map((g) => ({
                value: g.membershipId,
                label: g.groupName,
                note: g.courseName,
              }))}
              testID="payment-group"
            />
          ) : (
            <Text variant="bodyStrong">{memberships[0]!.groupName}</Text>
          )}
          {info.data ? (
            <View style={[styles.facts, { backgroundColor: colors.muted }]} testID="payment-info">
              <View style={styles.fact}>
                <Text variant="small" tone="mutedForeground">
                  {tp("balance")}
                </Text>
                <Text
                  variant="figure"
                  tone={info.data.balance < 0 ? "destructive" : "foreground"}
                  testID="payment-balance"
                >
                  {money(info.data.balance)}
                </Text>
              </View>
              <View style={styles.fact}>
                <Text variant="small" tone="mutedForeground">
                  {tp("monthlyPrice")}
                </Text>
                <Text variant="figure">{money(info.data.monthlyPrice)}</Text>
              </View>
            </View>
          ) : null}
          {info.error ? <Notice tone="destructive">{errorText(t, info.error)}</Notice> : null}
          <View style={styles.amount}>
            <View style={styles.fill}>
              <Field
                label={tp("amount")}
                value={amount}
                onChangeText={(text) => {
                  const digits = text.replace(/\D/g, "").slice(0, 13);
                  setAmount(digits.replace(/\B(?=(\d{3})+(?!\d))/g, " "));
                }}
                keyboardType="number-pad"
                error={
                  fieldError("amount") ?? (missing && sum <= 0 ? t("validation.required") : null)
                }
                testID="payment-amount"
              />
            </View>
            {info.data && info.data.suggestedAmount > 0 ? (
              <Button
                variant="outline"
                label={tp("autoFill")}
                onPress={() =>
                  setAmount(String(info.data.suggestedAmount).replace(/\B(?=(\d{3})+(?!\d))/g, " "))
                }
                style={styles.fillIn}
                testID="payment-fill"
              />
            ) : null}
          </View>
          <Select
            label={tp("method")}
            value={methodId}
            onChange={setMethodId}
            placeholder={tp("methodPlaceholder")}
            options={(options.data?.methods ?? []).map((m) => ({ value: m.id, label: m.name }))}
            error={
              fieldError("paymentMethodId") ??
              (missing && !methodId ? t("validation.required") : null)
            }
            testID="payment-method"
          />
          <Select
            label={tp("effectiveMonth")}
            value={effectiveMonth}
            onChange={setMonth}
            options={months.map((m) => ({ value: m, label: monthLabel(m) }))}
            error={fieldError("effectiveMonth")}
            testID="payment-month"
          />
          <DateField
            label={tp("date")}
            value={paidAt}
            onChange={setPaidAt}
            error={fieldError("paidAt") ?? (missing && !paidAt ? t("validation.date") : null)}
            testID="payment-date"
          />
          <Field
            label={tp("comment")}
            value={comment}
            onChangeText={setComment}
            maxLength={500}
            testID="payment-comment"
          />
          {take.error && !fields ? (
            <Notice tone="destructive" testID="payment-problem">
              {errorText(t, take.error)}
            </Notice>
          ) : null}
        </View>
      )}
    </Sheet>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  form: { gap: space[4] },
  facts: { flexDirection: "row", borderRadius: 10, padding: space[3], gap: space[4] },
  fact: { flex: 1, gap: 2 },
  amount: { flexDirection: "row", alignItems: "flex-start", gap: space[2] },
  fillIn: { marginTop: 24 },
});
