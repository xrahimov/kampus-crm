import { ChevronRight, type LucideIcon } from "lucide-react-native";
import { Pressable, StyleSheet, View } from "react-native";

import { space, useTheme } from "@/lib/theme";

import { Text } from "./text";

/** One fact about something: what it is called on the left, what it is on the right. */
export function Fact({ label, value, testID }: { label: string; value: string; testID?: string }) {
  return (
    <View style={styles.fact} testID={testID}>
      <Text variant="small" tone="mutedForeground" style={styles.factLabel}>
        {label}
      </Text>
      <Text style={styles.fill}>{value}</Text>
    </View>
  );
}

/** One thing to do in a list of things to do with what was pressed. */
export function ActionRow({
  label,
  icon: Icon,
  destructive = false,
  onPress,
  testID,
}: {
  label: string;
  icon: LucideIcon;
  destructive?: boolean;
  onPress: () => void;
  testID: string;
}) {
  const { colors } = useTheme();
  const ink = destructive ? colors.destructive : colors.foreground;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      style={({ pressed }) => [styles.action, pressed ? { backgroundColor: colors.muted } : null]}
      testID={testID}
    >
      <Icon size={20} color={ink} />
      <Text style={[styles.fill, { color: ink }]}>{label}</Text>
      <ChevronRight size={18} color={colors.mutedForeground} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  fill: { flex: 1 },
  fact: { flexDirection: "row", gap: space[3] },
  factLabel: { width: 110, paddingTop: 2 },
  action: {
    flexDirection: "row",
    alignItems: "center",
    gap: space[3],
    paddingVertical: space[3],
    minHeight: 48,
  },
});
