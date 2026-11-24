import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { useBulkStudents, useStudentOptions, type BulkStudentsInput } from "@/api/office-students";
import { Button } from "@/components/button";
import { Confirm } from "@/components/confirm";
import { Field } from "@/components/field";
import { Select } from "@/components/select";
import { Sheet } from "@/components/sheet";
import { Card, Notice } from "@/components/surface";
import { Text } from "@/components/text";
import { ExcelButton } from "@/features/files/excel-button";
import { typedWhole } from "@/features/groups/group-money-parts";
import { JoinGroupSheet } from "@/features/leads/join-group-sheet";
import { fieldErrorOf, hasFieldErrors } from "@/lib/form";
import { errorText, useTranslations } from "@/lib/i18n";
import { can, useMe } from "@/lib/session";
import { space } from "@/lib/theme";

import { SendSmsSheet } from "./sms-sheet";

type Doing = null | "group" | "discount" | "sms" | "archive" | "restore";

/** May this person do anything at all to several students at once? Without it there are no tick boxes. */
export function mayBulkStudents(me: ReturnType<typeof useMe>): boolean {
  return (
    can(me, "students.update") ||
    can(me, "students.delete") ||
    can(me, "sms.send") ||
    can(me, "discounts.give")
  );
}

/**
 * What is done to the ticked students together (A-260), as the site's bar
 * over the Students list: put into a group, given a discount in a group, sent
 * an SMS, taken as an Excel file, archived (or brought back, in the archive).
 * What came of it stays on the page after the ticks are cleared.
 */
export function StudentsBulkBar({
  ids,
  onClear,
  archived,
}: {
  /** The ticked students that are on the screen now. */
  ids: string[];
  onClear: () => void;
  /** The archive is shown: its students can only be brought back, or taken as a file. */
  archived: boolean;
}) {
  const t = useTranslations();
  const tb = useTranslations("students.bulk");
  const me = useMe();
  const bulk = useBulkStudents();
  const [doing, setDoing] = useState<Doing>(null);
  const [note, setNote] = useState<string | null>(null);
  const options = useStudentOptions(doing === "group" || doing === "discount");
  const count = ids.length;
  // The site names a group with its teacher and its time, since names repeat.
  const groups = (options.data?.groups ?? []).map((g) => ({
    id: g.id,
    name: `${g.name}${g.teacherName ? ` (${g.teacherName})` : ""}${g.time ? ` · ${g.time}` : ""}`,
  }));

  const start = (next: Doing) => {
    bulk.reset();
    setNote(null);
    setDoing(next);
  };
  const run = (input: BulkStudentsInput) =>
    bulk.mutate(input, {
      onSuccess: (result) => {
        setDoing(null);
        setNote(tb("done", { done: result.done, skipped: result.skipped }));
        onClear();
      },
    });

  return (
    <>
      {note ? (
        <Notice tone="success" testID="students-bulk-note">
          {note}
        </Notice>
      ) : null}
      {count > 0 ? (
        <Card style={styles.bar} testID="students-bulk">
          <Text variant="bodyStrong" testID="students-bulk-count">
            {tb("selected", { count })}
          </Text>
          <View style={styles.wrap}>
            {can(me, "students.update") && !archived ? (
              <Button
                variant="outline"
                compact
                label={tb("addToGroup")}
                onPress={() => start("group")}
                testID="bulk-add-to-group"
              />
            ) : null}
            {can(me, "discounts.give") && !archived ? (
              <Button
                variant="outline"
                compact
                label={tb("discount")}
                onPress={() => start("discount")}
                testID="bulk-discount"
              />
            ) : null}
            {can(me, "sms.send") && !archived ? (
              <Button
                variant="outline"
                compact
                label={tb("sms")}
                onPress={() => start("sms")}
                testID="bulk-sms"
              />
            ) : null}
            <ExcelButton
              path="/students/export.xlsx"
              params={{ ids: ids.join(","), archived: archived ? true : undefined }}
              label={tb("excel")}
              compact
              testID="bulk-excel"
            />
            {can(me, "students.delete") ? (
              <Button
                variant={archived ? "outline" : "destructive"}
                compact
                label={archived ? tb("restore") : tb("archive")}
                onPress={() => start(archived ? "restore" : "archive")}
                testID="bulk-archive"
              />
            ) : null}
            <Button
              variant="ghost"
              compact
              label={tb("clear")}
              onPress={() => {
                setNote(null);
                onClear();
              }}
              testID="bulk-clear"
            />
          </View>
        </Card>
      ) : null}
      <JoinGroupSheet
        open={doing === "group"}
        onClose={() => setDoing(null)}
        title={tb("addTitle", { count })}
        hint={tb("addHint")}
        groups={groups}
        saving={bulk.isPending}
        error={bulk.error}
        initialStatus="ACTIVE"
        onSave={(input) => run({ action: "addToGroup", studentIds: ids, ...input })}
        testID="bulk-join"
      />
      <DiscountSheet
        open={doing === "discount"}
        onClose={() => setDoing(null)}
        count={count}
        groups={groups}
        saving={bulk.isPending}
        error={bulk.error}
        onSave={(input) => run({ action: "discount", studentIds: ids, ...input })}
      />
      <SendSmsSheet
        open={doing === "sms"}
        onClose={() => setDoing(null)}
        target={doing === "sms" && count > 0 ? { kind: "students", studentIds: ids } : null}
        title={tb("smsTitle", { count })}
        testID="bulk-sms-sheet"
      />
      <Confirm
        open={doing === "archive" || doing === "restore"}
        onClose={() => setDoing(null)}
        title={tb(archived ? "restoreTitle" : "archiveTitle", { count })}
        text={tb(archived ? "restoreText" : "archiveText")}
        label={archived ? tb("restore") : tb("archive")}
        destructive={!archived}
        loading={bulk.isPending}
        problem={bulk.error ? errorText(t, bulk.error) : null}
        onConfirm={() => run({ action: archived ? "restore" : "archive", studentIds: ids })}
        testID="bulk-confirm"
      />
    </>
  );
}

/**
 * One discount for every ticked student who is in the chosen group: the lower
 * monthly price and for how many months. The server leaves out those who are
 * not in the group or already pay less.
 */
function DiscountSheet({
  open,
  onClose,
  count,
  groups,
  saving,
  error,
  onSave,
}: {
  open: boolean;
  onClose: () => void;
  count: number;
  groups: Array<{ id: string; name: string }>;
  saving: boolean;
  error: unknown;
  onSave: (input: {
    groupId: string;
    discountedPrice: number;
    months: number;
    comment: string | null;
  }) => void;
}) {
  const t = useTranslations();
  const tb = useTranslations("students.bulk");
  const [groupId, setGroupId] = useState<string | null>(null);
  const [price, setPrice] = useState("");
  const [months, setMonths] = useState("1");
  const [comment, setComment] = useState("");
  const [missing, setMissing] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setGroupId(null);
      setPrice("");
      setMonths("1");
      setComment("");
      setMissing(false);
    }
  }
  const fieldError = fieldErrorOf(t, error);
  const typedPrice = typedWhole(price);
  const typedMonths = typedWhole(months);

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={tb("discountTitle", { count })}
      testID="bulk-discount-sheet"
      footer={
        <Button
          label={t("common.save")}
          loading={saving}
          onPress={() => {
            if (!groupId || typedPrice === null || typedMonths === null) {
              setMissing(true);
              return;
            }
            setMissing(false);
            onSave({
              groupId,
              discountedPrice: typedPrice,
              months: typedMonths,
              comment: comment.trim() || null,
            });
          }}
          testID="bulk-discount-save"
        />
      }
    >
      <View style={styles.form}>
        <Text tone="mutedForeground">{tb("discountHint")}</Text>
        <Select
          label={t("students.filters.group")}
          value={groupId}
          onChange={setGroupId}
          placeholder={t("students.form.groupPlaceholder")}
          options={groups.map((g) => ({ value: g.id, label: g.name }))}
          error={fieldError("groupId") ?? (missing && !groupId ? t("validation.required") : null)}
          testID="bulk-discount-group"
        />
        <Field
          label={t("discounts.form.price")}
          value={price}
          onChangeText={(text) => setPrice(text.replace(/\D/g, "").slice(0, 13))}
          keyboardType="number-pad"
          error={
            fieldError("discountedPrice") ??
            (missing && typedPrice === null ? t("validation.required") : null)
          }
          testID="bulk-discount-price"
        />
        <Field
          label={t("discounts.form.months")}
          value={months}
          onChangeText={(text) => setMonths(text.replace(/\D/g, "").slice(0, 2))}
          keyboardType="number-pad"
          error={
            fieldError("months") ??
            (missing && typedMonths === null ? t("validation.required") : null)
          }
          testID="bulk-discount-months"
        />
        <Field
          label={t("discounts.form.comment")}
          value={comment}
          onChangeText={setComment}
          multiline
          maxLength={500}
          error={fieldError("comment")}
          testID="bulk-discount-comment"
        />
        {error && !hasFieldErrors(error) ? (
          <Notice tone="destructive" testID="bulk-discount-problem">
            {errorText(t, error)}
          </Notice>
        ) : null}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  bar: { gap: space[3] },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: space[2], alignItems: "center" },
  form: { gap: space[4] },
});
