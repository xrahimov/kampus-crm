import type { BoardStroke } from "../validation/video";

/*
 * The whiteboard painted on a canvas: the site's board itself, and the picture
 * saved under a lesson's materials, from the site and from the app's web build.
 */

/** The board's background; the eraser paints with it. */
export const BOARD_BACKGROUND = "#ffffff";
/** The size of the saved picture (16:9). Pen widths are given for this width. */
export const BOARD_EXPORT_WIDTH = 1600;
export const BOARD_EXPORT_HEIGHT = 900;

export function paintBoard(
  ctx: CanvasRenderingContext2D,
  strokes: readonly BoardStroke[],
  width: number,
  height: number,
  /** Over a shown page (A-183): nothing is filled, and the eraser rubs the marks out. */
  transparent = false,
): void {
  ctx.globalCompositeOperation = "source-over";
  if (transparent) ctx.clearRect(0, 0, width, height);
  else {
    ctx.fillStyle = BOARD_BACKGROUND;
    ctx.fillRect(0, 0, width, height);
  }
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  // Pen widths are given for a 1600px-wide board and scale with it.
  const scale = width / BOARD_EXPORT_WIDTH;
  for (const s of strokes) {
    ctx.globalCompositeOperation = transparent && s.erase ? "destination-out" : "source-over";
    ctx.strokeStyle = s.erase ? BOARD_BACKGROUND : s.color;
    ctx.lineWidth = Math.max(1, s.width * (s.erase ? 6 : 1) * scale);
    ctx.beginPath();
    s.points.forEach(([x, y], i) => {
      if (i === 0) ctx.moveTo(x * width, y * height);
      else ctx.lineTo(x * width, y * height);
    });
    if (s.points.length === 1) ctx.lineTo(s.points[0]![0] * width + 0.1, s.points[0]![1] * height);
    ctx.stroke();
  }
  ctx.globalCompositeOperation = "source-over";
}

/** The whole board as a PNG, 1600 by 900, on a canvas the browser makes. */
export function boardToPng(strokes: readonly BoardStroke[]): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = BOARD_EXPORT_WIDTH;
  canvas.height = BOARD_EXPORT_HEIGHT;
  paintBoard(canvas.getContext("2d")!, strokes, BOARD_EXPORT_WIDTH, BOARD_EXPORT_HEIGHT);
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("toBlob"))), "image/png"),
  );
}
