import type { TabListProps, TabTriggerSlotProps } from "expo-router/ui";
import type { LucideIcon } from "lucide-react-native";
import type { ComponentRef, Ref } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { font, radius, space, useTheme } from "@/lib/theme";

import { KampusMark } from "./logo";
import { Text } from "./text";

/** The rail on a tablet is this wide. */
export const RAIL_WIDTH = 92;

/**
 * The app's navigation in its two shapes: a bar along the bottom of a phone,
 * within reach of a thumb, and a lapis rail down the left of a tablet, the
 * site's sidebar in miniature. The same four places either way.
 */
export function NavList({ wide, children, ...rest }: TabListProps & { wide: boolean }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  if (wide) {
    return (
      <View
        {...rest}
        accessibilityRole="tablist"
        style={[
          styles.rail,
          {
            backgroundColor: colors.sidebar,
            paddingTop: insets.top + space[4],
            paddingBottom: insets.bottom + space[4],
            paddingLeft: insets.left,
            width: RAIL_WIDTH + insets.left,
          },
        ]}
      >
        <View style={styles.railMark}>
          <KampusMark size={36} />
        </View>
        {children}
      </View>
    );
  }
  return (
    <View
      {...rest}
      accessibilityRole="tablist"
      style={[
        styles.bar,
        {
          backgroundColor: colors.card,
          borderTopColor: colors.border,
          paddingBottom: Math.max(insets.bottom, space[2]),
        },
      ]}
    >
      {children}
    </View>
  );
}

export function NavItem({
  wide,
  icon: Icon,
  label,
  count = 0,
  isFocused,
  ref,
  ...rest
}: TabTriggerSlotProps & { wide: boolean; icon: LucideIcon; label: string; count?: number }) {
  const { colors } = useTheme();
  const ink = wide
    ? isFocused
      ? colors.sidebarActive
      : colors.sidebarForeground
    : isFocused
      ? colors.primary
      : colors.mutedForeground;
  return (
    <Pressable
      {...rest}
      ref={ref as Ref<ComponentRef<typeof Pressable>>}
      accessibilityRole="tab"
      accessibilityState={{ selected: Boolean(isFocused) }}
      accessibilityLabel={count > 0 ? `${label}, ${count}` : label}
      style={[
        wide ? styles.railItem : styles.barItem,
        wide && isFocused ? { backgroundColor: colors.sidebarMuted } : null,
      ]}
    >
      {/* The mark of the place you are in: a turquoise line, as the site's sidebar has. */}
      {!wide ? (
        <View
          style={[styles.barMark, { backgroundColor: isFocused ? colors.ring : "transparent" }]}
        />
      ) : null}
      <View>
        <Icon size={wide ? 24 : 22} color={ink} strokeWidth={isFocused ? 2.2 : 1.8} />
        {count > 0 ? (
          <View style={[styles.count, { backgroundColor: colors.saffron }]}>
            <Text style={[styles.countText, { color: colors.saffronForeground }]} numberOfLines={1}>
              {count > 99 ? "99+" : String(count)}
            </Text>
          </View>
        ) : null}
      </View>
      <Text
        numberOfLines={1}
        style={{
          fontFamily: isFocused ? font.semibold : font.medium,
          fontSize: 11,
          lineHeight: 14,
          color: ink,
        }}
      >
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  bar: { flexDirection: "row", borderTopWidth: StyleSheet.hairlineWidth },
  barItem: { flex: 1, alignItems: "center", gap: 3, paddingBottom: space[1], minHeight: 54 },
  barMark: {
    height: 3,
    width: 32,
    borderBottomLeftRadius: 3,
    borderBottomRightRadius: 3,
    marginBottom: 6,
  },
  rail: { alignItems: "center", gap: space[1] },
  railMark: { marginBottom: space[5] },
  railItem: {
    width: RAIL_WIDTH - space[3],
    alignItems: "center",
    gap: 4,
    paddingVertical: space[3],
    borderRadius: radius.md,
  },
  count: {
    position: "absolute",
    top: -6,
    right: -12,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    alignItems: "center",
    justifyContent: "center",
  },
  countText: { fontFamily: font.bold, fontSize: 10, lineHeight: 13 },
});
