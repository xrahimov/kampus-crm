import { BlurTargetView, BlurView } from "expo-blur";
import { GlassView, isLiquidGlassAvailable } from "expo-glass-effect";
import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ComponentRef,
  type ReactNode,
  type RefObject,
} from "react";
import {
  AccessibilityInfo,
  Platform,
  StyleSheet,
  View,
  type StyleProp,
  type ViewProps,
  type ViewStyle,
} from "react-native";

import { useTheme } from "@/lib/theme";

/*
 * Glass (A-224): what floats over the page, the bars and the lesson's
 * controls, is a pane the page shows through, as on an iPhone. One component
 * draws it with the best the device has:
 *
 *  - iOS 26 and later: Apple's own Liquid Glass.
 *  - older iPhones and iPads, and the web: a blur of what is behind.
 *  - Android 12 and later: a blur of the page marked as the backdrop (see
 *    `Backdrop`); older Android, or glass with no backdrop: a pane that is
 *    nearly solid, because see-through without blur makes text unreadable.
 *  - "Reduce transparency" switched on in the device's settings: a solid pane.
 *
 * Only things that float are glass. Cards and rows stay solid: they are the
 * content, and content is what glass is there to show.
 */

/** The page behind the glass of this part of the screen (Android needs it by name). */
const BackdropContext = createContext<RefObject<ComponentRef<typeof View> | null> | null>(null);

/** Glass inside a scope blurs that scope's `Backdrop`. */
export function GlassScope({ children }: { children: ReactNode }) {
  const target = useRef<ComponentRef<typeof View>>(null);
  return <BackdropContext.Provider value={target}>{children}</BackdropContext.Provider>;
}

/**
 * The part of the screen that glass floats over. It comes before the glass in
 * the tree, and glass is never put inside it: a pane cannot blur itself.
 */
export function Backdrop({ children, style, ...rest }: ViewProps) {
  const target = useContext(BackdropContext);
  const { colors } = useTheme();
  const page = { backgroundColor: colors.background };
  return (
    <BlurTargetView ref={target ?? undefined} {...rest} style={[page, style]}>
      {/* The page's colour is painted by a view INSIDE the backdrop. Android blurs what the
          backdrop's children draw and fills the rest with the window's own light background;
          a colour on the backdrop itself is outside what it reads, and a dark header over an
          empty part of the page came out grey. */}
      <View style={[StyleSheet.absoluteFill, styles.untouched, page]} testID="backdrop-page" />
      <BackdropContext.Provider value={null}>{children}</BackdropContext.Provider>
    </BlurTargetView>
  );
}

/** True while the device asks for solid surfaces (iOS: Reduce Transparency). */
export function useSolidSurfaces(): boolean {
  const [solid, setSolid] = useState(false);
  useEffect(() => {
    // The web's AccessibilityInfo has no such question; a browser answers through a media query.
    if (Platform.OS === "web") {
      const query = globalThis.matchMedia?.("(prefers-reduced-transparency: reduce)");
      if (!query) return undefined;
      const heard = () => setSolid(query.matches);
      heard();
      query.addEventListener("change", heard);
      return () => query.removeEventListener("change", heard);
    }
    let live = true;
    AccessibilityInfo.isReduceTransparencyEnabled()
      .then((on) => {
        if (live) setSolid(Boolean(on));
      })
      .catch(() => undefined);
    const watch = AccessibilityInfo.addEventListener("reduceTransparencyChanged", setSolid);
    return () => {
      live = false;
      watch.remove();
    };
  }, []);
  return solid;
}

/** Apple's Liquid Glass is there (iOS 26 and later). */
function hasLiquidGlass(): boolean {
  if (Platform.OS !== "ios") return false;
  try {
    return isLiquidGlassAvailable();
  } catch {
    return false;
  }
}

/** Android blurs only from version 12 (API 31); below it the pane is nearly solid. */
function canBlur(): boolean {
  return Platform.OS !== "android" || Number(Platform.Version) >= 31;
}

export type GlassTone = "page" | "night";

export interface GlassProps extends ViewProps {
  /** "page" follows the theme; "night" is the lesson room's dark lapis whatever the theme. */
  tone?: GlassTone;
  /** The corner radius of the pane; a bar that touches the screen's edges has none. */
  radius?: number;
  /** A pane that floats free gets a soft shadow; a bar joined to an edge gets a hairline. */
  floating?: boolean;
  /** Which edge a joined bar's hairline is on. */
  edge?: "top" | "bottom" | "none";
  style?: StyleProp<ViewStyle>;
  children?: ReactNode;
}

export function Glass({
  tone = "page",
  radius = 0,
  floating = false,
  edge = "none",
  style,
  children,
  ...rest
}: GlassProps) {
  const { colors, dark } = useTheme();
  const target = useContext(BackdropContext);
  const solid = useSolidSurfaces();
  const night = tone === "night";
  const darkPane = dark || night;
  const round = radius > 0 ? { borderRadius: radius } : null;

  const liquid = !solid && hasLiquidGlass();
  const blurs = !solid && canBlur() && (Platform.OS !== "android" || target !== null);
  const base = night ? "23, 35, 75" : dark ? "20, 26, 43" : "255, 255, 255";
  // Over a blur the tint is thin; without one it carries the legibility alone. Android's blur
  // lays a tint of its own over the pane that grows with the strength (white at 0.44 of it,
  // near-black at 0.69), so there both are lower: at full strength the pane read as solid.
  const android = Platform.OS === "android";
  const strength = android ? (darkPane ? 45 : 50) : night ? 60 : dark ? 80 : 90;
  const thin = android ? (night ? 0.22 : dark ? 0.28 : 0.3) : night ? 0.26 : dark ? 0.34 : 0.46;
  const veil = solid ? 1 : blurs ? thin : 0.94;
  const rim = darkPane ? "rgba(255, 255, 255, 0.14)" : "rgba(255, 255, 255, 0.75)";
  const line = night ? "rgba(255, 255, 255, 0.1)" : colors.border;

  const frame: ViewStyle = floating
    ? {
        borderRadius: radius,
        boxShadow: darkPane
          ? "0 10px 28px rgba(1, 3, 12, 0.45)"
          : "0 10px 28px rgba(23, 35, 75, 0.16)",
      }
    : {
        borderTopWidth: edge === "top" ? StyleSheet.hairlineWidth : 0,
        borderBottomWidth: edge === "bottom" ? StyleSheet.hairlineWidth : 0,
        borderColor: line,
      };

  return (
    <View {...rest} style={[frame, style]}>
      {liquid ? (
        <GlassView
          glassEffectStyle="regular"
          colorScheme={darkPane ? "dark" : "light"}
          tintColor={night ? "rgba(23, 35, 75, 0.35)" : undefined}
          style={[StyleSheet.absoluteFill, styles.untouched, round]}
        />
      ) : (
        <>
          {blurs ? (
            <BlurView
              intensity={strength}
              tint={darkPane ? "dark" : "default"}
              blurTarget={target ?? undefined}
              blurMethod="dimezisBlurViewSdk31Plus"
              style={[StyleSheet.absoluteFill, styles.untouched, round, styles.clip]}
            />
          ) : null}
          <View
            testID={solid ? "glass-solid" : undefined}
            style={[
              StyleSheet.absoluteFill,
              styles.untouched,
              round,
              { backgroundColor: `rgba(${base}, ${veil})` },
              // The lit rim of a pane of glass; a solid surface has none.
              floating && !solid
                ? { borderWidth: StyleSheet.hairlineWidth, borderColor: rim }
                : null,
            ]}
          />
        </>
      )}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  clip: { overflow: "hidden" },
  // The panes are pictures: a touch goes to what is drawn on them.
  untouched: { pointerEvents: "none" },
});
