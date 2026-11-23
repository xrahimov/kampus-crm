import { defaultTabsSlotRender, type TabSlotProps } from "expo-router/ui";
import { useEffect, useRef, type ReactNode } from "react";
import { StyleSheet } from "react-native";
import { useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";

import { Animated } from "./motion";

/**
 * A place of the navigation that has just been chosen comes in softly: it
 * fades up over a fifth of a second instead of replacing the last one in a
 * single frame (A-224). The place that is left simply goes.
 */
function TabFade({ focused, children }: { focused: boolean; children: ReactNode }) {
  const shown = useSharedValue(1);
  const was = useRef(focused);
  useEffect(() => {
    if (focused && !was.current) {
      shown.set(0);
      shown.set(withTiming(1, { duration: 220 }));
    }
    was.current = focused;
  }, [focused, shown]);
  const style = useAnimatedStyle(() => ({
    opacity: shown.get(),
    transform: [{ translateY: (1 - shown.get()) * 8 }],
  }));
  return <Animated.View style={[styles.fill, style]}>{children}</Animated.View>;
}

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
