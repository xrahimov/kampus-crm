import { fireEvent, screen } from "@testing-library/react-native";

import { fakeEngine, openPanel, peer, renderRoom } from "@/features/room/test-support";

jest.mock("@react-native-async-storage/async-storage", () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageCode: "en" }] }));
// The phone's own WebRTC and loudspeaker are native code; a test draws a plain view instead.
jest.mock("react-native-webrtc", () => ({ registerGlobals: jest.fn(), RTCView: "RTCView" }));
jest.mock("react-native-incall-manager", () => ({
  start: jest.fn(),
  stop: jest.fn(),
  setKeepScreenOn: jest.fn(),
}));

// A phone asks the drawn board for its picture, which is native code too.
const mockPicture = jest.fn(async (..._board: unknown[]) => new Uint8Array([137, 80, 78, 71]));
jest.mock("@/features/room/board-picture", () => ({
  boardPicture: (...args: unknown[]) => mockPicture(...args),
}));

/*
 * The whiteboard in the app (A-209), over a stand-in for the call engine: who
 * may draw, what a finger sends, and the teacher's switches.
 */

const layout = (width: number, height: number) => ({
  nativeEvent: { layout: { x: 0, y: 0, width, height } },
});
const touch = (x: number, y: number) => ({ nativeEvent: { locationX: x, locationY: y } });
const LINE = {
  id: "s1",
  color: "#111827",
  width: 4,
  erase: false,
  layer: "",
  points: [
    [0.1, 0.1],
    [0.2, 0.2],
  ] as [number, number][],
  by: null,
};
const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
  mockPicture.mockClear();
});

describe("the whiteboard in the app", () => {
  it("puts the board on a student's stage and tells them only the teacher draws", async () => {
    const engine = fakeEngine("STUDENT", [peer("t", "Demo Teacher", { role: "HOST" })]);
    engine.currentStage = { ...engine.currentStage, board: true };
    await renderRoom(engine);
    expect(await screen.findByTestId("whiteboard")).toBeTruthy();
    expect(screen.getByTestId("board-view-only")).toBeTruthy();
    expect(screen.queryByTestId("board-eraser")).toBeNull();
    // Everyone is still there, beside the board.
    expect(screen.getByTestId("tile-t")).toBeTruthy();
    expect(screen.getByTestId("tile-self")).toBeTruthy();
  });

  it("sends a finger's line as one stroke in 0-1 coordinates", async () => {
    const engine = fakeEngine("HOST", [peer("a", "Aziza Karimova")]);
    engine.currentStage = { ...engine.currentStage, board: true };
    await renderRoom(engine);
    await screen.findByTestId("whiteboard");
    await fireEvent(screen.getByTestId("board-space"), "layout", layout(400, 400));
    const surface = await screen.findByTestId("board-touch");
    // 400 wide gives a board of 400 x 225.
    await fireEvent(surface, "layout", layout(400, 225));
    await fireEvent(surface, "responderGrant", touch(100, 45));
    await fireEvent(surface, "responderMove", touch(200, 90));
    await fireEvent(surface, "responderRelease", touch(200, 90));

    expect(engine.drawStroke).toHaveBeenCalledTimes(1);
    const stroke = engine.drawStroke.mock.calls[0]![0];
    expect(stroke).toMatchObject({
      layer: "",
      erase: false,
      color: "#111827",
      width: 4,
      points: [
        [0.25, 0.2],
        [0.5, 0.4],
      ],
    });
  });

  it("draws with the eraser and another colour when they are chosen", async () => {
    const engine = fakeEngine("HOST", [peer("a", "Aziza Karimova")]);
    engine.currentStage = { ...engine.currentStage, board: true };
    await renderRoom(engine);
    await screen.findByTestId("whiteboard");
    await fireEvent(screen.getByTestId("board-space"), "layout", layout(400, 400));
    const surface = await screen.findByTestId("board-touch");
    await fireEvent(surface, "layout", layout(400, 225));

    await fireEvent.press(screen.getByTestId("board-color-dc2626"));
    await fireEvent.press(screen.getByTestId("board-width-8"));
    await fireEvent(surface, "responderGrant", touch(10, 10));
    await fireEvent(surface, "responderRelease", touch(10, 10));
    expect(engine.drawStroke.mock.calls[0]![0]).toMatchObject({ color: "#dc2626", width: 8 });

    await fireEvent.press(screen.getByTestId("board-eraser"));
    await fireEvent(surface, "responderGrant", touch(10, 10));
    await fireEvent(surface, "responderRelease", touch(10, 10));
    expect(engine.drawStroke.mock.calls[1]![0]).toMatchObject({ erase: true });
  });

  it("gives the teacher undo, clear and the switch that lets students draw", async () => {
    const engine = fakeEngine("HOST", [peer("a", "Aziza Karimova")]);
    engine.strokes = [
      {
        id: "s1",
        color: "#111827",
        width: 4,
        erase: false,
        layer: "",
        points: [
          [0.1, 0.1],
          [0.2, 0.2],
        ],
        by: null,
      },
    ];
    engine.currentStage = { ...engine.currentStage, board: true };
    await renderRoom(engine);
    await screen.findByTestId("whiteboard");

    await fireEvent.press(screen.getByTestId("board-undo"));
    expect(engine.undoStroke).toHaveBeenCalledWith("");
    await fireEvent.press(screen.getByTestId("board-clear"));
    expect(engine.clearBoard).toHaveBeenCalledWith("");
    await fireEvent.press(screen.getByTestId("board-students-draw"));
    expect(engine.setStudentsMayDraw).toHaveBeenCalledWith(true);
  });

  it("opens and closes the whiteboard from the teacher's lesson tools", async () => {
    const engine = fakeEngine("HOST", [peer("a", "Aziza Karimova")]);
    await renderRoom(engine);
    await openPanel("open-tools");
    await fireEvent.press(await screen.findByTestId("tool-board"));
    expect(engine.setStage).toHaveBeenCalledWith({ board: true });
  });

  it("has no lesson tools for a student", async () => {
    const engine = fakeEngine("STUDENT", [peer("t", "Demo Teacher", { role: "HOST" })]);
    await renderRoom(engine);
    await screen.findByTestId("call-room");
    expect(screen.queryByTestId("open-tools")).toBeNull();
  });

  it("saves the teacher's board as a picture under the lesson's materials (A-222)", async () => {
    const fetchMock = jest.fn(async (..._call: [string, RequestInit?]) => ({
      status: 201,
      ok: true,
      text: async () => JSON.stringify({ id: "m1", title: "Whiteboard", url: "/files/m1" }),
    }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const engine = fakeEngine("HOST", [peer("a", "Aziza Karimova")]);
    engine.strokes = [LINE];
    engine.currentStage = { ...engine.currentStage, board: true };
    await renderRoom(engine);
    await screen.findByTestId("whiteboard");
    expect(screen.queryByTestId("board-save-state")).toBeNull();

    await fireEvent.press(screen.getByTestId("board-save"));
    expect((await screen.findByTestId("board-save-state")).props.children).toBe(
      "Saved under the group's materials",
    );
    // The picture is made from the board's own strokes and sent as it is.
    expect(mockPicture).toHaveBeenCalledTimes(1);
    expect(mockPicture.mock.calls[0]![1]).toEqual([LINE]);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toMatch(/\/api\/v1\/video\/rooms\/room-1\/board$/);
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>)["Content-Type"]).toBe("image/png");
    expect(Array.from(init?.body as unknown as Uint8Array)).toEqual([137, 80, 78, 71]);
  });

  it("saves nothing from an empty board", async () => {
    const engine = fakeEngine("HOST", [peer("a", "Aziza Karimova")]);
    engine.currentStage = { ...engine.currentStage, board: true };
    await renderRoom(engine);
    await screen.findByTestId("whiteboard");
    // Nothing is drawn yet: the button waits.
    expect(screen.getByTestId("board-save").props.accessibilityState?.disabled).toBe(true);
    await fireEvent.press(screen.getByTestId("board-save"));
    expect(mockPicture).not.toHaveBeenCalled();
  });

  it("says so when the board could not be saved", async () => {
    const fetchMock = jest.fn(async (..._call: [string, RequestInit?]) => ({
      status: 403,
      ok: false,
      text: async () =>
        JSON.stringify({ error: { code: "FORBIDDEN", message: "errors.forbidden" } }),
    }));
    globalThis.fetch = fetchMock as unknown as typeof fetch;
    const engine = fakeEngine("HOST", [peer("a", "Aziza Karimova")]);
    engine.strokes = [LINE];
    engine.currentStage = { ...engine.currentStage, board: true };
    await renderRoom(engine);
    await screen.findByTestId("whiteboard");
    await fireEvent.press(screen.getByTestId("board-save"));
    expect((await screen.findByTestId("board-save-state")).props.children).toBe("Could not save");
  });

  it("gives a student who may draw no way to save the board", async () => {
    const engine = fakeEngine("STUDENT", [peer("t", "Demo Teacher", { role: "HOST" })]);
    engine.strokes = [LINE];
    engine.boardStudentsMayDraw = true;
    engine.currentStage = { ...engine.currentStage, board: true };
    await renderRoom(engine);
    await screen.findByTestId("whiteboard");
    expect(screen.getByTestId("board-eraser")).toBeTruthy();
    expect(screen.queryByTestId("board-save")).toBeNull();
  });
});
