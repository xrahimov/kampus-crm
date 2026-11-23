import { act, fireEvent, screen, waitFor } from "@testing-library/react-native";

import { fakeEngine, openPanel, peer, renderRoom, shown } from "@/features/room/test-support";

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

/*
 * The lesson room in the app (A-207), drawn over a stand-in for the call
 * engine: what the buttons ask the engine to do, and who a teacher and a
 * student see where.
 */

describe("the lesson room in the app", () => {
  it("turns the microphone, the camera and a student's hand on and off through the engine", async () => {
    const engine = fakeEngine("STUDENT", [peer("t", "Demo Teacher", { role: "HOST" })]);
    await renderRoom(engine);
    await screen.findByTestId("call-room");

    await fireEvent.press(screen.getByTestId("toggle-mic"));
    expect(engine.setAudio).toHaveBeenCalledWith(false);
    await fireEvent.press(screen.getByTestId("toggle-camera"));
    expect(engine.setVideo).toHaveBeenCalledWith(false);
    await fireEvent.press(screen.getByTestId("toggle-hand"));
    expect(engine.setHand).toHaveBeenCalledWith(true);
  });

  it("gives a teacher no hand to raise, and asks before ending the lesson for everyone", async () => {
    const engine = fakeEngine("HOST", [peer("a", "Aziza Karimova")]);
    const onEndForAll = jest.fn(() => Promise.resolve());
    const { onLeave } = await renderRoom(engine, { onEndForAll });
    await screen.findByTestId("call-room");
    expect(screen.queryByTestId("toggle-hand")).toBeNull();

    await openPanel("leave");
    expect(onLeave).not.toHaveBeenCalled();
    await fireEvent.press(await screen.findByTestId("end-for-all"));
    await waitFor(() => expect(onEndForAll).toHaveBeenCalledTimes(1));
  });

  it("ignores a press that lands on a sheet the moment it opens", async () => {
    // The sheet comes up under the finger that pressed Leave; "End for everyone" lies there.
    const engine = fakeEngine("HOST", [peer("a", "Aziza Karimova")]);
    const onEndForAll = jest.fn(() => Promise.resolve());
    await renderRoom(engine, { onEndForAll });
    await fireEvent.press(await screen.findByTestId("leave"));
    await fireEvent.press(await screen.findByTestId("end-for-all"));
    expect(onEndForAll).not.toHaveBeenCalled();

    await screen.findByTestId("room-sheet");
    await fireEvent.press(screen.getByTestId("end-for-all"));
    await waitFor(() => expect(onEndForAll).toHaveBeenCalledTimes(1));
  });

  it("lets a student leave in one press", async () => {
    const engine = fakeEngine("STUDENT", [peer("t", "Demo Teacher", { role: "HOST" })]);
    const { onLeave } = await renderRoom(engine);
    await fireEvent.press(await screen.findByTestId("leave"));
    expect(onLeave).toHaveBeenCalledTimes(1);
  });

  it("shows a teacher everyone as equal tiles, and a student the teacher on the stage", async () => {
    const teacherRoom = fakeEngine("HOST", [
      peer("a", "Aziza Karimova"),
      peer("b", "Bobur Aliyev"),
    ]);
    await renderRoom(teacherRoom);
    await screen.findByTestId("tile-wall");
    await screen.unmount();

    const studentRoom = fakeEngine("STUDENT", [
      peer("t", "Demo Teacher", { role: "HOST" }),
      peer("a", "Aziza Karimova"),
    ]);
    await renderRoom(studentRoom);
    await screen.findByTestId("tile-t");
    expect(screen.queryByTestId("tile-wall")).toBeNull();
    expect(screen.getByTestId("tile-self")).toBeTruthy();
    expect(screen.getByTestId("tile-a")).toBeTruthy();
  });

  it("hides the other students from a student while the teacher keeps the class in focus", async () => {
    const engine = fakeEngine("STUDENT", [
      peer("t", "Demo Teacher", { role: "HOST" }),
      peer("a", "Aziza Karimova"),
    ]);
    await renderRoom(engine);
    await screen.findByTestId("tile-a");
    await act(async () => {
      engine.change(() => {
        engine.currentStage = { ...engine.currentStage, focus: true };
      });
    });
    await waitFor(() => expect(screen.queryByTestId("tile-a")).toBeNull());
    expect(screen.getByTestId("tile-t")).toBeTruthy();
  });

  it("sends a chat line and counts lines as read while the chat is open", async () => {
    const engine = fakeEngine("STUDENT", [peer("t", "Demo Teacher", { role: "HOST" })]);
    engine.unread = 2;
    await renderRoom(engine);
    await openPanel("open-chat");
    await waitFor(() => expect(engine.markChatRead).toHaveBeenCalled());

    await fireEvent.changeText(screen.getByTestId("chat-input"), "Salom!");
    await fireEvent.press(screen.getByTestId("chat-send"));
    expect(engine.sendChat).toHaveBeenCalledWith("Salom!");
  });

  it("lets the teacher mute everyone, lower a hand and show one person to the class", async () => {
    const engine = fakeEngine("HOST", [
      peer("a", "Aziza Karimova", {
        media: { audio: true, video: true, screen: false, hand: true },
        handRaisedAt: "2026-11-23T05:10:00.000Z",
      }),
    ]);
    await renderRoom(engine);
    await openPanel("open-people");

    await fireEvent.press(await screen.findByTestId("mute-all"));
    expect(engine.mutePeers).toHaveBeenCalledWith();
    await fireEvent.press(screen.getByTestId("lower-a"));
    expect(engine.lowerHand).toHaveBeenCalledWith("a");
    await fireEvent.press(screen.getByTestId("mute-a"));
    expect(engine.mutePeers).toHaveBeenCalledWith(["a"]);
    await fireEvent.press(screen.getByTestId("spotlight-a"));
    expect(engine.setStage).toHaveBeenCalledWith({ spotlight: "a" });
    await fireEvent.press(screen.getByTestId("toggle-focus"));
    expect(engine.setStage).toHaveBeenCalledWith({ focus: true });
  });

  it("puts the file the teacher shows on the stage, with everyone still in sight", async () => {
    const engine = fakeEngine("STUDENT", [peer("t", "Demo Teacher", { role: "HOST" })]);
    engine.currentStage = { ...engine.currentStage, material: shown({ view: "image" }) };
    await renderRoom(engine);
    await screen.findByTestId("call-room");
    expect(screen.getByTestId("material-stage")).toBeTruthy();
    expect(screen.getByTestId("material-title")).toHaveTextContent("Unit 3");
    // Nobody is hidden behind the file: the teacher and you are in the strip beside it.
    expect(screen.getByTestId("tile-t")).toBeTruthy();
    expect(screen.getByTestId("tile-self")).toBeTruthy();
  });

  it("shows a message from the teacher until it is closed", async () => {
    const engine = fakeEngine("STUDENT", [peer("t", "Demo Teacher", { role: "HOST" })]);
    engine.notice = { text: "Open page 14", name: "Demo Teacher", at: 1 };
    await renderRoom(engine);
    const notice = await screen.findByTestId("host-notice");
    expect(notice).toHaveTextContent(/Demo Teacher:\s+Open page 14/);
    await fireEvent.press(screen.getByLabelText("Close"));
    expect(engine.dismissNotice).toHaveBeenCalledTimes(1);
  });
});
