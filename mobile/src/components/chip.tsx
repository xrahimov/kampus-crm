import { Pressable, StyleSheet } from "react-native";

import { radius, space, useTheme } from "@/lib/theme";

import { Text } from "./text";

/** One choice of a row of choices that are on or off: a weekday, a filter. */
export function Chip({
  label,
  on,
  onPress,
  note,
  fill = false,
  testID,
}: {
  label: string;
  on: boolean;
  onPress: () => void;
  /** A small figure after the words: how many. */
  note?: string;
  /** One of a row of chips that share the width evenly (the seven weekdays on a phone). */
  fill?: boolean;
  testID?: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: on }}
      accessibilityLabel={label}
      style={[
        styles.chip,
        fill ? styles.fill : null,
        {
          backgroundColor: on ? colors.primary : colors.card,
          borderColor: on ? colors.primary : colors.border,
        },
      ]}
      testID={testID}
    >
      <Text variant="smallStrong" tone={on ? "primaryForeground" : "foreground"}>
        {label}
      </Text>
      {note ? (
        <Text variant="small" tone={on ? "primaryForeground" : "mutedForeground"}>
          {note}
        </Text>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1, paddingHorizontal: 0, justifyContent: "center" },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    minHeight: 36,
    paddingHorizontal: space[3],
    borderRadius: radius.full,
    borderWidth: 1,
  },
});
