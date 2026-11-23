import { useEffect, useMemo, useRef, useState } from "react";
import { StyleSheet, View, type GestureResponderEvent, type LayoutChangeEvent } from "react-native";
import {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
  type SharedValue,
} from "react-native-reanimated";
import Svg, { Path, Polygon } from "react-native-svg";

import { Animated } from "@/components/motion";
import { palette } from "@/lib/theme";

/** Side of one tile: an eight-pointed star and the cross between four of them. */
const TILE = 96;
const R = TILE / 2;
/** Where the two squares of the star cross each other. */
const INNER = R * (Math.SQRT1_2 / Math.cos(Math.PI / 8));
/**
 * The site lays its tiles as a square grid turned by 45 degrees
 * (src/components/brand/tile-wall.tsx). Turned, the stars' centres stand on
 * every other crossing of an upright grid this wide.
 */
const STEP = TILE * Math.SQRT1_2;

/** The star's sixteen corners around a centre; a turn by 45 degrees lands it on itself. */
function starPoints(cx: number, cy: number): string[] {
  return Array.from({ length: 16 }, (_, k) => {
    const r = k % 2 === 0 ? R : INNER;
    const angle = (k * Math.PI) / 8;
    return `${(cx + r * Math.cos(angle)).toFixed(2)},${(cy + r * Math.sin(angle)).toFixed(2)}`;
  });
}

export interface StarCentre {
  x: number;
  y: number;
}

/**
 * Where the stars stand on a wall of this size, the site's own places: the
 * first one is at (0, 67.88), and every star touches four others tip to tip.
 * Stars that only reach in from outside the edge are counted too.
 */
export function starCentres(width: number, height: number): StarCentre[] {
  const centres: StarCentre[] = [];
  if (width <= 0 || height <= 0) return centres;
  const lastColumn = Math.ceil((width + R) / STEP);
  const lastRow = Math.ceil((height + R) / STEP);
  for (let row = -1; row <= lastRow; row += 1) {
    for (let column = -1; column <= lastColumn; column += 1) {
      if ((((row + column) % 2) + 2) % 2 !== 1) continue;
      centres.push({ x: column * STEP, y: row * STEP });
    }
  }
  return centres;
}

/** How far a drop's ring travels, how wide the ring is, and how long it takes. */
const DROP_REACH = 560;
const RING = 76;
/** A second, fainter ring follows the first, as on water. */
const SECOND_RING_BEHIND = 128;
const DROP_MS = 2200;
/** The light under a resting finger. */
const HELD_REACH = 150;
/** The band of daylight: half its width as a share of the wall, and its strength. */
const DAY_HALF = 0.16;
const DAY_STRENGTH = 0.6;
/** The direction the daylight travels in, the site's 115 degrees. */
const DAY_X = Math.sin((115 * Math.PI) / 180);
const DAY_Y = -Math.cos((115 * Math.PI) / 180);

/**
 * How brightly a tile is lit by a drop: `distance` from where the drop fell,
 * `progress` from 0 (it has just fallen) to 1 (the water is still again).
 */
export function litByDrop(distance: number, progress: number): number {
  "worklet";
  if (progress >= 1) return 0;
  // The ring starts fast and slows down; it stays bright most of the way, then dies out.
  const front = (1 - (1 - progress) * (1 - progress)) * DROP_REACH;
  const fading = 1 - progress * progress;
  const first = Math.max(0, 1 - Math.abs(distance - front) / RING);
  const behind = front - SECOND_RING_BEHIND;
  const second = behind > 0 ? 0.45 * Math.max(0, 1 - Math.abs(distance - behind) / RING) : 0;
  return Math.max(first, second) * fading;
}

interface Drop {
  x: SharedValue<number>;
  y: SharedValue<number>;
  /** 0 when it falls, 1 when it is over. */
  progress: SharedValue<number>;
}

function useDrop(): Drop {
  return { x: useSharedValue(0), y: useSharedValue(0), progress: useSharedValue(1) };
}

interface Light {
  /** Where the band of daylight is: 0 before the wall, 1 past it. */
  day: SharedValue<number>;
  drops: Drop[];
  heldX: SharedValue<number>;
  heldY: SharedValue<number>;
  held: SharedValue<number>;
}

const LIT_POINTS = starPoints(R + 1, R + 1).join(" ");

/** One tile's lit face: it shows as much as the light falling on it. */
function LitStar({
  x,
  y,
  along,
  light,
  testID,
}: {
  x: number;
  y: number;
  /** Where the tile stands on the daylight's way across the wall, 0 to 1. */
  along: number;
  light: Light;
  testID?: string;
}) {
  const style = useAnimatedStyle(() => {
    const dayAt = -0.2 + 1.4 * light.day.get();
    let lit = DAY_STRENGTH * Math.max(0, 1 - Math.abs(along - dayAt) / DAY_HALF);
    for (const drop of light.drops) {
      const distance = Math.hypot(x - drop.x.get(), y - drop.y.get());
      lit = Math.max(lit, litByDrop(distance, drop.progress.get()));
    }
    const held = light.held.get();
    if (held > 0) {
      const distance = Math.hypot(x - light.heldX.get(), y - light.heldY.get());
      lit = Math.max(lit, held * Math.max(0, 1 - distance / HELD_REACH));
    }
    return { opacity: Math.min(1, lit) };
  });
  return (
    <Animated.View
      style={[styles.star, { left: x - R - 1, top: y - R - 1 }, style]}
      testID={testID}
    >
      <Svg width={TILE + 2} height={TILE + 2}>
        <Polygon
          points={LIT_POINTS}
          fill={palette.light.sidebarActive}
          fillOpacity={0.25}
          stroke={palette.light.sidebarActive}
          strokeWidth={1}
        />
      </Svg>
    </Animated.View>
  );
}

/**
 * A wall of Samarkand's star-and-cross tiles in the navigation's lapis, the
 * same wall as the site's sign-in panel (src/components/brand/tile-wall.tsx):
 * the same tiles in the same places, and a band of daylight wandering over
 * them. The site lights the tiles under the mouse; here a touch falls like a
 * drop on water: rings of lit tiles run out from the finger, and the tiles
 * under a resting finger stay lit.
 *
 * The stars are drawn one by one. The site's drawing is one tile repeated by
 * an SVG pattern turned by 45 degrees, and iOS draws such a pattern unturned
 * and cut off, as rows of arrows.
 *
 * Decoration only: screen readers skip it, and a device set to "Reduce
 * motion" gets the still wall.
 */
export function TileWall() {
  const [size, setSize] = useState({ width: 0, height: 0 });
  const centres = useMemo(() => starCentres(size.width, size.height), [size]);
  const base = useMemo(
    () => centres.map(({ x, y }) => `M${starPoints(x, y).join("L")}Z`).join(""),
    [centres],
  );

  const day = useSharedValue(0);
  const first = useDrop();
  const second = useDrop();
  const third = useDrop();
  const light: Light = {
    day,
    drops: [first, second, third],
    heldX: useSharedValue(0),
    heldY: useSharedValue(0),
    held: useSharedValue(0),
  };
  const nextDrop = useRef(0);

  useEffect(() => {
    // After the screen has settled, as on the site; then round and round.
    day.set(
      withDelay(
        1600,
        withRepeat(withTiming(1, { duration: 9000, easing: Easing.inOut(Easing.quad) }), -1),
      ),
    );
  }, [day]);

  function onLayout(event: LayoutChangeEvent) {
    const { width, height } = event.nativeEvent.layout;
    setSize((old) => (old.width === width && old.height === height ? old : { width, height }));
  }

  function touched(event: GestureResponderEvent) {
    const { locationX, locationY } = event.nativeEvent;
    const drop = light.drops[nextDrop.current % light.drops.length]!;
    nextDrop.current += 1;
    drop.x.set(locationX);
    drop.y.set(locationY);
    drop.progress.set(0);
    drop.progress.set(withTiming(1, { duration: DROP_MS, easing: Easing.linear }));
    light.heldX.set(locationX);
    light.heldY.set(locationY);
    light.held.set(withTiming(1, { duration: 140 }));
  }

  function moved(event: GestureResponderEvent) {
    light.heldX.set(event.nativeEvent.locationX);
    light.heldY.set(event.nativeEvent.locationY);
  }

  function letGo() {
    light.held.set(withTiming(0, { duration: 600 }));
  }

  // The daylight's way across the wall, from one corner to the other.
  const way = size.width * Math.abs(DAY_X) + size.height * Math.abs(DAY_Y);

  return (
    <View
      style={[StyleSheet.absoluteFill, styles.wall]}
      onLayout={onLayout}
      onStartShouldSetResponder={() => true}
      onResponderGrant={touched}
      onResponderMove={moved}
      onResponderRelease={letGo}
      onResponderTerminate={letGo}
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants"
      testID="tile-wall"
    >
      {size.width > 0 ? (
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <Svg width={size.width} height={size.height}>
            <Path
              d={base}
              fill="#ffffff"
              fillOpacity={0.04}
              stroke={palette.light.sidebarActive}
              strokeOpacity={0.25}
              strokeWidth={1}
            />
          </Svg>
          {centres.map(({ x, y }, index) => (
            <LitStar
              key={`${x}:${y}`}
              x={x}
              y={y}
              along={
                ((x - size.width / 2) * DAY_X + (y - size.height / 2) * DAY_Y) / (way || 1) + 0.5
              }
              light={light}
              testID={`tile-wall-star-${index}`}
            />
          ))}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wall: { overflow: "hidden" },
  star: { position: "absolute", width: TILE + 2, height: TILE + 2 },
});
