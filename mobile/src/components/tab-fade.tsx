import { defaultTabsSlotRender, type TabSlotProps } from "expo-router/ui";
import { useEffect, useRef, type ReactNode } from "react";
import { StyleSheet } from "react-native";
import { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

import { Animated } from "./motion";

/**
 * A place of the navigation that has just been chosen comes in softly: it
 * rises a few points and clears over a fifth of a second instead of replacing
 * the last one in a single frame (A-224). The place that is left simply goes.
 *
 * The start of that motion is set when a place is left, while nobody sees it,
 * not when it comes back: set on the way back, the place showed whole for a
 * moment, blinked and then faded in (seen on Android). It never starts from
 * nothing either, so a slow phone shows a pale page, not an empty one.
 */
function TabFade({ focused, children }: { focused: boolean; children: ReactNode }) {
  const shown = useSharedValue(1);
  const was = useRef(focused);
  useEffect(() => {
    if (focused && !was.current) shown.set(withTiming(1, { duration: 200 }));
    if (!focused && was.current) shown.set(0);
    was.current = focused;
  }, [focused, shown]);
  const style = useAnimatedStyle(() => ({
    opacity: PALE + (1 - PALE) * shown.get(),
    transform: [{ translateY: (1 - shown.get()) * 6 }],
  }));
  return <Animated.View style={[styles.fill, style]}>{children}</Animated.View>;
}

/** How clear a place is at the start of its way in. */
const PALE = 0.45;

/** For `TabSlot`'s `renderFn`: the router's own way of drawing a place, with the fade around it. */
export const renderTab: NonNullable<TabSlotProps["renderFn"]> = (descriptor, options) =>
  defaultTabsSlotRender(
    {
      ...descriptor,
      render: () => <TabFade focused={options.isFocused}>{descriptor.render()}</TabFade>,
    },
    options,
  );

const styles = StyleSheet.create({ fill: { flex: 1 } });
