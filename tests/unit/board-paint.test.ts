import { describe, expect, it } from "vitest";

import type { BoardStroke } from "@/lib/validation/video";
import { BOARD_BACKGROUND, paintBoard } from "@/lib/video/board-paint";

/*
 * The whiteboard's painter, shared by the site's board and the picture the
 * app's web build saves: what each stroke asks the canvas for.
 */

function canvas() {
  const calls: string[] = [];
  const ctx = {
    globalCompositeOperation: "source-over",
    fillStyle: "",
    strokeStyle: "",
    lineWidth: 0,
    lineCap: "",
    lineJoin: "",
    fillRect: (...a: number[]) => calls.push(`fill ${ctx.fillStyle} ${a.join(" ")}`),
    clearRect: (...a: number[]) => calls.push(`clear ${a.join(" ")}`),
    beginPath: () => calls.push("begin"),
    moveTo: (x: number, y: number) => calls.push(`move ${x} ${y}`),
    lineTo: (x: number, y: number) => calls.push(`line ${x} ${y}`),
    stroke: () =>
      calls.push(`stroke ${ctx.strokeStyle} ${ctx.lineWidth} ${ctx.globalCompositeOperation}`),
  };
  return { ctx: ctx as unknown as CanvasRenderingContext2D, calls };
}

const pen: BoardStroke = {
  id: "p",
  color: "#dc2626",
  width: 4,
  erase: false,
  layer: "",
  points: [
    [0.25, 0.5],
    [0.5, 1],
  ],
};
const rub: BoardStroke = { ...pen, id: "e", erase: true, points: [[0.5, 0.5]] };

describe("painting the whiteboard", () => {
  it("fills the sheet white and draws each stroke at the board's own scale", () => {
    const { ctx, calls } = canvas();
    paintBoard(ctx, [pen, rub], 1600, 900);
    expect(calls).toEqual([
      `fill ${BOARD_BACKGROUND} 0 0 1600 900`,
      "begin",
      "move 400 450",
      "line 800 900",
      "stroke #dc2626 4 source-over",
      "begin",
      "move 800 450",
      // A single tap is a dot; on the white sheet the eraser is a wide white pen.
      "line 800.1 450",
      `stroke ${BOARD_BACKGROUND} 24 source-over`,
    ]);
  });

  it("makes pens thinner on a smaller board and never thinner than one dot", () => {
    const { ctx, calls } = canvas();
    paintBoard(ctx, [pen, { ...pen, width: 1 }], 800, 450);
    expect(calls.filter((c) => c.startsWith("stroke"))).toEqual([
      "stroke #dc2626 2 source-over",
      "stroke #dc2626 1 source-over",
    ]);
  });

  it("over a shown page fills nothing and lets the eraser rub the marks out", () => {
    const { ctx, calls } = canvas();
    paintBoard(ctx, [pen, rub], 1600, 900, true);
    expect(calls[0]).toBe("clear 0 0 1600 900");
    expect(calls.at(-1)).toBe(`stroke ${BOARD_BACKGROUND} 24 destination-out`);
    expect(ctx.globalCompositeOperation).toBe("source-over");
  });
});
