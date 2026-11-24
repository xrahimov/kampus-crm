import {
  createContext,
  useContext,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type ComponentRef,
  type ReactNode,
  type Ref,
} from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
  type ScrollViewProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import {
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useLayout } from "@/lib/layout";
import { CONTENT_MAX_WIDTH, radius, space, useTheme, type Colors } from "@/lib/theme";

import { Backdrop, Glass, GlassScope } from "./glass";
import { Animated, Press, SPRING_FIRM, appear, tick, useArrival } from "./motion";
import { Text } from "./text";

/**
 * How much of the bottom of a screen the floating navigation bar covers. The
 * tabs set it; a screen pushed over them has no bar and gets 0.
 */
const BottomBarContext = createContext(0);
export const BottomBarSpace = BottomBarContext.Provider;

/** A first guess at a header's height, so the page does not jump when the real one is measured. */
const HEADER_GUESS = 36 + 2 * space[3];

/** What a screen can ask of its own scrolling part (the manual: go to a section). */
export interface ScreenScroll {
  /** Brings what stands `y` points down the page to the top, just under the header. */
  to: (y: number, animated?: boolean) => void;
}

/**
 * The page under every screen: the porcelain background, safe-area padding, a
 * column that stops growing on tablets, and pull-to-refresh when the screen
 * has something to reload.
 *
 * The header and the save bar are glass (A-224): they float over the page and
 * the page scrolls beneath them, so the screen leaves that much room at the
 * top and the bottom of what it scrolls.
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
  scrollRef,
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
  /** For a screen that moves its own page: a section of an article. */
  scrollRef?: Ref<ScreenScroll>;
}) {
  const { colors } = useTheme();
  const { wide } = useLayout();
  const insets = useSafeAreaInsets();
  const bottomBar = useContext(BottomBarContext);
  const pad = wide ? space[8] : space[4];
  const [headerHeight, setHeaderHeight] = useState(header ? insets.top + HEADER_GUESS : 0);
  const [footerHeight, setFooterHeight] = useState(0);
  const measure = (set: (height: number) => void) => (event: LayoutChangeEvent) =>
    set(Math.round(event.nativeEvent.layout.height));
  const top = header ? headerHeight : padTop ? insets.top : 0;
  const bottom = footer ? footerHeight : insets.bottom + bottomBar;
  // On an iPhone the room under the header is the scroll view's own inset, not padding: the
  // page then rests right under the header and a pull down is measured from there.
  const inset = Platform.OS === "ios" && scroll;
  const room = useMemo(() => ({ top }), [top]);
  const start = useMemo(() => ({ x: 0, y: -top }), [top]);
  const scroller = useRef<ComponentRef<typeof ScrollView>>(null);
  const wanted = useRef<number | null>(null);
  // A place on the page is counted from the top of what scrolls, which on every platform
  // starts `top` under the header's lower edge or has that much room above it: the same sum.
  const go = (y: number, animated: boolean) =>
    scroller.current?.scrollTo({
      y: Math.max(inset ? -top : 0, Math.round(y - top - space[3])),
      animated,
    });
  const goRef = useRef(go);
  useEffect(() => {
    goRef.current = go;
  });
  useImperativeHandle(
    scrollRef,
    () => ({
      to: (y, animated = true) => {
        wanted.current = y;
        goRef.current(y, animated);
      },
    }),
    [],
  );
  // The header is measured a moment after the page is drawn: a place asked for before that
  // is gone to again, until the reader moves the page themselves.
  useEffect(() => {
    if (wanted.current !== null) goRef.current(wanted.current, false);
  }, [top]);
  const reload = usePullToReload({
    onRefresh: scroll ? onRefresh : undefined,
    refreshing,
    rest: inset ? top : 0,
    below: top,
  });
  const inner: StyleProp<ViewStyle> = [
    styles.column,
    {
      paddingHorizontal: pad,
      paddingTop: pad + (inset ? 0 : top),
      paddingBottom: pad + bottom,
    },
    contentStyle,
  ];
  return (
    <GlassScope>
      <View style={[styles.page, { backgroundColor: colors.background }]}>
        <KeyboardAvoidingView
          style={styles.fill}
          // Android draws under the keyboard (edge to edge): the page gives up that room and the
          // field being typed in stays in view. iOS moves the scrolling part by itself (below).
          behavior={Platform.OS === "android" ? "padding" : undefined}
        >
          <View style={styles.fill}>
            <Backdrop style={styles.fill}>
              {scroll ? (
                <ScrollView
                  ref={scroller}
                  style={styles.fill}
                  contentContainerStyle={styles.grow}
                  testID="screen-scroll"
                  keyboardShouldPersistTaps="handled"
                  // iOS: a field under the keyboard is scrolled into view.
                  automaticallyAdjustKeyboardInsets
                  contentInset={inset ? room : undefined}
                  // The page starts under the header, and goes back there when the header grows.
                  contentOffset={inset ? start : undefined}
                  scrollIndicatorInsets={{ top, bottom: footer ? footerHeight : bottomBar }}
                  onScrollBeginDrag={() => {
                    wanted.current = null;
                  }}
                  {...reload.scrollProps}
                >
                  <View style={inner}>{children}</View>
                </ScrollView>
              ) : (
                <View style={[styles.fill, inner]}>{children}</View>
              )}
            </Backdrop>
            {footer ? (
              <Glass
                edge="top"
                onLayout={measure(setFooterHeight)}
                style={[
                  styles.footer,
                  { paddingBottom: space[3] + insets.bottom, paddingHorizontal: pad },
                ]}
              >
                <View style={styles.footerColumn}>{footer}</View>
              </Glass>
            ) : null}
          </View>
        </KeyboardAvoidingView>
        {header ? (
          <View style={styles.header} onLayout={measure(setHeaderHeight)}>
            {header}
          </View>
        ) : null}
        {reload.sign}
      </View>
    </GlassScope>
  );
}

/**
 * How far the page has to move down before letting go reloads it. An iPhone's
 * page resists a pull (it moves about half as far as the finger, less on a
 * taller screen), so this is a drag of about 80 points. At 48 a drag of 100
 * was just enough on an iPhone and just short on an iPad.
 */
const PULL_TO_RELOAD = 40;
/** Until the pull is far enough the sign is pale and small, so the two can be told apart. */
const NOT_YET = 0.55;
const RELOAD_SIGN = 40;

/**
 * Pull down to reload, for a scrolling part: `scrollProps` go on the
 * `ScrollView` and `sign` is drawn over it (in a parent the sign can be placed
 * in; `below` is how far down that parent the page starts).
 *
 * Android uses the system's refresh control, moved below the header. An iPhone
 * and iPad get the app's own sign: the system's spinner did not draw under a
 * floating header (A-228). `rest` is where the page rests there when its room
 * under the header is the scroll view's inset.
 */
export function usePullToReload({
  onRefresh,
  refreshing = false,
  rest = 0,
  below = 0,
}: {
  onRefresh: (() => void) | undefined;
  refreshing?: boolean;
  rest?: number;
  below?: number;
}): { scrollProps: Partial<ScrollViewProps>; sign: ReactNode } {
  const { colors } = useTheme();
  const reload = useShownReload(refreshing, onRefresh);
  const pulledBy = useSharedValue(0);
  const [farEnough, setFarEnough] = useState(false);
  if (!onRefresh) return { scrollProps: {}, sign: null };
  if (Platform.OS !== "ios") {
    return {
      scrollProps: {
        refreshControl: (
          <RefreshControl
            refreshing={reload.showing}
            onRefresh={reload.pull}
            tintColor={colors.ring}
            progressViewOffset={below}
          />
        ),
      },
      sign: null,
    };
  }
  const pulled = (event: NativeSyntheticEvent<NativeScrollEvent>) =>
    Math.max(0, -(event.nativeEvent.contentOffset.y + rest));
  return {
    scrollProps: {
      scrollEventThrottle: 16,
      onScroll: (event) => {
        const by = pulled(event);
        pulledBy.set(by);
        const now = by >= PULL_TO_RELOAD;
        if (now === farEnough) return;
        setFarEnough(now);
        // A tick under the finger: letting go now reloads.
        if (now && !reload.showing) tick();
      },
      onScrollEndDrag: (event) => {
        // The finger is off: from here the sign shows the reload, not the pull.
        setFarEnough(false);
        if (pulled(event) >= PULL_TO_RELOAD && !reload.showing) reload.pull();
      },
    },
    sign: (
      <ReloadSign
        top={below}
        pulledBy={pulledBy}
        farEnough={farEnough}
        reloading={reload.showing}
      />
    ),
  };
}

/**
 * The reload sign on an iPhone and iPad: a small pane of glass under the
 * header. It comes in pale as the page is pulled down, turns clear and starts
 * to spin once the pull is far enough, spins from the moment the page is let
 * go until it has reloaded, and fades out.
 */
function ReloadSign({
  top,
  pulledBy,
  farEnough,
  reloading,
}: {
  top: number;
  pulledBy: SharedValue<number>;
  farEnough: boolean;
  reloading: boolean;
}) {
  const { colors } = useTheme();
  const on = reloading || farEnough;
  const full = useSharedValue(0);
  useEffect(() => {
    full.set(withTiming(on ? 1 : 0, { duration: on ? 120 : 220 }));
  }, [full, on]);
  const look = useAnimatedStyle(() => {
    const coming = NOT_YET * Math.min(1, pulledBy.get() / PULL_TO_RELOAD);
    const part = Math.max(full.get(), coming);
    return {
      opacity: part,
      transform: [{ translateY: (part - 1) * 12 }, { scale: 0.7 + 0.3 * part }],
    };
  });
  return (
    <Animated.View style={[styles.reload, { top: top + space[2] }, look]}>
      <Glass floating radius={RELOAD_SIGN / 2} style={styles.reloadPane}>
        <ActivityIndicator
          animating={on}
          hidesWhenStopped={false}
          color={colors.ring}
          testID="screen-reloading"
        />
      </Glass>
    </Animated.View>
  );
}

/** The sign of a pull stays at least this long: a quick server would hide it before it showed. */
const RELOAD_SHOWN_MS = 700;

/**
 * The reload sign belongs to the person's pull. It shows from the pull until
 * the page has reloaded, and never for less than a moment: against a fast
 * server the reload was over before the sign had appeared. A reload nobody
 * asked for (the app coming back to the front) shows no sign and does not
 * move the page.
 */
function useShownReload(reloading: boolean, onRefresh: (() => void) | undefined) {
  const [pulled, setPulled] = useState(false);
  const since = useRef(0);
  useEffect(() => {
    if (!pulled || reloading) return undefined;
    const left = Math.max(0, RELOAD_SHOWN_MS - (Date.now() - since.current));
    const timer = setTimeout(() => setPulled(false), left);
    return () => clearTimeout(timer);
  }, [pulled, reloading]);
  const pull = () => {
    since.current = Date.now();
    setPulled(true);
    onRefresh?.();
  };
  return { showing: pulled, pull };
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
  const arrival = useArrival();
  const look = [styles.card, { backgroundColor: colors.card, borderColor: colors.border }, style];
  if (!onPress) {
    return (
      <Animated.View entering={arrival} style={look} testID={testID}>
        {children}
      </Animated.View>
    );
  }
  return (
    <Press
      onPress={onPress}
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      arrives
      sink={0.985}
      dim={0.18}
      style={look}
    >
      {children}
    </Press>
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
    <Animated.View
      entering={appear}
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
    </Animated.View>
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

const SEGMENT_GAP = 3;

/** Two to four choices side by side; the chosen one is filled, and the fill slides to a new choice. */
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
  const [width, setWidth] = useState(0);
  const count = Math.max(options.length, 1);
  const index = Math.max(
    options.findIndex((option) => option.value === value),
    0,
  );
  // Each choice is as wide as the others; the fill is one of them and moves by whole steps.
  const step = width > 0 ? (width - 2 * SEGMENT_GAP + SEGMENT_GAP) / count : 0;
  const at = useSharedValue(index * step);
  const measured = useRef(false);
  useEffect(() => {
    // The first time the row is measured the fill is simply on the chosen one; after that it slides.
    at.set(measured.current ? withSpring(index * step, SPRING_FIRM) : index * step);
    measured.current = step > 0;
  }, [at, index, step]);
  const slide = useAnimatedStyle(() => ({ transform: [{ translateX: at.get() }] }));
  return (
    <View
      accessibilityRole="tablist"
      testID={testID}
      onLayout={(event) => setWidth(event.nativeEvent.layout.width)}
      style={[styles.segmented, { backgroundColor: colors.secondary }]}
    >
      {step > 0 ? (
        <Animated.View
          style={[
            styles.segmentFill,
            { width: step - SEGMENT_GAP, backgroundColor: colors.card, borderColor: colors.border },
            slide,
          ]}
        />
      ) : null}
      {options.map((option) => {
        const chosen = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected: chosen }}
            onPress={() => {
              if (!chosen) tick();
              onChange(option.value);
            }}
            testID={testID ? `${testID}-${option.value}` : undefined}
            style={[
              styles.segment,
              // Until the row has been measured the chosen one is filled in place.
              chosen && step === 0 && { backgroundColor: colors.card, borderColor: colors.border },
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
  header: { position: "absolute", top: 0, left: 0, right: 0 },
  footer: { position: "absolute", left: 0, right: 0, bottom: 0, paddingTop: space[3] },
  footerColumn: { width: "100%", maxWidth: CONTENT_MAX_WIDTH, alignSelf: "center" },
  // A sign, not a control: a touch goes to the page under it.
  reload: { position: "absolute", left: 0, right: 0, alignItems: "center", pointerEvents: "none" },
  reloadPane: {
    width: RELOAD_SIGN,
    height: RELOAD_SIGN,
    alignItems: "center",
    justifyContent: "center",
  },
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
  segmented: {
    flexDirection: "row",
    borderRadius: radius.md,
    padding: SEGMENT_GAP,
    gap: SEGMENT_GAP,
  },
  segmentFill: {
    position: "absolute",
    top: SEGMENT_GAP,
    bottom: SEGMENT_GAP,
    left: SEGMENT_GAP,
    borderRadius: radius.md - 3,
    borderWidth: 1,
  },
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
