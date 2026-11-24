import { Trash2 } from "lucide-react-native";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import {
  ADJUSTMENT_KINDS,
  useAdjustmentStep,
  useLegacyPayments,
  useRefund,
  useRemoveLegacyPayment,
  useStudentAdjustments,
  type AdjustmentKind,
} from "@/api/office-student-money";
import type { Payment } from "@/api/office-students";
import type { StudentDetail } from "@/api/types";
import { Button } from "@/components/button";
import { Confirm } from "@/components/confirm";
import { DateField } from "@/components/date-field";
import { Field } from "@/components/field";
import { Select } from "@/components/select";
import { Sheet } from "@/components/sheet";
import { Card, Divider, Notice, Segmented } from "@/components/surface";
import { Text } from "@/components/text";
import { centreToday, dayAsDate } from "@/lib/days";
import { fieldErrorOf, hasFieldErrors } from "@/lib/form";
import { errorText, useDate, useMoney, useTranslations } from "@/lib/i18n";
import { space, useTheme } from "@/lib/theme";

import { typedMoney } from "./payment-sheet";

/**
 * "Refund" (A-241): one of the student's payments and how much of it goes
 * back. The server refuses more than is left of the payment.
 */
export function RefundSheet({
  open,
  onClose,
  payments,
}: {
  open: boolean;
  onClose: () => void;
  payments: Payment[];
}) {
  const t = useTranslations();
  const tp = useTranslations("payments");
  const money = useMoney();
  const formatDate = useDate();
  const refund = useRefund();
  const refundable = payments.filter((p) => p.amount - p.refunded > 0);
  const [paymentId, setPaymentId] = useState<string | null>(null);
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setPaymentId(refundable[0]?.id ?? null);
      setAmount("");
      setReason("");
      refund.reset();
    }
  }
  const chosen = refundable.find((p) => p.id === paymentId);
  const fieldError = fieldErrorOf(t, refund.error);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={tp("refundTitle")}
      testID="refund"
      footer={
        refundable.length > 0 ? (
          <Button
            label={tp("refundTitle")}
            loading={refund.isPending}
            disabled={!chosen || typedMoney(amount) === 0}
            onPress={() => {
              if (!chosen) return;
              refund.mutate(
                {
                  paymentId: chosen.id,
                  amount: typedMoney(amount),
                  reason: reason.trim() || null,
                },
                { onSuccess: onClose },
              );
            }}
            testID="refund-save"
          />
        ) : undefined
      }
    >
      <View style={styles.form}>
        {refundable.length === 0 ? (
          <Text tone="mutedForeground" testID="refund-nothing">
            {tp("nothingToRefund")}
          </Text>
        ) : (
          <>
            <Text variant="small" tone="mutedForeground">
              {tp("refundHint")}
            </Text>
            <Select
              label={tp("pickPayment")}
              value={paymentId}
              onChange={(id) => {
                if (id) setPaymentId(id);
              }}
              options={refundable.map((p) => ({
                value: p.id,
                label: `${formatDate(dayAsDate(p.paidAt.slice(0, 10)), { dateStyle: "medium" })}, ${money(p.amount)}`,
                note: p.groupName,
              }))}
              testID="refund-payment"
            />
            {chosen ? (
              <Text variant="small" tone="mutedForeground" testID="refund-left">
                {tp("left", { amount: money(chosen.amount - chosen.refunded) })}
              </Text>
            ) : null}
            <Field
              label={tp("refundAmount")}
              value={amount}
              onChangeText={setAmount}
              keyboardType="number-pad"
              maxLength={15}
              error={fieldError("amount")}
              testID="refund-amount"
            />
            <Field
              label={tp("reason")}
              value={reason}
              onChangeText={setReason}
              multiline
              maxLength={500}
              testID="refund-reason"
            />
            {refund.error && !hasFieldErrors(refund.error) ? (
              <Notice tone="destructive" testID="refund-problem">
                {errorText(t, refund.error)}
              </Notice>
            ) : null}
          </>
        )}
      </View>
    </Sheet>
  );
}

/**
 * "Balance adjustment" (A-241): the debt or the credit a student brought from
 * the old system, or a correction. A sum is typed and a direction chosen; the
 * server keeps it with its sign.
 */
export function AdjustmentSheet({
  open,
  onClose,
  student,
}: {
  open: boolean;
  onClose: () => void;
  student: StudentDetail;
}) {
  const t = useTranslations();
  const ta = useTranslations("payments.adjust");
  const step = useAdjustmentStep();
  const groups = student.groups;
  const [membershipId, setMembershipId] = useState<string | null>(null);
  const [direction, setDirection] = useState<"debt" | "credit">("debt");
  const [amount, setAmount] = useState("");
  const [kind, setKind] = useState<AdjustmentKind>("OPENING");
  const [date, setDate] = useState<string | null>(centreToday());
  const [comment, setComment] = useState("");
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setMembershipId(groups[0]?.membershipId ?? null);
      setDirection("debt");
      setAmount("");
      setKind("OPENING");
      setDate(centreToday());
      setComment("");
      step.reset();
    }
  }
  const fieldError = fieldErrorOf(t, step.error);
  const sum = typedMoney(amount);
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={ta("title")}
      testID="adjust"
      footer={
        <Button
          label={t("common.save")}
          loading={step.isPending}
          disabled={!membershipId || sum === 0 || !date}
          onPress={() => {
            if (!membershipId || !date) return;
            step.mutate(
              {
                do: "add",
                input: {
                  membershipId,
                  amount: direction === "debt" ? -sum : sum,
                  kind,
                  date,
                  comment: comment.trim() || null,
                },
              },
              { onSuccess: onClose },
            );
          }}
          testID="adjust-save"
        />
      }
    >
      <View style={styles.form}>
        <Text variant="small" tone="mutedForeground">
          {ta("hint")}
        </Text>
        <Select
          label={ta("group")}
          value={membershipId}
          onChange={(id) => {
            if (id) setMembershipId(id);
          }}
          options={groups.map((g) => ({ value: g.membershipId, label: g.groupName }))}
          error={fieldError("membershipId")}
          testID="adjust-group"
        />
        <View style={styles.tight}>
          <Text variant="smallStrong">{ta("direction")}</Text>
          <Segmented
            options={[
              { value: "debt", label: ta("debt") },
              { value: "credit", label: ta("credit") },
            ]}
            value={direction}
            onChange={setDirection}
            testID="adjust-direction"
          />
        </View>
        <Field
          label={ta("amount")}
          value={amount}
          onChangeText={setAmount}
          keyboardType="number-pad"
          maxLength={15}
          error={fieldError("amount")}
          testID="adjust-amount"
        />
        <Select
          label={ta("kind")}
          value={kind}
          onChange={(value) => {
            if (value) setKind(value);
          }}
          options={ADJUSTMENT_KINDS.map((k) => ({
            value: k,
            label: t(`payments.adjustments.kinds.${k}`),
          }))}
          testID="adjust-kind"
        />
        <DateField
          label={ta("date")}
          value={date}
          onChange={setDate}
          error={fieldError("date")}
          testID="adjust-date"
        />
        <Field
          label={ta("comment")}
          value={comment}
          onChangeText={setComment}
          multiline
          maxLength={500}
          testID="adjust-comment"
        />
        {step.error && !hasFieldErrors(step.error) ? (
          <Notice tone="destructive" testID="adjust-problem">
            {errorText(t, step.error)}
          </Notice>
        ) : null}
      </View>
    </Sheet>
  );
}

/** The bin at the end of a row, for people who may take the row back. */
function RemoveButton({
  label,
  onPress,
  testID,
}: {
  label: string;
  onPress: () => void;
  testID: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      style={styles.icon}
      testID={testID}
    >
      <Trash2 size={18} color={colors.mutedForeground} />
    </Pressable>
  );
}

/**
 * "Opening balances and corrections" under a student's payments (A-241):
 * shown only when there are some. Someone who may refund removes one after a
 * question; the balance then moves back.
 */
export function Adjustments({ studentId, mayRemove }: { studentId: string; mayRemove: boolean }) {
  const t = useTranslations();
  const ta = useTranslations("payments.adjustments");
  const money = useMoney();
  const formatDate = useDate();
  const query = useStudentAdjustments(studentId);
  const step = useAdjustmentStep();
  const [removing, setRemoving] = useState<string | null>(null);
  const rows = query.data ?? [];
  if (rows.length === 0) return null;
  return (
    <View style={styles.tight} testID="adjustments">
      <Text variant="smallStrong">{ta("title")}</Text>
      <Card style={styles.flush}>
        {rows.map((row, index) => (
          <View key={row.id}>
            {index > 0 ? <Divider /> : null}
            <View style={styles.row} testID={`adjustment-${row.id}`}>
              <View style={styles.fill}>
                <Text variant="bodyStrong">
                  {formatDate(dayAsDate(row.date.slice(0, 10)), { dateStyle: "medium" })}
                </Text>
                <Text variant="small" tone="mutedForeground">
                  {[row.groupName, ta(`kinds.${row.kind}`), row.createdByName]
                    .filter(Boolean)
                    .join(", ")}
                </Text>
                {row.comment ? (
                  <Text variant="small" tone="mutedForeground">
                    {row.comment}
                  </Text>
                ) : null}
              </View>
              <Text
                variant="bodyStrong"
                tone={row.amount < 0 ? "destructive" : "success"}
                style={styles.number}
              >
                {row.amount > 0 ? "+" : ""}
                {money(row.amount)}
              </Text>
              {mayRemove ? (
                <RemoveButton
                  label={ta("remove")}
                  onPress={() => {
                    step.reset();
                    setRemoving(row.id);
                  }}
                  testID={`adjustment-remove-${row.id}`}
                />
              ) : null}
            </View>
          </View>
        ))}
      </Card>
      <Confirm
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title={ta("removeTitle")}
        text={ta("removeText")}
        label={ta("remove")}
        loading={step.isPending}
        problem={step.error ? errorText(t, step.error) : null}
        onConfirm={() => {
          if (removing) {
            step.mutate({ do: "remove", id: removing }, { onSuccess: () => setRemoving(null) });
          }
        }}
        testID="adjustment-delete"
      />
    </View>
  );
}

/**
 * "Payments in the previous system" (A-241): rows carried over for the record,
 * counted in no balance. Shown only when the student has some; a server that
 * does not know the call yet simply shows none.
 */
export function LegacyPayments({
  studentId,
  mayRemove,
}: {
  studentId: string;
  mayRemove: boolean;
}) {
  const t = useTranslations();
  const tl = useTranslations("payments.legacy");
  const money = useMoney();
  const formatDate = useDate();
  const query = useLegacyPayments(studentId);
  const remove = useRemoveLegacyPayment(studentId);
  const [removing, setRemoving] = useState<string | null>(null);
  const rows = query.data ?? [];
  if (rows.length === 0) return null;
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  return (
    <View style={styles.tight} testID="legacy-payments">
      <View style={styles.line}>
        <Text variant="smallStrong" style={styles.fill}>
          {tl("title")}
        </Text>
        <Text variant="small" tone="mutedForeground" testID="legacy-payments-total">
          {tl("total", { amount: money(total) })}
        </Text>
      </View>
      <Text variant="small" tone="mutedForeground">
        {tl("hint")}
      </Text>
      <Card style={styles.flush}>
        {rows.map((row, index) => (
          <View key={row.id}>
            {index > 0 ? <Divider /> : null}
            <View style={styles.row} testID={`legacy-payment-${row.id}`}>
              <View style={styles.fill}>
                <Text variant="bodyStrong">
                  {formatDate(dayAsDate(row.paidAt.slice(0, 10)), { dateStyle: "medium" })}
                </Text>
                <Text variant="small" tone="mutedForeground">
                  {[row.groupName, row.method].filter(Boolean).join(", ") || "—"}
                </Text>
                {row.comment ? (
                  <Text variant="small" tone="mutedForeground">
                    {row.comment}
                  </Text>
                ) : null}
              </View>
              <Text
                variant="bodyStrong"
                tone={row.amount < 0 ? "destructive" : undefined}
                style={styles.number}
              >
                {money(row.amount)}
              </Text>
              {mayRemove ? (
                <RemoveButton
                  label={tl("remove")}
                  onPress={() => {
                    remove.reset();
                    setRemoving(row.id);
                  }}
                  testID={`legacy-payment-remove-${row.id}`}
                />
              ) : null}
            </View>
          </View>
        ))}
      </Card>
      <Confirm
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title={tl("removeTitle")}
        text={tl("removeText")}
        label={tl("remove")}
        loading={remove.isPending}
        problem={remove.error ? errorText(t, remove.error) : null}
        onConfirm={() => {
          if (removing) remove.mutate(removing, { onSuccess: () => setRemoving(null) });
        }}
        testID="legacy-payment-delete"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  form: { gap: space[4] },
  tight: { gap: space[2] },
  fill: { flex: 1 },
  icon: { padding: space[1] },
  flush: { padding: 0, gap: 0, overflow: "hidden" },
  line: { flexDirection: "row", alignItems: "center", gap: space[2] },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: space[3],
    paddingHorizontal: space[4],
    paddingVertical: space[3],
  },
  number: { fontVariant: ["tabular-nums"] },
});
