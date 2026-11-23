import type Svg from "react-native-svg";

import type { BoardStroke } from "@kampus/lib/validation/video";
import { boardToPng } from "@kampus/lib/video/board-paint";

/**
 * The whiteboard as a PNG, 1600 by 900 (the web build; phones have their own
 * in `board-picture.native.ts`). A browser paints the strokes on a canvas,
 * the same way the site does.
 */
export async function boardPicture(
  _board: Svg | null,
  strokes: readonly BoardStroke[],
): Promise<Uint8Array> {
  const png = await boardToPng(strokes);
  return new Uint8Array(await png.arrayBuffer());
}
