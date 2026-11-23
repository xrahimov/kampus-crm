import type { BoardStroke } from "@kampus/lib/validation/video";

/*
 * The whiteboard as shapes (A-209). Strokes travel between people in 0-1
 * coordinates of the surface; here they become SVG paths on a surface 1600
 * units wide, the width the pen sizes are given for (the site paints the same
 * numbers on a canvas).
 */

/** The width every board is measured in; pen widths are in these units. */
export const BOARD_UNITS = 1600;
/** The whiteboard's shape; a shown page has its own. */
export const BOARD_ASPECT = 16 / 9;
/** The board's background; over it the eraser paints with this colour. */
export const BOARD_BACKGROUND = "#ffffff";
/** The eraser is this many times wider than the pen of the same size. */
const ERASER_FACTOR = 6;

/** The height of a surface of this shape, in board units. */
export function boardHeight(aspect: number): number {
  return Math.round(BOARD_UNITS / aspect);
}

const round = (n: number) => Math.round(n * 10) / 10;

/** One stroke as an SVG path; a single tap becomes a dot. */
export function strokePath(points: readonly (readonly [number, number])[], height: number): string {
  if (points.length === 0) return "";
  const at = ([x, y]: readonly [number, number]) =>
    `${round(x * BOARD_UNITS)} ${round(y * height)}`;
  const first = points[0]!;
  if (points.length === 1) {
    return `M${at(first)}L${round(first[0] * BOARD_UNITS + 0.1)} ${round(first[1] * height)}`;
  }
  return `M${points.map(at).join("L")}`;
}

/** How thick a stroke is drawn, in board units. */
export function strokeWidth(stroke: Pick<BoardStroke, "width" | "erase">): number {
  return Math.max(1, stroke.width * (stroke.erase ? ERASER_FACTOR : 1));
}

/**
 * Over a shown page nothing is painted for the eraser: it rubs out the marks
 * drawn before it and leaves the page. So the strokes are cut into runs: pen
 * strokes, then the eraser strokes that follow them, which hide everything up
 * to that point; later pen strokes start a new run on top.
 */
export interface Run<S> {
  pens: S[];
  /** The eraser strokes drawn after `pens` (and after every earlier run). */
  erasers: S[];
}

export function eraserRuns<S extends { erase: boolean }>(strokes: readonly S[]): Run<S>[] {
  const runs: Run<S>[] = [];
  let current: Run<S> | null = null;
  for (const stroke of strokes) {
    if (stroke.erase) {
      // An eraser with nothing under it rubs out nothing.
      if (!current) continue;
      current.erasers.push(stroke);
    } else {
      if (!current || current.erasers.length > 0) {
        current = { pens: [], erasers: [] };
        runs.push(current);
      }
      current.pens.push(stroke);
    }
  }
  return runs;
}

/** A finger's place on a surface of this size, as the 0-1 pair a stroke stores. */
export function boardPoint(
  x: number,
  y: number,
  size: { width: number; height: number },
): [number, number] {
  const clamp = (n: number) => Math.min(1, Math.max(0, n));
  const px = size.width > 0 ? clamp(x / size.width) : 0;
  const py = size.height > 0 ? clamp(y / size.height) : 0;
  return [Number(px.toFixed(4)), Number(py.toFixed(4))];
}

/** The largest box of this shape that fits the space, centred by the caller. */
export function fitBox(
  space: { width: number; height: number },
  aspect: number,
): { width: number; height: number } {
  if (space.width <= 0 || space.height <= 0) return { width: 0, height: 0 };
  const width = Math.min(space.width, space.height * aspect);
  return { width: Math.floor(width), height: Math.floor(width / aspect) };
}
