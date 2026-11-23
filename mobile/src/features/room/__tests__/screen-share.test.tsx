import { act, fireEvent, screen } from "@testing-library/react-native";

import { fakeEngine, peer, renderRoom } from "@/features/room/test-support";

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
// This file is about a device that can share its screen (an Android phone).
jest.mock("@/features/room/platform", () => ({
  ...jest.requireActual("@/features/room/platform"),
  screenShare: { available: true, open: jest.fn() },
}));

/*
 * Sharing the device's screen from the lesson room (A-208), over a stand-in
 * for the call engine: the button, what the room says while the screen is
 * shared, and what it says when the phone refuses.
 */

describe("sharing the screen from the app", () => {
  it("starts and stops the share through the engine", async () => {
    const engine = fakeEngine("HOST", [peer("a", "Aziza Karimova")]);
    await renderRoom(engine);
    await fireEvent.press(await screen.findByTestId("toggle-share"));
    expect(engine.shareScreen).toHaveBeenCalledTimes(1);

    await act(async () => {
      engine.change(() => {
        engine.media = { ...engine.media, screen: true };
      });
    });
    expect(await screen.findByTestId("share-started")).toBeTruthy();
    await fireEvent.press(screen.getByTestId("toggle-share"));
    expect(engine.stopScreen).toHaveBeenCalledTimes(1);
  });

  it("offers it to a student too, next to the hand", async () => {
    const engine = fakeEngine("STUDENT", [peer("t", "Demo Teacher", { role: "HOST" })]);
    await renderRoom(engine);
    expect(await screen.findByTestId("toggle-share")).toBeTruthy();
    expect(screen.getByTestId("toggle-hand")).toBeTruthy();
    expect(screen.getByTestId("leave")).toBeTruthy();
  });

  it("says why when the phone did not let the share start, until the line is closed", async () => {
    const engine = fakeEngine("HOST", [peer("a", "Aziza Karimova")]);
    engine.shareError = { reason: "blocked", at: 1 };
    await renderRoom(engine);
    const line = await screen.findByTestId("share-failed");
    expect(line).toHaveTextContent(/did not allow Kampus to capture the screen/);
    await fireEvent.press(screen.getByLabelText("Close"));
    expect(engine.dismissShareError).toHaveBeenCalledTimes(1);
  });
});
