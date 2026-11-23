import { palette } from "@/lib/theme";

/*
 * A lesson room is dark whatever the theme: faces read best against night
 * lapis, and a bright page behind a camera picture glares on a tablet in a
 * classroom. These are the site's room colours, as plain values.
 */
export const room = {
  background: palette.dark.sidebar,
  surface: palette.dark.sidebarMuted,
  surfaceRaised: "#1b2647",
  border: "#27355f",
  ink: "#f1f4fa",
  inkMuted: palette.dark.sidebarForeground,
  active: palette.dark.sidebarActive,
  activeInk: "#04201f",
  danger: "#e5484d",
  dangerInk: "#ffffff",
  warning: palette.dark.warning,
  scrim: "rgba(1, 3, 12, 0.6)",
} as const;

/** How many columns a wall of `count` equal tiles gets in a space this wide and tall. */
export function gridColumns(count: number, width: number, height: number): number {
  if (count <= 1) return 1;
  const landscape = width > height;
  if (count === 2) return landscape ? 2 : 1;
  if (count <= 4) return 2;
  if (count <= 6) return landscape ? 3 : 2;
  if (count <= 9) return 3;
  return landscape ? 4 : 3;
}

/** The gap between the round buttons of the bar at the bottom. */
export const CONTROL_GAP = 8;
const CONTROL_GAP_TIGHT = 4;
const CONTROL_MAX = 46;
const CONTROL_MIN = 38;
const BAR_PADDING = 8;

/**
 * How large the round buttons of the bar are when `count` of them share a
 * screen this wide: full size where they fit, smaller and closer together on a
 * narrow phone (a student who may also share the screen has eight).
 */
export function controlBar(count: number, width: number): { size: number; gap: number } {
  const fits = (gap: number) => Math.floor((width - 2 * BAR_PADDING - gap * (count - 1)) / count);
  const roomy = fits(CONTROL_GAP);
  if (roomy >= CONTROL_MAX) return { size: CONTROL_MAX, gap: CONTROL_GAP };
  const tight = fits(CONTROL_GAP_TIGHT);
  return { size: Math.max(CONTROL_MIN, Math.min(CONTROL_MAX, tight)), gap: CONTROL_GAP_TIGHT };
}
