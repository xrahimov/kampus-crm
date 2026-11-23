import { StyleSheet, View } from "react-native";

import { Text } from "@/components/text";
import { useLayout } from "@/lib/layout";
import { space, useTheme } from "@/lib/theme";

/**
 * The few counts on top of a work list ("Overdue 3", "Nobody has called 2"):
 * four in a row on a tablet, two by two on a phone, where four would cut
 * their labels short. `alert` turns a count that is not zero red.
 */
export function CountTiles({
  tiles,
  testID,
}: {
  tiles: Array<{ key: string; label: string; value: number; alert?: boolean }>;
  testID?: string;
}) {
  const { colors } = useTheme();
  const { wide } = useLayout();
  return (
    <View style={styles.tiles} testID={testID}>
      {tiles.map((tile) => (
        <View
          key={tile.key}
          style={[
            styles.tile,
            { flexBasis: wide ? "22%" : "45%" },
            { backgroundColor: colors.card, borderColor: colors.border },
          ]}
        >
          <Text
            variant="title"
            tone={tile.alert && tile.value > 0 ? "destructive" : "foreground"}
            testID={testID ? `${testID}-${tile.key}` : undefined}
          >
            {tile.value}
          </Text>
          <Text variant="small" tone="mutedForeground" numberOfLines={2}>
            {tile.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  tiles: { flexDirection: "row", flexWrap: "wrap", gap: space[2] },
  tile: {
    flexGrow: 1,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 12,
    padding: space[3],
  },
});
