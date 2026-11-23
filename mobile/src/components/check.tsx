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
  testID,
}: {
  label: string;
  hint?: string;
  value: boolean;
  onChange: (value: boolean) => void;
  disabled?: boolean;
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
      style={styles.row}
      testID={testID}
    >
      <View
        style={[
          styles.box,
          {
            borderColor: value ? colors.primary : colors.input,
            backgroundColor: value ? colors.primary : colors.card,
          },
        ]}
      >
        {value ? <CheckIcon size={16} color={colors.primaryForeground} /> : null}
      </View>
      <View style={styles.fill}>
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

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start", gap: space[3], minHeight: 44 },
  fill: { flex: 1 },
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
