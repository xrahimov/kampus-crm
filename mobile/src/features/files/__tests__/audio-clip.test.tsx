import { screen } from "@testing-library/react-native";
import type { AudioStatus } from "expo-audio";

import { AudioClip } from "@/features/files/audio-clip";
import { clearClients, renderScreen } from "@/features/student/test-support";

jest.mock("@react-native-async-storage/async-storage", () =>
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
jest.mock("expo-localization", () => ({ getLocales: () => [{ languageCode: "en" }] }));

/* A recording played in place (A-212). */

afterEach(() => {
  jest.restoreAllMocks();
  clearClients();
});

const clip = <AudioClip source={{ uri: "file:///r/answer.m4a" }} label="Answer" seconds={11} />;

describe("a recording just made", () => {
  it("shows how long it is before the player has read the file", async () => {
    jest
      .spyOn(jest.requireMock<typeof import("expo-audio")>("expo-audio"), "useAudioPlayerStatus")
      .mockReturnValue({ playing: false, currentTime: 0, duration: 0 } as AudioStatus);
    await renderScreen(clip);
    expect(await screen.findByText("0:00 / 0:11")).toBeTruthy();
  });

  it("goes by the player's own word once it has one", async () => {
    await renderScreen(clip);
    expect(await screen.findByText("0:00 / 0:12")).toBeTruthy();
  });
});
