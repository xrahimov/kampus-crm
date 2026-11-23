import { StyleSheet, View } from "react-native";

import { radius, useTheme } from "@/lib/theme";

/** A bar that fills to `percent` (0 to 100; null is empty), named for a screen reader. */
export function Meter({ percent, label }: { percent: number | null; label: string }) {
  const { colors } = useTheme();
  const value = Math.max(0, Math.min(100, percent ?? 0));
  return (
    <View
      accessibilityRole="progressbar"
      accessibilityLabel={label}
      accessibilityValue={{ min: 0, max: 100, now: value }}
      style={[styles.track, { backgroundColor: colors.secondary }]}
    >
      <View style={[styles.done, { backgroundColor: colors.ring, width: `${value}%` }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  track: { height: 8, borderRadius: radius.full, overflow: "hidden" },
  done: { height: 8, borderRadius: radius.full },
});
