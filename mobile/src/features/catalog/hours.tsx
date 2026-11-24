import { Plus, X } from "lucide-react-native";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { HOURS_MAX, useHours, useSaveHours, type HoursWindow } from "@/api/office-catalog";
import { WEEKDAYS } from "@/api/office-groups";
import { Button } from "@/components/button";
import { Sheet } from "@/components/sheet";
import { Card, Loading, Notice } from "@/components/surface";
import { Text } from "@/components/text";
import { TimeField } from "@/components/time-field";
import { weekdayAsDate } from "@/lib/days";
import { fieldErrorOf } from "@/lib/form";
import { errorText, useDate, useTranslations } from "@/lib/i18n";
import { space, useTheme } from "@/lib/theme";

/**
 * A teacher's hours open for 1:1 booking (A-169, in the app A-234): the week
 * as it stands, and a sheet to change it. On a teacher's page for the office,
 * and under More for the teacher themselves (`own`).
 */
export function HoursCard({
  userId,
  canEdit,
  own = false,
}: {
  userId: string;
  canEdit: boolean;
  own?: boolean;
}) {
  const t = useTranslations("teachers.availability");
  const tt = useTranslations();
  const date = useDate();
  const query = useHours(userId);
  const [editing, setEditing] = useState(false);
  const windows = query.data ?? [];
  return (
    <Card testID="hours">
      <Text variant="heading">{t("title")}</Text>
      <Text variant="small" tone="mutedForeground">
        {own ? t("own") : t("hint")}
      </Text>
      {query.isLoading ? (
        <Loading />
      ) : !query.data ? (
        <Notice tone="destructive">{errorText(tt, query.error)}</Notice>
      ) : (
        <View style={styles.week}>
          {WEEKDAYS.map((day) => {
            const mine = windows.filter((w) => w.weekday === day);
            return (
              <View key={day} style={styles.day} testID={`hours-day-${day}`}>
                <Text variant="smallStrong" style={styles.dayName}>
                  {date(weekdayAsDate(day), { weekday: "long" })}
                </Text>
                <Text
                  variant={mine.length > 0 ? "figure" : "small"}
                  tone={mine.length > 0 ? "foreground" : "mutedForeground"}
                  style={styles.fill}
                >
                  {mine.length > 0
                    ? mine.map((w) => `${w.startTime}–${w.endTime}`).join(", ")
                    : t("closed")}
                </Text>
              </View>
            );
          })}
        </View>
      )}
      {canEdit && query.data ? (
        <Button
          variant="outline"
          label={tt("mobile.catalog.changeHours")}
          onPress={() => setEditing(true)}
          style={styles.start}
          testID="hours-change"
        />
      ) : null}
      <HoursSheet
        open={editing}
        onClose={() => setEditing(false)}
        userId={userId}
        initial={windows}
      />
    </Card>
  );
}

interface Row {
  key: number;
  weekday: number;
  startTime: string | null;
  endTime: string | null;
}

let nextKey = 1;
const rowsOf = (windows: HoursWindow[]): Row[] => windows.map((w) => ({ ...w, key: nextKey++ }));

function HoursSheet({
  open,
  onClose,
  userId,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  userId: string;
  initial: HoursWindow[];
}) {
  const t = useTranslations("teachers.availability");
  const tt = useTranslations();
  const date = useDate();
  const { colors } = useTheme();
  const save = useSaveHours(userId);
  const [rows, setRows] = useState<Row[]>(() => rowsOf(initial));
  const [missing, setMissing] = useState(false);
  const [wasOpen, setWasOpen] = useState(open);
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) {
      setRows(rowsOf(initial));
      setMissing(false);
      save.reset();
    }
  }
  const update = (key: number, patch: Partial<Row>) =>
    setRows((all) => all.map((row) => (row.key === key ? { ...row, ...patch } : row)));
  const serverError = fieldErrorOf(tt, save.error);
  const refused = save.error
    ? (serverError("windows") ?? serverError("endTime") ?? errorText(tt, save.error))
    : null;

  const submit = () => {
    const windows = rows.flatMap((row) =>
      row.startTime && row.endTime && row.endTime > row.startTime
        ? [{ weekday: row.weekday, startTime: row.startTime, endTime: row.endTime }]
        : [],
    );
    if (windows.length !== rows.length) {
      setMissing(true);
      return;
    }
    save.mutate(windows, { onSuccess: onClose });
  };

  return (
    <Sheet
      open={open}
      onClose={onClose}
      title={t("title")}
      testID="hours-sheet"
      footer={
        <Button label={t("save")} loading={save.isPending} onPress={submit} testID="hours-save" />
      }
    >
      <View style={styles.form}>
        {refused ? (
          <Notice tone="destructive" testID="hours-problem">
            {refused}
          </Notice>
        ) : null}
        {WEEKDAYS.map((day) => {
          const mine = rows.filter((row) => row.weekday === day);
          return (
            <View
              key={day}
              style={[styles.editDay, { borderColor: colors.border }]}
              testID={`hours-edit-${day}`}
            >
              <View style={styles.head}>
                <Text variant="bodyStrong" style={styles.fill}>
                  {date(weekdayAsDate(day), { weekday: "long" })}
                </Text>
                {rows.length < HOURS_MAX ? (
                  <Button
                    variant="ghost"
                    compact
                    icon={<Plus size={16} color={colors.foreground} />}
                    label={t("add")}
                    onPress={() =>
                      setRows((all) => [
                        ...all,
                        { key: nextKey++, weekday: day, startTime: "14:00", endTime: "18:00" },
                      ])
                    }
                    testID={`hours-add-${day}`}
                  />
                ) : null}
              </View>
              {mine.length === 0 ? (
                <Text variant="small" tone="mutedForeground">
                  {t("closed")}
                </Text>
              ) : null}
              {mine.map((row, index) => (
                <View key={row.key} style={styles.window}>
                  <View style={styles.fill}>
                    <TimeField
                      label={t("from")}
                      value={row.startTime}
                      onChange={(startTime) => update(row.key, { startTime })}
                      error={missing && !row.startTime ? tt("validation.required") : null}
                      testID={`hours-start-${day}-${index}`}
                    />
                  </View>
                  <View style={styles.fill}>
                    <TimeField
                      label={t("to")}
                      value={row.endTime}
                      onChange={(endTime) => update(row.key, { endTime })}
                      error={
                        !missing
                          ? null
                          : !row.endTime
                            ? tt("validation.required")
                            : row.startTime && row.endTime <= row.startTime
                              ? tt("validation.workHours")
                              : null
                      }
                      testID={`hours-end-${day}-${index}`}
                    />
                  </View>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t("remove")}
                    hitSlop={8}
                    onPress={() => setRows((all) => all.filter((r) => r.key !== row.key))}
                    style={[styles.remove, { backgroundColor: colors.secondary }]}
                    testID={`hours-remove-${day}-${index}`}
                  >
                    <X size={16} color={colors.foreground} />
                  </Pressable>
                </View>
              ))}
            </View>
          );
        })}
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  start: { alignSelf: "flex-start" },
  week: { gap: space[1] },
  day: { flexDirection: "row", gap: space[3], alignItems: "baseline" },
  dayName: { width: 110 },
  form: { gap: space[3] },
  editDay: { gap: space[2], paddingBottom: space[3], borderBottomWidth: StyleSheet.hairlineWidth },
  head: { flexDirection: "row", alignItems: "center", gap: space[2], minHeight: 36 },
  window: { flexDirection: "row", gap: space[2], alignItems: "flex-start" },
  // Level with the fields, which stand under their labels.
  remove: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 30,
  },
});
