import { Trash2 } from "lucide-react-native";
import type { ReactNode } from "react";
import { Pressable, StyleSheet } from "react-native";

import { space, useTheme } from "@/lib/theme";

/** One line of a settings list that opens what it names: the whole line takes the tap. */
export function RowPress({
  onPress,
  children,
  accessibilityLabel,
  testID,
}: {
  onPress: () => void;
  children: ReactNode;
  accessibilityLabel?: string;
  testID: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [styles.row, pressed ? { backgroundColor: colors.muted } : null]}
      testID={testID}
    >
      {children}
    </Pressable>
  );
}

/** The bin at the end of a line; the words are for a screen reader. */
export function Bin({
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
      style={styles.bin}
      testID={testID}
    >
      <Trash2 size={18} color={colors.mutedForeground} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bin: { width: 32, height: 32, alignItems: "center", justifyContent: "center" },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingHorizontal: space[4],
    paddingVertical: space[3],
    minHeight: 48,
  },
});
