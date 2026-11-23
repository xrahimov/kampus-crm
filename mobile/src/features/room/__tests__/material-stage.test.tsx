import { act, fireEvent, screen } from "@testing-library/react-native";
import { Linking } from "react-native";

import { fakeEngine, peer, renderRoom, shown } from "@/features/room/test-support";

jest.mock("@react-native-async-storage/async-storage", () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageCode: "en" }] }));
jest.mock("react-native-webrtc", () => ({ registerGlobals: jest.fn(), RTCView: "RTCView" }));
jest.mock("react-native-incall-manager", () => ({
  start: jest.fn(),
  stop: jest.fn(),
  setKeepScreenOn: jest.fn(),
}));

interface FakePlayer {
  currentTime: number;
  duration: number;
  playing: boolean;
  play: jest.Mock;
  pause: jest.Mock;
  emit(name: string, payload: unknown): void;
}
const players = (jest.requireMock("expo-video") as { __players: FakePlayer[] }).__players;

/*
 * A file on everyone's stage, in the app (A-210): the teacher turns pages and
 * runs the player, everyone else follows, and what the phone cannot draw is a
 * card with a button.
 */

const TEACHER = () => fakeEngine("HOST", [peer("s", "Demo Student")]);
const STUDENT = () => fakeEngine("STUDENT", [peer("t", "Demo Teacher", { role: "HOST" })]);

function show(engine: ReturnType<typeof fakeEngine>, change: Parameters<typeof shown>[0]) {
  engine.currentStage = { ...engine.currentStage, material: shown(change) };
}

describe("a shown file in the app", () => {
  beforeEach(() => {
    players.length = 0;
  });

  it("lets the teacher turn a PDF's pages for everyone", async () => {
    const engine = TEACHER();
    show(engine, { view: "pdf", page: 2 });
    await renderRoom(engine);
    await fireEvent(await screen.findByTestId("material-page-space"), "layout", {
      nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 500 } },
    });
    const pdf = await screen.findByTestId("material-pdf");
    expect(pdf.props.page).toBe(2);
    expect(screen.getByTestId("material-page")).toHaveTextContent("Page 2");
    await fireEvent(pdf, "loadComplete", 5, "/tmp/unit-3.pdf", { width: 600, height: 800 });
    expect(screen.getByTestId("material-page")).toHaveTextContent("2 / 5");

    await fireEvent.press(screen.getByTestId("material-next"));
    expect(engine.turnMaterialPage).toHaveBeenCalledWith(3);
    await fireEvent.press(screen.getByTestId("material-prev"));
    expect(engine.turnMaterialPage).toHaveBeenCalledWith(1);
    await fireEvent.press(screen.getByTestId("material-stop"));
    expect(engine.hideMaterial).toHaveBeenCalled();
  });

  it("gives a student the page and no way to turn it or stop it", async () => {
    const engine = STUDENT();
    show(engine, { view: "pdf", page: 4 });
    await renderRoom(engine);
    await fireEvent(await screen.findByTestId("material-page-space"), "layout", {
      nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 500 } },
    });
    expect((await screen.findByTestId("material-pdf")).props.page).toBe(4);
    expect(screen.queryByTestId("material-next")).toBeNull();
    expect(screen.queryByTestId("material-prev")).toBeNull();
    expect(screen.queryByTestId("material-stop")).toBeNull();
    expect(screen.queryByTestId("material-pen")).toBeNull();
    // Looking closer is everyone's own.
    expect(screen.getByTestId("material-zoom")).toBeTruthy();
  });

  it("asks a student's PDF without the session and a teacher's with it", async () => {
    const student = STUDENT();
    show(student, { view: "pdf", url: "/api/v1/public/class/tok/files/k1" });
    await renderRoom(student);
    await fireEvent(await screen.findByTestId("material-page-space"), "layout", {
      nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 500 } },
    });
    const source = (await screen.findByTestId("material-pdf")).props.source;
    expect(source.uri).toMatch(/\/api\/v1\/public\/class\/tok\/files\/k1$/);
    expect(source.headers).toBeUndefined();
  });

  it("offers the file by itself when the phone cannot open it", async () => {
    const engine = STUDENT();
    show(engine, { view: "pdf" });
    await renderRoom(engine);
    await fireEvent(await screen.findByTestId("material-page-space"), "layout", {
      nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 500 } },
    });
    await fireEvent(await screen.findByTestId("material-pdf"), "error", new Error("broken"));
    expect(await screen.findByTestId("material-card")).toHaveTextContent(
      /could not be opened inside the lesson/,
    );
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    await fireEvent.press(screen.getByTestId("material-card-open"));
    expect(open).toHaveBeenCalledWith(expect.stringMatching(/\/public\/class\/tok\/files\//));
    open.mockRestore();
  });

  it("lets the teacher draw on a picture with the whiteboard's pen", async () => {
    const engine = TEACHER();
    show(engine, { view: "image", url: "/api/v1/public/class/tok/files/map.png" });
    await renderRoom(engine);
    await fireEvent(await screen.findByTestId("material-page-space"), "layout", {
      nativeEvent: { layout: { x: 0, y: 0, width: 390, height: 500 } },
    });
    expect(await screen.findByTestId("material-image")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("material-pen"));
    expect(engine.setStage).toHaveBeenCalledWith({ board: true });
  });

  it("runs a video from the teacher's buttons, for everyone", async () => {
    const engine = TEACHER();
    show(engine, { view: "video", url: "/api/v1/public/class/tok/files/clip.mp4" });
    await renderRoom(engine);
    await screen.findByTestId("material-transport");
    const player = players[players.length - 1]!;

    await fireEvent.press(screen.getByTestId("material-play"));
    expect(player.play).toHaveBeenCalled();
    expect(engine.setMaterialPlayback).toHaveBeenLastCalledWith(true, 0);

    player.currentTime = 30;
    await fireEvent.press(screen.getByTestId("material-forward"));
    expect(player.currentTime).toBe(40);
    expect(engine.setMaterialPlayback).toHaveBeenLastCalledWith(true, 40);

    await fireEvent.press(screen.getByTestId("material-back"));
    expect(engine.setMaterialPlayback).toHaveBeenLastCalledWith(true, 30);

    // A press in the middle of the bar jumps to the middle of the file.
    const bar = screen.getByTestId("material-seek");
    await fireEvent(bar, "layout", {
      nativeEvent: { layout: { x: 0, y: 0, width: 300, height: 28 } },
    });
    await fireEvent.press(bar, { nativeEvent: { locationX: 150 } });
    expect(engine.setMaterialPlayback).toHaveBeenLastCalledWith(true, 60);

    await fireEvent.press(screen.getByTestId("material-play"));
    expect(player.pause).toHaveBeenCalled();
    expect(engine.setMaterialPlayback).toHaveBeenLastCalledWith(false, 60);
  });

  it("never runs past either end of the file", async () => {
    const engine = TEACHER();
    show(engine, { view: "video", url: "/api/v1/public/class/tok/files/clip.mp4" });
    await renderRoom(engine);
    await screen.findByTestId("material-transport");
    const player = players[players.length - 1]!;
    player.currentTime = 4;
    await fireEvent.press(screen.getByTestId("material-back"));
    expect(engine.setMaterialPlayback).toHaveBeenLastCalledWith(false, 0);
    player.currentTime = 115;
    await fireEvent.press(screen.getByTestId("material-forward"));
    expect(engine.setMaterialPlayback).toHaveBeenLastCalledWith(false, 120);
  });

  it("keeps the buttons working after the file played to its end", async () => {
    const engine = TEACHER();
    show(engine, { view: "video", url: "/api/v1/public/class/tok/files/clip.mp4" });
    await renderRoom(engine);
    await screen.findByTestId("material-transport");
    const player = players[players.length - 1]! as FakePlayer & { status: string };

    // Android: at the end the player is "idle" again and no longer names its length.
    await act(async () => {
      player.currentTime = 120;
      player.playing = false;
      player.status = "idle";
      player.duration = 0;
      player.emit("timeUpdate", { currentTime: 120 });
      player.emit("playingChange", { isPlaying: false });
      player.emit("statusChange", { status: "idle" });
      player.emit("playToEnd", undefined);
    });
    expect(engine.setMaterialPlayback).toHaveBeenLastCalledWith(false, 120);
    expect(screen.getByTestId("material-time")).toHaveTextContent("2:00 / 2:00");

    await fireEvent.press(screen.getByTestId("material-back"));
    expect(player.currentTime).toBe(110);
    expect(engine.setMaterialPlayback).toHaveBeenLastCalledWith(false, 110);

    // Play at the very end starts the file over.
    player.currentTime = 120;
    await fireEvent.press(screen.getByTestId("material-play"));
    expect(player.currentTime).toBe(0);
    expect(player.play).toHaveBeenCalled();
    expect(engine.setMaterialPlayback).toHaveBeenLastCalledWith(true, 0);
  });

  it("puts a student's player where the teacher's is, with no buttons", async () => {
    const engine = STUDENT();
    // Playing since 05:00:00 from second 20; the server's clock says 05:00:00 now.
    show(engine, {
      view: "video",
      url: "/api/v1/public/class/tok/files/clip.mp4",
      playing: true,
      position: 20,
    });
    await renderRoom(engine);
    await screen.findByTestId("material-media");
    const player = players[players.length - 1]!;
    expect(screen.queryByTestId("material-transport")).toBeNull();
    expect(player.currentTime).toBe(20);
    expect(player.play).toHaveBeenCalled();

    // The teacher pauses at second 75: the student's player stops there.
    await act(async () => {
      engine.change(() => {
        show(engine, {
          view: "video",
          url: "/api/v1/public/class/tok/files/clip.mp4",
          playing: false,
          position: 75,
        });
      });
    });
    expect(player.pause).toHaveBeenCalled();
    expect(player.currentTime).toBe(75);
    expect(engine.setMaterialPlayback).not.toHaveBeenCalled();
  });

  it("shows a link as a card that opens it", async () => {
    const engine = STUDENT();
    show(engine, {
      kind: "LINK",
      view: "link",
      title: "Grammar site",
      url: "https://example.org/g",
    });
    await renderRoom(engine);
    expect(await screen.findByTestId("material-card")).toHaveTextContent(/Grammar site/);
    const open = jest.spyOn(Linking, "openURL").mockResolvedValue(undefined);
    await fireEvent.press(screen.getByTestId("material-card-open"));
    expect(open).toHaveBeenCalledWith("https://example.org/g");
    open.mockRestore();
  });
});
