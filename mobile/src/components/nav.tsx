import type { TabListProps, TabTriggerSlotProps } from "expo-router/ui";
import type { LucideIcon } from "lucide-react-native";
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
  type ComponentRef,
  type Ref,
} from "react";
import { Pressable, StyleSheet, View, type LayoutChangeEvent } from "react-native";
import {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { font, radius, space, useTheme } from "@/lib/theme";

import { Glass } from "./glass";
import { KampusMark } from "./logo";
import { Animated, SPRING, tick } from "./motion";
import { Text } from "./text";

/** The rail on a tablet is this wide. */
export const RAIL_WIDTH = 92;
/** The floating bar on a phone is this tall. */
export const BAR_HEIGHT = 64;
/** The bar keeps at least this far from the bottom edge and the sides of the screen. */
const BAR_MARGIN = space[3];
const BAR_INSET = 6;

/** How far up from the bottom of the screen the page is covered by the bar. */
export function barSpace(bottomInset: number): number {
  return BAR_HEIGHT + Math.max(bottomInset, BAR_MARGIN) - bottomInset + space[1];
}

interface Frame {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The place the navigation is in tells the list where it is, so the highlight can travel there. */
const HighlightContext = createContext<(frame: Frame) => void>(() => undefined);

/**
 * The app's navigation in its two shapes: a glass bar that floats over the
 * bottom of a phone, within reach of a thumb (A-224), and a lapis rail down
 * the left of a tablet, the site's sidebar in miniature. The same places
 * either way, and a highlight that slides from the place left to the place
 * chosen.
 */
export function NavList({ wide, children, ...rest }: TabListProps & { wide: boolean }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const x = useSharedValue(0);
  const y = useSharedValue(0);
  const width = useSharedValue(0);
  const height = useSharedValue(0);
  const placed = useRef(false);
  const [shown, setShown] = useState(false);

  const moveTo = useCallback(
    (frame: Frame) => {
      if (!placed.current) {
        // The first time there is nowhere to come from: the highlight is simply there.
        placed.current = true;
        x.set(frame.x);
        y.set(frame.y);
        width.set(frame.width);
        height.set(frame.height);
        setShown(true);
        return;
      }
      x.set(withSpring(frame.x, SPRING));
      y.set(withSpring(frame.y, SPRING));
      width.set(withSpring(frame.width, SPRING));
      height.set(withSpring(frame.height, SPRING));
    },
    [height, width, x, y],
  );
  const highlight = useAnimatedStyle(() => ({
    width: width.get(),
    height: height.get(),
    transform: [{ translateX: x.get() }, { translateY: y.get() }],
  }));

  if (wide) {
    return (
      <HighlightContext.Provider value={moveTo}>
        {/* The rail starts under the status bar. The clock sits over this corner on a tablet,
            in the page's ink: on the dark rail it could not be read in light mode. */}
        <View
          style={{
            width: RAIL_WIDTH + insets.left,
            paddingTop: insets.top,
            backgroundColor: colors.background,
          }}
        >
          <View
            {...rest}
            accessibilityRole="tablist"
            style={[
              styles.rail,
              {
                backgroundColor: colors.sidebar,
                paddingTop: space[4],
                paddingBottom: insets.bottom + space[4],
                paddingLeft: insets.left,
              },
            ]}
          >
            {shown ? (
              <Animated.View
                testID="nav-highlight"
                style={[
                  styles.highlight,
                  styles.railHighlight,
                  { backgroundColor: colors.sidebarMuted },
                  highlight,
                ]}
              />
            ) : null}
            <View style={styles.railMark}>
              <KampusMark size={36} />
            </View>
            {children}
          </View>
        </View>
      </HighlightContext.Provider>
    );
  }
  return (
    <HighlightContext.Provider value={moveTo}>
      <View
        style={[styles.dock, { bottom: Math.max(insets.bottom, BAR_MARGIN) }]}
        // The strip beside the bar lets touches through to the page.
        pointerEvents="box-none"
      >
        <Glass floating radius={BAR_HEIGHT / 2} style={styles.bar}>
          <View {...rest} accessibilityRole="tablist" style={styles.barRow}>
            {shown ? (
              <Animated.View
                testID="nav-highlight"
                style={[
                  styles.highlight,
                  styles.barHighlight,
                  { backgroundColor: colors.accent },
                  highlight,
                ]}
              />
            ) : null}
            {children}
          </View>
        </Glass>
      </View>
    </HighlightContext.Provider>
  );
}

export function NavItem({
  wide,
  icon: Icon,
  label,
  count = 0,
  isFocused,
  ref,
  onPress,
  onLayout,
  ...rest
}: TabTriggerSlotProps & { wide: boolean; icon: LucideIcon; label: string; count?: number }) {
  const { colors } = useTheme();
  const moveTo = useContext(HighlightContext);
  const [frame, setFrame] = useState<Frame | null>(null);
  const focused = Boolean(isFocused);
  const lift = useSharedValue(1);
  const wasFocused = useRef(focused);

  useEffect(() => {
    if (focused && frame) moveTo(frame);
  }, [focused, frame, moveTo]);
  useEffect(() => {
    // The icon of the place just chosen dips and comes back, like a key pressed.
    if (focused && !wasFocused.current) {
      lift.set(withSequence(withTiming(0.84, { duration: 90 }), withSpring(1, SPRING)));
    }
    wasFocused.current = focused;
  }, [focused, lift]);
  const pop = useAnimatedStyle(() => ({ transform: [{ scale: lift.get() }] }));

  const ink = wide
    ? focused
      ? colors.sidebarActive
      : colors.sidebarForeground
    : focused
      ? colors.accentForeground
      : colors.mutedForeground;
  return (
    <Pressable
      {...rest}
      ref={ref as Ref<ComponentRef<typeof Pressable>>}
      accessibilityRole="tab"
      accessibilityState={{ selected: focused }}
      accessibilityLabel={count > 0 ? `${label}, ${count}` : label}
      onPress={(event) => {
        if (!focused) tick();
        onPress?.(event);
      }}
      onLayout={(event: LayoutChangeEvent) => {
        setFrame(event.nativeEvent.layout);
        onLayout?.(event);
      }}
      style={wide ? styles.railItem : styles.barItem}
    >
      <Animated.View style={pop}>
        <Icon size={wide ? 24 : 22} color={ink} strokeWidth={focused ? 2.2 : 1.8} />
        {count > 0 ? (
          <View style={[styles.count, { backgroundColor: colors.saffron }]}>
            <Text style={[styles.countText, { color: colors.saffronForeground }]} numberOfLines={1}>
              {count > 99 ? "99+" : String(count)}
            </Text>
          </View>
        ) : null}
      </Animated.View>
      <Text
        numberOfLines={1}
        style={{
          fontFamily: focused ? font.semibold : font.medium,
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
  // The bar floats: it sits over the page instead of taking a strip of it.
  dock: {
    position: "absolute",
    left: 0,
    right: 0,
    alignItems: "center",
    paddingHorizontal: BAR_MARGIN,
  },
  bar: { width: "100%", maxWidth: 460, height: BAR_HEIGHT, borderRadius: BAR_HEIGHT / 2 },
  barRow: { flex: 1, flexDirection: "row", padding: BAR_INSET },
  barItem: { flex: 1, alignItems: "center", justifyContent: "center", gap: 3 },
  highlight: { position: "absolute", left: 0, top: 0 },
  barHighlight: { borderRadius: (BAR_HEIGHT - 2 * BAR_INSET) / 2 },
  railHighlight: { borderRadius: radius.md },
  rail: { flex: 1, alignItems: "center", gap: space[1] },
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
