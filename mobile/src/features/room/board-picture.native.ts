import { PixelRatio, Platform } from "react-native";
import type Svg from "react-native-svg";

import type { BoardStroke } from "@kampus/lib/validation/video";
import { BOARD_EXPORT_HEIGHT, BOARD_EXPORT_WIDTH } from "@kampus/lib/video/board-paint";

/** How long the phone gets to draw the picture before saving gives up. */
const PICTURE_TIMEOUT_MS = 10_000;

/**
 * The whiteboard as a PNG from a phone or tablet: the drawn board itself is
 * asked for its picture, 1600 by 900 however small it is on the screen. An
 * iPhone counts the size in points and multiplies by the screen's density, so
 * it is asked for that much less.
 */
export function boardPicture(
  board: Svg | null,
  _strokes: readonly BoardStroke[],
): Promise<Uint8Array> {
  return new Promise<Uint8Array>((resolve, reject) => {
    if (!board) {
      reject(new Error("The board is not on the screen"));
      return;
    }
    const density = Platform.OS === "ios" ? PixelRatio.get() : 1;
    const timer = setTimeout(() => reject(new Error("No picture came back")), PICTURE_TIMEOUT_MS);
    board.toDataURL(
      (base64?: string) => {
        clearTimeout(timer);
        if (!base64) reject(new Error("No picture came back"));
        else resolve(bytesFromBase64(base64));
      },
      {
        width: Math.round(BOARD_EXPORT_WIDTH / density),
        height: Math.round(BOARD_EXPORT_HEIGHT / density),
      },
    );
  });
}

/** Base64 text as bytes; line breaks in it are skipped. */
export function bytesFromBase64(base64: string): Uint8Array {
  const text = atob(base64.replace(/\s+/g, ""));
  const bytes = new Uint8Array(text.length);
  for (let i = 0; i < text.length; i++) bytes[i] = text.charCodeAt(i);
  return bytes;
}
