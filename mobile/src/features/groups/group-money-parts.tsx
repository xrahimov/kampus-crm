import { StyleSheet, View } from "react-native";

import { Text } from "@/components/text";
import { space, type Colors } from "@/lib/theme";

/**
 * One column of the site's table as it reads on a phone (A-254): what the
 * figure is, above the figure. Several of them sit in a row and wrap.
 */
export function Fact({
  label,
  value,
  tone,
  testID,
}: {
  label: string;
  value: string | number;
  tone?: keyof Colors;
  testID?: string;
}) {
  return (
    <View style={styles.fact}>
      <Text variant="small" tone="mutedForeground">
        {label}
      </Text>
      <Text variant="bodyStrong" tone={tone ?? "foreground"} testID={testID}>
        {value}
      </Text>
    </View>
  );
}

/** A row of facts under a name. */
export function Facts({ children }: { children: React.ReactNode }) {
  return <View style={styles.facts}>{children}</View>;
}

/** A digits-only field's text as a whole number, or null when nothing was typed. */
export function typedWhole(text: string): number | null {
  const digits = text.replace(/\D/g, "");
  return digits ? Number(digits) : null;
}

const styles = StyleSheet.create({
  fact: { gap: 2 },
  facts: { flexDirection: "row", flexWrap: "wrap", columnGap: space[5], rowGap: space[2] },
});
