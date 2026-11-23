import { Pressable, StyleSheet, View } from "react-native";

import { radius, space, useTheme } from "@/lib/theme";

import { Text } from "./text";

/** One of a few named things: each row is a radio button a thumb can hit. */
export function ChoiceList<T extends string>({
  label,
  options,
  value,
  onChange,
  error,
}: {
  label: string;
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T | null;
  onChange: (value: T) => void;
  error?: string | null;
}) {
  const { colors } = useTheme();
  return (
    <View style={styles.wrap} accessibilityRole="radiogroup" accessibilityLabel={label}>
      <Text variant="smallStrong">{label}</Text>
      <View style={[styles.list, { borderColor: error ? colors.destructive : colors.input }]}>
        {options.map((option, index) => {
          const chosen = option.value === value;
          return (
            <Pressable
              key={option.value}
              accessibilityRole="radio"
              accessibilityState={{ checked: chosen }}
              onPress={() => onChange(option.value)}
              style={[
                styles.row,
                { backgroundColor: chosen ? colors.accent : colors.card },
                index > 0 && {
                  borderTopWidth: StyleSheet.hairlineWidth,
                  borderTopColor: colors.border,
                },
              ]}
            >
              <View
                style={[
                  styles.dot,
                  { borderColor: chosen ? colors.ring : colors.input },
                  chosen && { backgroundColor: colors.ring },
                ]}
              />
              <Text
                variant="body"
                tone={chosen ? "accentForeground" : "foreground"}
                style={styles.text}
              >
                {option.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      {error ? (
        <Text variant="small" tone="destructive">
          {error}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space[2] },
  list: { borderWidth: 1, borderRadius: radius.md, overflow: "hidden" },
  row: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingHorizontal: space[3],
    paddingVertical: space[2],
  },
  dot: { width: 18, height: 18, borderRadius: 9, borderWidth: 2 },
  text: { flex: 1 },
});
