import { Plus } from "lucide-react-native";
import { useState } from "react";
import { StyleSheet, View } from "react-native";

import { useDaysOff, useDeleteDayOff, useSaveDayOff, type DayOff } from "@/api/office-settings";
import { Button } from "@/components/button";
import { Check } from "@/components/check";
import { Confirm } from "@/components/confirm";
import { DateField } from "@/components/date-field";
import { Field } from "@/components/field";
import { Header } from "@/components/header";
import { Select } from "@/components/select";
import { Sheet } from "@/components/sheet";
import { Card, Divider, EmptyState, Notice, Screen } from "@/components/surface";
import { Text } from "@/components/text";
import { PendingScreen } from "@/features/shared/pending-screen";
import { dayAsDate } from "@/lib/days";
import { fieldErrorOf, hasFieldErrors } from "@/lib/form";
import { errorText, useDate, useTranslations } from "@/lib/i18n";
import { useMe } from "@/lib/session";
import { space, useTheme } from "@/lib/theme";

import { RowPress } from "./parts";

/**
 * Days off (A-242): the site's Settings → Days off. The dates with no lessons
 * at a branch, the newest first; a press opens one to change or delete, and
 * "New day off" adds one, telling that day's students and parents if asked.
 */
export function DaysOffScreen() {
  const t = useTranslations();
  const tr = useTranslations("settings.daysOff");
  const date = useDate();
  const { colors } = useTheme();
  const query = useDaysOff();
  const [form, setForm] = useState<DayOff | "new" | null>(null);
  const [shown, setShown] = useState<DayOff | "new">("new");
  const openForm = (next: DayOff | "new") => {
    setShown(next);
    setForm(next);
  };

  const header = (
    <Header
      back
      title={tr("title")}
      right={
        <Button
          compact
          icon={<Plus size={16} color={colors.primaryForeground} />}
          label={tr("add")}
          onPress={() => openForm("new")}
          testID="days-off-add"
        />
      }
    />
  );
  if (!query.data) return <PendingScreen header={header} query={query} />;
  const rows = query.data.pages.flatMap((page) => page.items);

  return (
    <Screen header={header} onRefresh={() => void query.refetch()} refreshing={query.isRefetching}>
      <Text variant="small" tone="mutedForeground">
        {tr("description")}
      </Text>
      {rows.length === 0 ? (
        <EmptyState title={t("common.nothingFound")} />
      ) : (
        <Card style={styles.flush} testID="days-off-list">
          {rows.map((row, index) => (
            <View key={row.id}>
              {index > 0 ? <Divider /> : null}
              <RowPress onPress={() => openForm(row)} testID={`day-off-${row.id}`}>
                <View style={styles.fill}>
                  <Text variant="bodyStrong">
                    {date(dayAsDate(row.date), { dateStyle: "medium" })}
                  </Text>
                  <Text variant="small" tone="mutedForeground" numberOfLines={3}>
                    {row.reason}
                  </Text>
                </View>
                <Text
                  variant="small"
                  tone="mutedForeground"
                  numberOfLines={1}
                  style={styles.branch}
                >
                  {row.branchName}
                </Text>
              </RowPress>
            </View>
          ))}
        </Card>
      )}
      {query.hasNextPage ? (
        <Button
          variant="outline"
          label={t("mobile.studentsPage.more")}
          loading={query.isFetchingNextPage}
          onPress={() => void query.fetchNextPage()}
          testID="days-off-more"
        />
      ) : null}
      <DayOffSheet
        key={shown === "new" ? "new" : shown.id}
        open={form !== null}
        onClose={() => setForm(null)}
        dayOff={shown === "new" ? undefined : shown}
      />
    </Screen>
  );
}

function DayOffSheet({
  open,
  onClose,
  dayOff,
}: {
  open: boolean;
  onClose: () => void;
  dayOff?: DayOff;
}) {
  const t = useTranslations();
  const tr = useTranslations("settings.daysOff");
  const me = useMe();
  const formatDate = useDate();
  const save = useSaveDayOff(dayOff?.id ?? null);
  const remove = useDeleteDayOff();
  const defaultBranch = me.activeBranch?.id ?? me.branches[0]?.id ?? null;
  const [branchId, setBranchId] = useState<string | null>(dayOff?.branchId ?? defaultBranch);
  const [date, setDate] = useState<string | null>(dayOff?.date ?? null);
  const [reason, setReason] = useState(dayOff?.reason ?? "");
  const [notify, setNotify] = useState(true);
  const [missing, setMissing] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setBranchId(dayOff?.branchId ?? defaultBranch);
      setDate(dayOff?.date ?? null);
      setReason(dayOff?.reason ?? "");
      setNotify(true);
      setMissing(false);
      save.reset();
      remove.reset();
    }
  }
  const fieldError = fieldErrorOf(t, save.error);
  const required = (empty: boolean) => (missing && empty ? t("validation.required") : null);

  const submit = () => {
    if (!branchId || !date || !reason.trim()) {
      setMissing(true);
      return;
    }
    save.mutate({ branchId, date, reason: reason.trim(), notify }, { onSuccess: onClose });
  };

  return (
    <>
      <Sheet
        open={open && !deleting}
        onClose={onClose}
        title={dayOff ? tr("edit") : tr("add")}
        testID="day-off-form"
        footer={
          <View style={styles.footer}>
            <Button
              label={t("common.save")}
              loading={save.isPending}
              onPress={submit}
              testID="day-off-save"
            />
            {dayOff ? (
              <Button
                variant="ghost"
                label={t("common.delete")}
                onPress={() => setDeleting(true)}
                testID="day-off-delete"
              />
            ) : null}
          </View>
        }
      >
        <View style={styles.form}>
          {save.error && !hasFieldErrors(save.error) ? (
            <Notice tone="destructive" testID="day-off-problem">
              {errorText(t, save.error)}
            </Notice>
          ) : null}
          {!dayOff && me.branches.length > 1 ? (
            <Select
              label={t("branch.select")}
              value={branchId}
              onChange={setBranchId}
              options={me.branches.map((b) => ({ value: b.id, label: b.name }))}
              error={fieldError("branchId") ?? required(!branchId)}
              testID="day-off-branch"
            />
          ) : null}
          <DateField
            label={tr("date")}
            value={date}
            onChange={setDate}
            error={fieldError("date") ?? required(!date)}
            testID="day-off-date"
          />
          <Field
            label={tr("reason")}
            value={reason}
            onChangeText={setReason}
            multiline
            maxLength={500}
            error={fieldError("reason") ?? required(!reason.trim())}
            testID="day-off-reason"
          />
          {!dayOff ? (
            <Check
              label={tr("notify")}
              value={notify}
              onChange={setNotify}
              testID="day-off-notify"
            />
          ) : null}
        </View>
      </Sheet>
      <Confirm
        open={open && deleting}
        onClose={() => setDeleting(false)}
        title={tr("deleteTitle")}
        text={tr("deleteText", {
          date: dayOff ? formatDate(dayAsDate(dayOff.date), { dateStyle: "medium" }) : "",
        })}
        label={t("common.delete")}
        destructive
        loading={remove.isPending}
        problem={remove.error ? errorText(t, remove.error) : null}
        onConfirm={() => {
          if (!dayOff) return;
          remove.mutate(dayOff.id, {
            onSuccess: () => {
              setDeleting(false);
              onClose();
            },
          });
        }}
        testID="day-off-delete-confirm"
      />
    </>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  flush: { padding: 0, gap: 0, overflow: "hidden" },
  branch: { maxWidth: "40%" },
  form: { gap: space[4] },
  footer: { gap: space[2] },
});
