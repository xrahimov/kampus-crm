import Svg, { Circle, Path, Rect } from "react-native-svg";

import { palette } from "@/lib/theme";

const STAR =
  "M16 5.5 18.9 12l6.6-2.5L23 16l2.5 6.5L18.9 20 16 26.5 13.1 20l-6.6 2.5L9 16 6.5 9.5l6.6 2.5z";

/**
 * The Kampus mark, the same drawing as the site's (src/components/brand/logo.tsx):
 * a lapis star on a dome-turquoise tile. The colours do not follow the theme;
 * the mark is the mark.
 */
export function KampusMark({ size = 32 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32" accessibilityElementsHidden>
      <Rect width="32" height="32" rx="7" fill={palette.light.sidebarActive} />
      <Path d={STAR} fill={palette.light.sidebar} />
      <Circle cx="16" cy="16" r="3" fill={palette.light.sidebarActive} />
    </Svg>
  );
}
