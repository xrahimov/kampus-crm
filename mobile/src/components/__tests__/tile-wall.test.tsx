import { fireEvent, render, screen } from "@testing-library/react-native";

import { litByDrop, starCentres, TileWall } from "@/components/tile-wall";

jest.mock("@react-native-async-storage/async-storage", () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);

/*
 * The tiled wall of the tablet's sign-in screen (A-229): the site's tiles in
 * the site's places, drawn star by star, and a touch that falls like a drop.
 */

describe("where the stars stand", () => {
  const centres = starCentres(380, 1194);

  it("puts the first star where the site's turned pattern puts it", () => {
    expect(centres.some(({ x, y }) => x === 0 && Math.abs(y - 67.88) < 0.01)).toBe(true);
  });

  it("lets every star touch its neighbours tip to tip, with the cross between four", () => {
    const inside = centres.filter(({ x, y }) => x > 100 && x < 280 && y > 100 && y < 1000);
    expect(inside.length).toBeGreaterThan(10);
    for (const star of inside) {
      const nearest = centres
        .filter((other) => other !== star)
        .map((other) => Math.hypot(other.x - star.x, other.y - star.y))
        .sort((a, b) => a - b);
      // Four neighbours one tile away, tip to tip, and none closer.
      expect(nearest.slice(0, 4).every((d) => Math.abs(d - 96) < 0.01)).toBe(true);
      expect(nearest[4]!).toBeGreaterThan(96.01);
    }
  });

  it("covers the wall to its edges and draws nothing for a wall with no size", () => {
    expect(Math.min(...centres.map(({ x }) => x))).toBeLessThanOrEqual(0);
    expect(Math.max(...centres.map(({ x }) => x))).toBeGreaterThanOrEqual(380);
    expect(Math.min(...centres.map(({ y }) => y))).toBeLessThanOrEqual(0);
    expect(Math.max(...centres.map(({ y }) => y))).toBeGreaterThanOrEqual(1194);
    expect(starCentres(0, 0)).toEqual([]);
  });
});

describe("a drop on the wall", () => {
  it("lights the tiles the ring is passing, not the ones it has left or not reached", () => {
    // A third of the way in time the ring is a little over half its way out.
    const front = (1 - (2 / 3) ** 2) * 560;
    expect(litByDrop(front, 1 / 3)).toBeGreaterThan(0.8);
    expect(litByDrop(front + 200, 1 / 3)).toBe(0);
    expect(litByDrop(0, 1 / 3)).toBe(0);
  });

  it("is followed by a second, fainter ring", () => {
    const front = (1 - 0.5 ** 2) * 560;
    const second = litByDrop(front - 128, 0.5);
    expect(second).toBeGreaterThan(0.2);
    expect(second).toBeLessThan(litByDrop(front, 0.5));
  });

  it("dies out: nothing is lit when the water is still again", () => {
    expect(litByDrop(560, 1)).toBe(0);
    expect(litByDrop(0, 1.2)).toBe(0);
    expect(litByDrop(559, 0.99)).toBeLessThan(0.05);
  });
});

describe("the wall on the screen", () => {
  it("draws its tiles once it knows its size, and takes a touch", async () => {
    await render(<TileWall />);
    const hidden = { includeHiddenElements: true };
    const wall = screen.getByTestId("tile-wall", hidden);
    expect(screen.queryByTestId("tile-wall-star-0", hidden)).toBeNull();
    await fireEvent(wall, "layout", { nativeEvent: { layout: { width: 380, height: 1194 } } });
    expect(screen.getAllByTestId(/^tile-wall-star-/, hidden)).toHaveLength(
      starCentres(380, 1194).length,
    );
    // The wall asks for the touch itself: nothing under it should get it.
    expect(wall.props.onStartShouldSetResponder()).toBe(true);
    await fireEvent(wall, "responderGrant", { nativeEvent: { locationX: 180, locationY: 500 } });
    await fireEvent(wall, "responderMove", { nativeEvent: { locationX: 200, locationY: 520 } });
    await fireEvent(wall, "responderRelease", { nativeEvent: { locationX: 200, locationY: 520 } });
    expect(screen.getByTestId("tile-wall", hidden)).toBeTruthy();
  });

  it("is skipped by screen readers", async () => {
    await render(<TileWall />);
    const wall = screen.getByTestId("tile-wall", { includeHiddenElements: true });
    expect(wall.props.importantForAccessibility).toBe("no-hide-descendants");
    expect(wall.props.accessibilityElementsHidden).toBe(true);
  });
});
