import type { LucideIcon } from "lucide-react-native";
import { Pressable, StyleSheet } from "react-native";

import { useTheme } from "@/lib/theme";

/** A small button of one icon at the end of a row: move up, move down, remove. */
export function RowButton({
  icon: Icon,
  label,
  onPress,
  disabled = false,
  destructive = false,
  testID,
}: {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
  disabled?: boolean;
  destructive?: boolean;
  testID: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      hitSlop={4}
      style={({ pressed }) => [
        styles.button,
        pressed ? { backgroundColor: colors.muted } : null,
        disabled ? styles.off : null,
      ]}
      testID={testID}
    >
      <Icon size={18} color={destructive ? colors.destructive : colors.foreground} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 36,
    height: 36,
    borderRadius: 8,
    alignItems: "center",
    justifyContent: "center",
  },
  off: { opacity: 0.35 },
});
