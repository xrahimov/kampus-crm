import type { ReactNode } from "react";
import { ActivityIndicator, StyleSheet, View, type ViewStyle } from "react-native";

import { radius, space, useTheme } from "@/lib/theme";

import { Press } from "./motion";
import { Text } from "./text";

export type ButtonVariant = "primary" | "outline" | "ghost" | "destructive" | "saffron";

export interface ButtonProps {
  label: string;
  onPress?: () => void;
  variant?: ButtonVariant;
  /** A smaller button for rows and cards. */
  compact?: boolean;
  icon?: ReactNode;
  loading?: boolean;
  disabled?: boolean;
  testID?: string;
  style?: ViewStyle;
}

/** The one button of the app. Saffron is kept for taking a payment, as on the site. */
export function Button({
  label,
  onPress,
  variant = "primary",
  compact = false,
  icon,
  loading = false,
  disabled = false,
  testID,
  style,
}: ButtonProps) {
  const { colors } = useTheme();
  const look = {
    primary: { bg: colors.primary, ink: colors.primaryForeground, border: colors.primary },
    outline: { bg: colors.card, ink: colors.foreground, border: colors.input },
    ghost: { bg: "transparent", ink: colors.primary, border: "transparent" },
    destructive: { bg: colors.card, ink: colors.destructive, border: colors.input },
    saffron: { bg: colors.saffron, ink: colors.saffronForeground, border: colors.saffron },
  }[variant];
  const off = disabled || loading;
  return (
    <Press
      accessibilityRole="button"
      accessibilityState={{ disabled: off, busy: loading }}
      accessibilityLabel={label}
      disabled={off}
      onPress={onPress}
      testID={testID}
      style={[
        styles.base,
        compact ? styles.compact : styles.regular,
        { backgroundColor: look.bg, borderColor: look.border },
        off && styles.off,
        style,
      ]}
    >
      {loading ? (
        <ActivityIndicator size="small" color={look.ink} />
      ) : icon ? (
        <View>{icon}</View>
      ) : null}
      <Text
        variant={compact ? "smallStrong" : "bodyStrong"}
        style={{ color: look.ink }}
        numberOfLines={1}
      >
        {label}
      </Text>
    </Press>
  );
}

const styles = StyleSheet.create({
  base: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: space[2],
    borderWidth: 1,
    borderRadius: radius.md,
  },
  // 48 points: a comfortable target for a thumb on a moving bus.
  regular: { minHeight: 48, paddingHorizontal: space[5] },
  compact: { minHeight: 36, paddingHorizontal: space[3] },
  off: { opacity: 0.5 },
});
