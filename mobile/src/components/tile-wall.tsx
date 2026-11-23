import { StyleSheet, View } from "react-native";
import Svg, { Defs, Pattern, Polygon, Rect } from "react-native-svg";

import { palette } from "@/lib/theme";

/** Side of one tile: an eight-pointed star and the cross between four of them. */
const TILE = 96;
const R = TILE / 2;
/** Where the two squares of the star cross each other. */
const INNER = R * (Math.SQRT1_2 / Math.cos(Math.PI / 8));

const STAR = Array.from({ length: 16 }, (_, k) => {
  const r = k % 2 === 0 ? R : INNER;
  const angle = (k * Math.PI) / 8;
  return `${(R + r * Math.cos(angle)).toFixed(2)},${(R + r * Math.sin(angle)).toFixed(2)}`;
}).join(" ");

/**
 * A wall of Samarkand's star-and-cross tiles in the navigation's lapis, the
 * same drawing as the site's sign-in panel (src/components/brand/tile-wall.tsx),
 * at rest. Decoration only: screen readers skip it.
 */
export function TileWall({ id }: { id: string }) {
  return (
    <View
      style={StyleSheet.absoluteFill}
      pointerEvents="none"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
    >
      <Svg width="100%" height="100%">
        <Defs>
          <Pattern
            id={id}
            width={TILE}
            height={TILE}
            patternUnits="userSpaceOnUse"
            patternTransform="rotate(45)"
          >
            <Polygon
              points={STAR}
              fill="#ffffff"
              fillOpacity={0.04}
              stroke={palette.light.sidebarActive}
              strokeOpacity={0.28}
              strokeWidth={1}
            />
          </Pattern>
        </Defs>
        <Rect width="100%" height="100%" fill={`url(#${id})`} />
      </Svg>
    </View>
  );
}
