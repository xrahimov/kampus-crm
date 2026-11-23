import {
  BOARD_ASPECT,
  boardHeight,
  boardPoint,
  eraserRuns,
  fitBox,
  strokePath,
  strokeWidth,
} from "@/features/room/board-shapes";

/* The whiteboard's strokes as shapes (A-209): the numbers the site paints on its canvas. */

describe("a stroke as a path", () => {
  it("scales 0-1 points to a board 1600 units wide", () => {
    const height = boardHeight(BOARD_ASPECT);
    expect(height).toBe(900);
    expect(
      strokePath(
        [
          [0, 0],
          [0.5, 0.5],
          [1, 1],
        ],
        height,
      ),
    ).toBe("M0 0L800 450L1600 900");
  });

  it("draws a tap as a dot", () => {
    expect(strokePath([[0.25, 0.5]], 900)).toBe("M400 450L400.1 450");
    expect(strokePath([], 900)).toBe("");
  });

  it("makes the eraser six times as wide as the pen", () => {
    expect(strokeWidth({ width: 4, erase: false })).toBe(4);
    expect(strokeWidth({ width: 4, erase: true })).toBe(24);
  });
});

describe("the eraser over a shown page", () => {
  const pen = (id: string) => ({ id, erase: false });
  const rub = (id: string) => ({ id, erase: true });

  it("rubs out only what was drawn before it", () => {
    const runs = eraserRuns([pen("a"), pen("b"), rub("x"), pen("c")]);
    expect(runs.map((r) => [r.pens.map((s) => s.id), r.erasers.map((s) => s.id)])).toEqual([
      [["a", "b"], ["x"]],
      [["c"], []],
    ]);
  });

  it("keeps eraser strokes that follow each other together, and drops one with nothing under it", () => {
    const runs = eraserRuns([rub("first"), pen("a"), rub("x"), rub("y")]);
    expect(runs).toHaveLength(1);
    expect(runs[0]!.erasers.map((s) => s.id)).toEqual(["x", "y"]);
  });
});

describe("a finger on the board", () => {
  it("becomes a 0-1 pair, kept inside the board", () => {
    expect(boardPoint(100, 50, { width: 400, height: 200 })).toEqual([0.25, 0.25]);
    expect(boardPoint(-20, 500, { width: 400, height: 200 })).toEqual([0, 1]);
    expect(boardPoint(10, 10, { width: 0, height: 0 })).toEqual([0, 0]);
  });
});

describe("fitting the board into the space", () => {
  it("fills the width of an upright phone and the height of a wide stage", () => {
    expect(fitBox({ width: 390, height: 500 }, 16 / 9)).toEqual({ width: 390, height: 219 });
    expect(fitBox({ width: 1000, height: 450 }, 16 / 9)).toEqual({ width: 800, height: 450 });
    expect(fitBox({ width: 0, height: 100 }, 16 / 9)).toEqual({ width: 0, height: 0 });
  });
});
