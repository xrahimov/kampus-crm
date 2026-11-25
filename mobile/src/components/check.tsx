import { Check as CheckIcon } from "lucide-react-native";
import { Pressable, StyleSheet, View } from "react-native";

import { radius, space, useTheme } from "@/lib/theme";

import { Text } from "./text";

/** A yes-or-no choice with its words: the whole row takes the tap. */
export function Check({
  label,
  hint,
  value,
  onChange,
  disabled = false,
  inline = false,
  testID,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
  /**
   * Beside something else in a row: as wide as its words and no wider. Without
   * it the row is taken whole on a phone, and a filter next to it is left no
   * room at all (A-266).
   */
  inline?: boolean;
  testID?: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      accessibilityRole="checkbox"
      accessibilityLabel={label}
      accessibilityState={{ checked: value, disabled }}
      disabled={disabled}
      onPress={() => onChange(!value)}
      style={[styles.row, inline ? styles.inline : null]}
      testID={testID}
    >
      <View
        style={[
          styles.box,
          inline ? styles.level : null,
          {
            borderColor: value ? colors.primary : colors.input,
            backgroundColor: value ? colors.primary : colors.card,
          },
        ]}
      >
        {value ? <CheckIcon size={16} color={colors.primaryForeground} /> : null}
      </View>
      <View style={inline ? styles.words : styles.fill}>
        <Text>{label}</Text>
        {hint ? (
          <Text variant="small" tone="mutedForeground">
            {hint}
          </Text>
        ) : null}
      </View>
    </Pressable>
  );
}

/**
 * A tick box with no words beside it, at the start of a row of a list: the
 * row keeps its own tap, the box takes its own. `label` is what a screen
 * reader says ("Select Madina Yusupova").
 */
export function Tick({
  ticked,
  onPress,
  label,
  testID,
}: {
  ticked: boolean;
  onPress: () => void;
  label: string;
  testID?: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="checkbox"
      accessibilityState={{ checked: ticked }}
      accessibilityLabel={label}
      hitSlop={6}
      style={styles.tick}
      testID={testID}
    >
      <View
        style={[
          styles.tickBox,
          {
            borderColor: ticked ? colors.primary : colors.border,
            backgroundColor: ticked ? colors.primary : colors.card,
          },
        ]}
      >
        {ticked ? <CheckIcon size={16} color={colors.primaryForeground} /> : null}
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  tick: { paddingLeft: space[4], paddingRight: space[1], justifyContent: "center" },
  tickBox: {
    width: 24,
    height: 24,
    borderRadius: radius.sm,
    borderWidth: 1.5,
    alignItems: "center",
    justifyContent: "center",
  },
  row: { flexDirection: "row", alignItems: "flex-start", gap: space[3], minHeight: 44 },
  fill: { flex: 1 },
  inline: { flexGrow: 0, flexShrink: 0, alignItems: "center" },
  level: { marginTop: 0 },
  // Never narrower than the words: allowed to shrink, Android rounds the width down by a
  // fraction of a point and the last letter of a one-word label drops off ("Arxi", A-268).
  words: { flexShrink: 0 },
  box: {
    width: 24,
    height: 24,
    marginTop: 2,
    borderWidth: 1,
    borderRadius: radius.sm,
    alignItems: "center",
    justifyContent: "center",
  },
});
