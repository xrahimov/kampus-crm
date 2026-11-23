import type { ReactNode } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useLayout } from "@/lib/layout";
import { CONTENT_MAX_WIDTH, radius, space, useTheme, type Colors } from "@/lib/theme";

import { Text } from "./text";

/**
 * The page under every screen: the porcelain background, safe-area padding, a
 * column that stops growing on tablets, and pull-to-refresh when the screen
 * has something to reload.
 */
export function Screen({
  children,
  scroll = true,
  onRefresh,
  refreshing = false,
  header,
  footer,
  contentStyle,
  padTop = false,
}: {
  children: ReactNode;
  scroll?: boolean;
  onRefresh?: () => void;
  refreshing?: boolean;
  /** Stays above the scrolling part. */
  header?: ReactNode;
  /** Stays below it: a save bar. */
  footer?: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  /** For screens without a navigation header: keep clear of the status bar. */
  padTop?: boolean;
}) {
  const { colors } = useTheme();
  const { wide } = useLayout();
  const insets = useSafeAreaInsets();
  const pad = wide ? space[8] : space[4];
  const inner: StyleProp<ViewStyle> = [
    styles.column,
    { paddingHorizontal: pad, paddingTop: pad, paddingBottom: pad + (footer ? 0 : insets.bottom) },
    contentStyle,
  ];
  return (
    <View
      style={[
        styles.page,
        { backgroundColor: colors.background, paddingTop: padTop ? insets.top : 0 },
      ]}
    >
      {header}
      <KeyboardAvoidingView
        style={styles.fill}
        // Android draws under the keyboard (edge to edge): the page gives up that room and the
        // field being typed in stays in view. iOS moves the scrolling part by itself (below).
        behavior={Platform.OS === "android" ? "padding" : undefined}
      >
        {scroll ? (
          <ScrollView
            style={styles.fill}
            contentContainerStyle={styles.grow}
            keyboardShouldPersistTaps="handled"
            // iOS: a field under the keyboard is scrolled into view.
            automaticallyAdjustKeyboardInsets
            refreshControl={
              onRefresh ? (
                <RefreshControl
                  refreshing={refreshing}
                  onRefresh={onRefresh}
                  tintColor={colors.ring}
                />
              ) : undefined
            }
          >
            <View style={inner}>{children}</View>
          </ScrollView>
        ) : (
          <View style={[styles.fill, inner]}>{children}</View>
        )}
        {footer ? (
          <View
            style={[
              styles.footer,
              {
                backgroundColor: colors.card,
                borderTopColor: colors.border,
                paddingBottom: space[3] + insets.bottom,
                paddingHorizontal: pad,
              },
            ]}
          >
            <View style={styles.footerColumn}>{footer}</View>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </View>
  );
}

/** A flat card: a hairline border, no shadow, as on the site. */
export function Card({
  children,
  onPress,
  style,
  testID,
  accessibilityLabel,
}: {
  children: ReactNode;
  onPress?: () => void;
  style?: StyleProp<ViewStyle>;
  testID?: string;
  accessibilityLabel?: string;
}) {
  const { colors } = useTheme();
  const look = [styles.card, { backgroundColor: colors.card, borderColor: colors.border }, style];
  if (!onPress) {
    return (
      <View style={look} testID={testID}>
        {children}
      </View>
    );
  }
  return (
    <Pressable
      onPress={onPress}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [look, pressed && { backgroundColor: colors.muted }]}
    >
      {children}
    </Pressable>
  );
}

export type Tone = "neutral" | "success" | "warning" | "destructive" | "accent";

function toneColors(colors: Colors, tone: Tone): { bg: string; ink: string } {
  switch (tone) {
    case "success":
      return { bg: colors.successSoft, ink: colors.success };
    case "warning":
      return { bg: colors.warningSoft, ink: colors.saffronForeground };
    case "destructive":
      return { bg: colors.destructiveSoft, ink: colors.destructive };
    case "accent":
      return { bg: colors.accent, ink: colors.accentForeground };
    default:
      return { bg: colors.secondary, ink: colors.secondaryForeground };
  }
}

/** A short state word: "Live", "3 to check". */
export function Badge({
  label,
  tone = "neutral",
  testID,
}: {
  label: string;
  tone?: Tone;
  testID?: string;
}) {
  const { colors, dark } = useTheme();
  const look = toneColors(colors, tone);
  return (
    <View style={[styles.badge, { backgroundColor: look.bg }]} testID={testID}>
      <Text
        variant="smallStrong"
        style={{ color: tone === "warning" && dark ? colors.warning : look.ink }}
        numberOfLines={1}
      >
        {label}
      </Text>
    </View>
  );
}

/** A message in the page: what went wrong, or what just happened. */
export function Notice({
  children,
  tone = "neutral",
  testID,
}: {
  children: ReactNode;
  tone?: Tone;
  testID?: string;
}) {
  const { colors, dark } = useTheme();
  const look = toneColors(colors, tone);
  return (
    <View
      accessibilityRole="alert"
      testID={testID}
      style={[styles.notice, { backgroundColor: look.bg, borderColor: look.bg }]}
    >
      <Text
        variant="small"
        style={{ color: tone === "warning" && dark ? colors.warning : look.ink }}
      >
        {children}
      </Text>
    </View>
  );
}

/** The whole area is waiting for its first data. */
export function Loading() {
  const { colors } = useTheme();
  return (
    <View style={styles.center} accessibilityRole="progressbar">
      <ActivityIndicator color={colors.ring} />
    </View>
  );
}

/** Nothing to show yet: say what would appear here, and offer the next step when there is one. */
export function EmptyState({
  title,
  text,
  action,
}: {
  title: string;
  text?: string;
  action?: ReactNode;
}) {
  return (
    <View style={styles.empty}>
      <Text variant="heading" style={styles.centerText}>
        {title}
      </Text>
      {text ? (
        <Text variant="body" tone="mutedForeground" style={styles.centerText}>
          {text}
        </Text>
      ) : null}
      {action}
    </View>
  );
}

/** A hairline between rows of one card. */
export function Divider() {
  const { colors } = useTheme();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: colors.border }} />;
}

/** Initials on a quiet disc, where the site shows a photo or the same initials. */
export function Avatar({ name, size = 36 }: { name: string; size?: number }) {
  const { colors } = useTheme();
  const initials = name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor: colors.secondary,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Text variant="smallStrong" tone="secondaryForeground">
        {initials}
      </Text>
    </View>
  );
}

/** Two to four choices side by side; the chosen one is filled. */
export function Segmented<T extends string>({
  options,
  value,
  onChange,
  testID,
}: {
  options: ReadonlyArray<{ value: T; label: string }>;
  value: T;
  onChange: (value: T) => void;
  testID?: string;
}) {
  const { colors } = useTheme();
  return (
    <View
      accessibilityRole="tablist"
      testID={testID}
      style={[styles.segmented, { backgroundColor: colors.secondary }]}
    >
      {options.map((option) => {
        const chosen = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: chosen }}
            onPress={() => onChange(option.value)}
            testID={testID ? `${testID}-${option.value}` : undefined}
            style={[
              styles.segment,
              chosen && { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Text
              variant="smallStrong"
              tone={chosen ? "foreground" : "mutedForeground"}
              numberOfLines={1}
            >
              {option.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1 },
  fill: { flex: 1 },
  grow: { flexGrow: 1 },
  column: { width: "100%", maxWidth: CONTENT_MAX_WIDTH, alignSelf: "center", gap: space[4] },
  footer: { borderTopWidth: StyleSheet.hairlineWidth, paddingTop: space[3] },
  footerColumn: { width: "100%", maxWidth: CONTENT_MAX_WIDTH, alignSelf: "center" },
  card: { borderWidth: 1, borderRadius: radius.lg, padding: space[4], gap: space[3] },
  badge: {
    alignSelf: "flex-start",
    paddingHorizontal: space[2],
    paddingVertical: 2,
    borderRadius: radius.full,
  },
  notice: { borderWidth: 1, borderRadius: radius.md, padding: space[3] },
  center: { flex: 1, minHeight: 160, alignItems: "center", justifyContent: "center" },
  empty: { alignItems: "center", gap: space[2], paddingVertical: space[10] },
  centerText: { textAlign: "center" },
  segmented: { flexDirection: "row", borderRadius: radius.md, padding: 3, gap: 3 },
  segment: {
    flex: 1,
    minHeight: 38,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.md - 3,
    borderWidth: 1,
    borderColor: "transparent",
    paddingHorizontal: space[2],
  },
});
