import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { Text } from "@/components/text";
import { space, useTheme } from "@/lib/theme";

export interface PairBarsRow {
  /** Under the pair: "Mar". */
  label: string;
  /** Read out and written beside the values: "March 2026". Defaults to `label`. */
  name?: string;
  first: number;
  second: number;
}

const PLOT = 132;
const BAR_MAX = 12;
/** The gap between the two bars of one pair: the card shows through. */
const PAIR_GAP = 2;

/**
 * Two sums side by side for each step of time: income and expenses of twelve
 * months, charged and collected of six. One scale, two colours that stay with
 * their series, a legend, and the pressed step's sums in words under the plot
 * (a phone has no hover). The first pick is `initial`, or the last step.
 *
 * `format` writes a sum; the home page passes one that hides the sums until
 * **Show numbers** is pressed, as the site does: the shapes stay.
 */
export function PairBars({
  rows,
  legend,
  format,
  initial,
  testID = "pair-bars",
}: {
  rows: PairBarsRow[];
  legend: { first: string; second: string };
  format: (value: number) => string;
  initial?: number;
  testID?: string;
}) {
  const { colors } = useTheme();
  const [picked, setPicked] = useState<number | null>(null);
  const at = Math.min(picked ?? initial ?? rows.length - 1, rows.length - 1);
  const top = Math.max(1, ...rows.flatMap((row) => [row.first, row.second]));
  const height = (value: number) => (value <= 0 ? 0 : Math.max(2, (value / top) * PLOT));
  const row = rows[at];

  return (
    <View style={styles.wrap} testID={testID}>
      <View style={styles.legend}>
        <Key color={colors.series1} label={legend.first} />
        <Key color={colors.series2} label={legend.second} />
      </View>
      <View style={[styles.plot, { borderBottomColor: colors.border }]}>
        {rows.map((r, index) => (
          <Pressable
            key={`${r.label}:${index}`}
            onPress={() => setPicked(index)}
            accessibilityRole="button"
            accessibilityState={{ selected: index === at }}
            accessibilityLabel={`${r.name ?? r.label}. ${legend.first}: ${format(r.first)}. ${legend.second}: ${format(r.second)}`}
            style={[styles.step, index === at ? { backgroundColor: colors.muted } : null]}
            testID={`${testID}-step-${index}`}
          >
            <View style={styles.pair}>
              <View
                style={[styles.bar, { height: height(r.first), backgroundColor: colors.series1 }]}
              />
              <View
                style={[styles.bar, { height: height(r.second), backgroundColor: colors.series2 }]}
              />
            </View>
          </Pressable>
        ))}
      </View>
      <View style={styles.labels}>
        {rows.map((r, index) => (
          <Text
            key={`${r.label}:${index}`}
            variant="small"
            tone={index === at ? "foreground" : "mutedForeground"}
            numberOfLines={1}
            style={styles.label}
          >
            {r.label}
          </Text>
        ))}
      </View>
      {row ? (
        <View
          style={[styles.picked, { backgroundColor: colors.muted }]}
          testID={`${testID}-picked`}
        >
          <Text variant="smallStrong">{row.name ?? row.label}</Text>
          <View style={styles.sums}>
            <Sum color={colors.series1} label={legend.first} value={format(row.first)} />
            <Sum color={colors.series2} label={legend.second} value={format(row.second)} />
          </View>
        </View>
      ) : null}
    </View>
  );
}

function Key({ color, label }: { color: string; label: string }) {
  return (
    <View style={styles.key}>
      <View style={[styles.swatch, { backgroundColor: color }]} />
      <Text variant="small" tone="mutedForeground">
        {label}
      </Text>
    </View>
  );
}

function Sum({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <View style={styles.sum}>
      <View style={styles.key}>
        <View style={[styles.swatch, { backgroundColor: color }]} />
        <Text variant="small" tone="mutedForeground">
          {label}
        </Text>
      </View>
      <Text variant="figure" style={styles.number}>
        {value}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: space[2] },
  legend: { flexDirection: "row", flexWrap: "wrap", gap: space[4] },
  key: { flexDirection: "row", alignItems: "center", gap: 6 },
  swatch: { width: 10, height: 10, borderRadius: 3 },
  plot: {
    height: PLOT + space[2],
    flexDirection: "row",
    alignItems: "stretch",
    borderBottomWidth: StyleSheet.hairlineWidth,
  },
  step: {
    flex: 1,
    justifyContent: "flex-end",
    alignItems: "center",
    borderTopLeftRadius: 6,
    borderTopRightRadius: 6,
  },
  pair: {
    alignSelf: "stretch",
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "center",
    gap: PAIR_GAP,
    paddingHorizontal: 3,
  },
  bar: {
    flexGrow: 1,
    flexBasis: 0,
    maxWidth: BAR_MAX,
    minWidth: 3,
    borderTopLeftRadius: 3,
    borderTopRightRadius: 3,
  },
  labels: { flexDirection: "row" },
  label: { flex: 1, textAlign: "center", fontSize: 11 },
  picked: { borderRadius: 10, padding: space[3], gap: space[2] },
  sums: { flexDirection: "row", flexWrap: "wrap", columnGap: space[6], rowGap: space[2] },
  sum: { gap: 2 },
  number: { fontVariant: ["tabular-nums"] },
});
