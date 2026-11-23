import { Check } from "lucide-react-native";
import { Pressable, StyleSheet, View } from "react-native";

import { Text } from "@/components/text";
import { radius, space, useTheme } from "@/lib/theme";

/*
 * What tests and exercises share (A-213): a list of answers to pick from, and
 * a small chip for picking one of a few words.
 */

/**
 * Answers to choose from, one per row, each a full-width target. With
 * `multiple` the rows are tick boxes; otherwise they are radio buttons.
 */
export function Options({
  options,
  chosen,
  multiple = false,
  onPress,
  testID,
}: {
  options: readonly string[];
  /** Indexes of the chosen rows. */
  chosen: readonly number[];
  multiple?: boolean;
  onPress: (index: number) => void;
  testID: string;
}) {
  const { colors } = useTheme();
  return (
    <View
      style={[styles.list, { borderColor: colors.input }]}
      accessibilityRole={multiple ? undefined : "radiogroup"}
    >
      {options.map((option, index) => {
        const on = chosen.includes(index);
        return (
          <Pressable
            key={index}
            onPress={() => onPress(index)}
            accessibilityRole={multiple ? "checkbox" : "radio"}
            accessibilityState={{ checked: on }}
            accessibilityLabel={option}
            style={[
              styles.row,
              { backgroundColor: on ? colors.accent : colors.card },
              index > 0 && {
                borderTopWidth: StyleSheet.hairlineWidth,
                borderTopColor: colors.border,
              },
            ]}
            testID={`${testID}-${index}`}
          >
            <View
              style={[
                multiple ? styles.box : styles.dot,
                { borderColor: on ? colors.ring : colors.input },
                on && { backgroundColor: colors.ring },
              ]}
            >
              {multiple && on ? <Check size={14} color={colors.card} /> : null}
            </View>
            <Text tone={on ? "accentForeground" : "foreground"} style={styles.fill}>
              {option}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

/** One of a few words to pick; the picked one is filled. */
export function WordChip({
  label,
  chosen,
  onPress,
  accessibilityLabel,
  testID,
}: {
  label: string;
  chosen: boolean;
  onPress: () => void;
  accessibilityLabel?: string;
  testID?: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      accessibilityState={{ selected: chosen }}
      style={[
        styles.chip,
        {
          backgroundColor: chosen ? colors.primary : colors.card,
          borderColor: chosen ? colors.primary : colors.input,
        },
      ]}
      testID={testID}
    >
      <Text
        variant="small"
        style={{ color: chosen ? colors.primaryForeground : colors.foreground }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  list: { borderWidth: 1, borderRadius: radius.md, overflow: "hidden" },
  row: {
    minHeight: 48,
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingHorizontal: space[3],
    paddingVertical: space[2],
  },
  dot: { width: 20, height: 20, borderRadius: 10, borderWidth: 2 },
  box: {
    width: 20,
    height: 20,
    borderRadius: radius.sm,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  chip: {
    minHeight: 36,
    justifyContent: "center",
    borderWidth: 1,
    borderRadius: radius.full,
    paddingHorizontal: space[3],
    paddingVertical: space[1],
  },
});
