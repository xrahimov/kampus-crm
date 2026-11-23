import * as Haptics from "expo-haptics";
import { useState, type ComponentProps, type ReactNode } from "react";
import {
  Platform,
  Pressable,
  StyleSheet,
  type PressableProps,
  type StyleProp,
  type ViewStyle,
} from "react-native";
import Animated, {
  FadeIn,
  FadeInDown,
  LinearTransition,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from "react-native-reanimated";

/*
 * How the app moves (A-224). Three rules, the site's own:
 *
 *  - Motion answers a touch or shows what changed; nothing moves by itself.
 *  - It is short: a press sinks in under a tenth of a second and springs back,
 *    what arrives is in place within a third of a second.
 *  - A device set to "Reduce motion" gets none of it: the animation library
 *    follows that setting for everything here.
 */

/** The one spring of the app: quick, with the slightest give at the end. */
export const SPRING = { duration: 420, dampingRatio: 0.82 } as const;
/** A spring with no give, for things that must not overshoot (a bar's highlight). */
export const SPRING_FIRM = { duration: 380, dampingRatio: 1 } as const;

/** Rows and cards that appear together arrive one after the other, this far apart. */
const STEP_MS = 38;
/** After this many, the rest arrive with the last: a long list does not take seconds. */
const STEPS = 9;
/** Beyond this many in one go nothing is animated: 700 students do not cascade. */
const ANIMATED_MOST = 24;

let arriving = 0;
let settle: ReturnType<typeof setTimeout> | undefined;

/**
 * This element's place among those appearing in the same moment. The count
 * starts again once nothing has appeared for a tenth of a second.
 */
function takePlace(): number {
  const place = arriving;
  arriving += 1;
  if (settle) clearTimeout(settle);
  settle = setTimeout(() => {
    arriving = 0;
    settle = undefined;
  }, 100);
  return place;
}

/** The arrival of an element drawn for the first time: it fades in and rises a few points. */
export function useArrival() {
  const [place] = useState(takePlace);
  if (place >= ANIMATED_MOST) return undefined;
  const arrival = FadeInDown.duration(320).delay(Math.min(place, STEPS) * STEP_MS);
  // In a browser the library pins an element whose arrival has values of its own to the spot it
  // arrived at, out of the page's flow; there the arrival keeps the library's own distance.
  if (Platform.OS === "web") return arrival;
  return arrival.withInitialValues({ opacity: 0, transform: [{ translateY: 10 }] });
}

/** Something that appears in place: a notice, a count. */
export const appear = FadeIn.duration(220);
/** Neighbours make room smoothly when something appears or goes. */
export const makeRoom = LinearTransition.duration(260);

const AnimatedPressable = Animated.createAnimatedComponent(Pressable);

export interface PressProps extends Omit<PressableProps, "style" | "children"> {
  style?: StyleProp<ViewStyle>;
  /** How far the element sinks under a finger: 0.97 for a button, 0.99 for a wide card. */
  sink?: number;
  /** How much it dims under a finger. */
  dim?: number;
  /** Arrive with the cascade when first drawn. */
  arrives?: boolean;
  children?: ReactNode;
}

/**
 * Anything that can be pressed. It sinks under the finger and springs back
 * when let go, so a press is felt before its result is seen.
 */
export function Press({
  style,
  sink = 0.97,
  dim = 0.12,
  arrives = false,
  onPressIn,
  onPressOut,
  children,
  ...rest
}: PressProps) {
  const down = useSharedValue(0);
  const arrival = useArrival();
  // A greyed-out element stays greyed out: the press dims from whatever it had.
  const flat = StyleSheet.flatten(style);
  const resting = typeof flat?.opacity === "number" ? flat.opacity : 1;
  const held = useAnimatedStyle(() => ({
    opacity: resting * (1 - dim * down.get()),
    transform: [{ scale: 1 - (1 - sink) * down.get() }],
  }));
  const props: ComponentProps<typeof AnimatedPressable> = {
    ...rest,
    onPressIn: (event) => {
      down.set(withTiming(1, { duration: 80 }));
      onPressIn?.(event);
    },
    onPressOut: (event) => {
      down.set(withSpring(0, SPRING));
      onPressOut?.(event);
    },
    style: [style, held],
  };
  if (arrives && arrival) props.entering = arrival;
  return <AnimatedPressable {...props}>{children}</AnimatedPressable>;
}

/** A light tick under the finger when a choice changes (phones only; the web has none). */
export function tick(): void {
  if (Platform.OS === "web") return;
  void Haptics.selectionAsync().catch(() => undefined);
}

export { Animated };
