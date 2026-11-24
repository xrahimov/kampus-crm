import { Check, ChevronDown } from "lucide-react-native";
import { useMemo, useState } from "react";
import { Keyboard, Pressable, StyleSheet, View } from "react-native";

import { useTranslations } from "@/lib/i18n";
import { radius, space, useTheme } from "@/lib/theme";

import { Field } from "./field";
import { Press } from "./motion";
import { Sheet } from "./sheet";
import { Text } from "./text";

export interface SelectOption<T extends string> {
  value: T;
  label: string;
  /** A second, smaller line: a phone number under a name. */
  note?: string;
}

/** From this many choices on, the sheet has a box to type in. */
const SEARCH_FROM = 9;

/**
 * One of many named things, in the room of one field: the field shows the
 * choice and opens a sheet with the list. A long list can be searched.
 * `value` null shows `placeholder`; with `clearLabel` the list starts with a
 * row that chooses nothing ("All branches").
 */
export function Select<T extends string>({
  label,
  options,
  value,
  onChange,
  placeholder,
  clearLabel,
  error,
  compact = false,
  testID = "select",
}: {
  label: string;
  options: ReadonlyArray<SelectOption<T>>;
  value: T | null;
  onChange: (value: T | null) => void;
  placeholder?: string;
  clearLabel?: string;
  error?: string | null;
  /** Without the label above: a filter in a row of filters. The label is still read out. */
  compact?: boolean;
  testID?: string;
}) {
  const t = useTranslations();
  const { colors } = useTheme();
  const [open, setOpen] = useState(false);
  const [typed, setTyped] = useState("");
  const chosen = options.find((option) => option.value === value) ?? null;
  const shown = useMemo(() => {
    const words = typed.trim().toLocaleLowerCase();
    if (!words) return options;
    return options.filter((option) =>
      `${option.label} ${option.note ?? ""}`.toLocaleLowerCase().includes(words),
    );
  }, [options, typed]);
  const pick = (next: T | null) => {
    onChange(next);
    setOpen(false);
    setTyped("");
  };
  const row = (
    key: string,
    text: string,
    note: string | undefined,
    on: boolean,
    next: T | null,
  ) => (
    <Pressable
      key={key}
      accessibilityRole="radio"
      accessibilityState={{ checked: on }}
      onPress={() => pick(next)}
      style={[styles.row, { backgroundColor: on ? colors.accent : "transparent" }]}
      testID={`${testID}-option-${key}`}
    >
      <View style={styles.words}>
        <Text variant={on ? "bodyStrong" : "body"}>{text}</Text>
        {note ? (
          <Text variant="small" tone="mutedForeground">
            {note}
          </Text>
        ) : null}
      </View>
      {on ? <Check size={18} color={colors.accentForeground} /> : null}
    </Pressable>
  );
  return (
    <View style={compact ? styles.compact : styles.wrap}>
      {compact ? null : <Text variant="smallStrong">{label}</Text>}
      <Press
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${chosen?.label ?? clearLabel ?? placeholder ?? ""}`}
        onPress={() => {
          // A field of the form may still hold the keyboard: an iPhone gives it back to that
          // field when the list closes, and the keyboard would come up again over the form.
          Keyboard.dismiss();
          setOpen(true);
        }}
        sink={0.985}
        style={[
          styles.field,
          compact && styles.fieldCompact,
          { backgroundColor: colors.card, borderColor: error ? colors.destructive : colors.input },
        ]}
        testID={testID}
      >
        <Text
          numberOfLines={1}
          variant={compact ? "small" : "body"}
          tone={chosen ? "foreground" : clearLabel ? "foreground" : "mutedForeground"}
          style={styles.value}
        >
          {chosen?.label ?? clearLabel ?? placeholder ?? ""}
        </Text>
        <ChevronDown size={compact ? 16 : 18} color={colors.mutedForeground} />
      </Press>
      {error ? (
        <Text variant="small" tone="destructive">
          {error}
        </Text>
      ) : null}
      <Sheet
        open={open}
        onClose={() => {
          setOpen(false);
          setTyped("");
        }}
        title={label}
        testID={`${testID}-sheet`}
      >
        {options.length >= SEARCH_FROM ? (
          <Field
            label={t("common.search")}
            value={typed}
            onChangeText={setTyped}
            autoCorrect={false}
            testID={`${testID}-search`}
          />
        ) : null}
        <View accessibilityRole="radiogroup" accessibilityLabel={label} style={styles.list}>
          {clearLabel && !typed.trim()
            ? row("none", clearLabel, undefined, value === null, null)
            : null}
          {shown.map((option) =>
            row(option.value, option.label, option.note, option.value === value, option.value),
          )}
          {shown.length === 0 ? (
            <Text tone="mutedForeground" style={styles.none}>
              {t("common.nothingFound")}
            </Text>
          ) : null}
        </View>
      </Sheet>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space[1], alignSelf: "stretch" },
  compact: { flexShrink: 1 },
  field: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: space[2],
    paddingHorizontal: space[3],
    borderWidth: 1,
    borderRadius: radius.md,
  },
  fieldCompact: { minHeight: 40, borderRadius: radius.full, paddingHorizontal: space[4] },
  value: { flexShrink: 1, flexGrow: 1 },
  list: { gap: 2 },
  row: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingHorizontal: space[3],
    paddingVertical: space[2],
    borderRadius: radius.md,
  },
  words: { flex: 1 },
  none: { paddingVertical: space[4], textAlign: "center" },
});
